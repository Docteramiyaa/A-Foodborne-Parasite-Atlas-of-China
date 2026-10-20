/**
 * 对话服务入口
 * ------------------------------------------------------------
 * `handleChat` 负责：参数校验 → 限流 → NLU → 检索 → 回答组装 → 可选 LLM 润色。
 *
 * 容错原则：
 *  - 参数非法抛 ChatError（路由转为 400）；
 *  - 超限抛 ChatError（路由转为 429 + Retry-After）；
 *  - 其余任何内部异常都降级为规则回答，绝不向用户抛 500。
 */
import type { ChatContext, ChatRequest, ChatResponse } from '../../shared/types.js';
import { getStore, type KnowledgeStore } from '../data/store.js';
import {
  analyzeMessage,
  buildLexicon,
  emptyContext,
  normalizeContext,
  type NluLexicon,
} from './nlu.js';
import {
  buildIndex,
  type RagIndex,
  type RagKnowledge,
} from './knowledge.js';
import { retrieveForIntent } from './retriever.js';
import {
  composeAnswer,
  composeFallbackAnswer,
  mergeContext,
  buildExampleQuestions,
} from './composer.js';
import { enhanceAnswer } from './llm.js';

/* ========================================================================== */
/* 错误类型                                                                    */
/* ========================================================================== */

export type ChatErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_MESSAGE'
  | 'INVALID_BODY'
  | 'RATE_LIMITED'
  | 'NOT_FOUND';

export class ChatError extends Error {
  readonly statusCode: number;
  readonly code: ChatErrorCode;
  readonly retryAfterSec?: number;

  constructor(statusCode: number, code: ChatErrorCode, message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'ChatError';
    this.statusCode = statusCode;
    this.code = code;
    if (retryAfterSec != null) this.retryAfterSec = retryAfterSec;
  }
}

/* ========================================================================== */
/* 限流（内存滑动窗口，单进程）                                                 */
/* ========================================================================== */

export const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, { windowStart: number; count: number }>();

export interface HandleChatOptions {
  /** 便于注入数据仓库固定时间 */
  now?: Date;
  /** 便于注入数据仓库 store（生产不传，使用 服务端 的 getStore） */
  store?: RagKnowledge;
  /** 便于测试跳过限流 */
  skipRateLimit?: boolean;
  /** 客户端 IP，用于限流 */
  ip?: string;
}

function checkRateLimit(ip: string, now: Date, skip = false): void {
  if (skip) return;
  const key = ip || 'unknown';
  const nowMs = now.getTime();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || nowMs - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { windowStart: nowMs, count: 1 });
    if (rateLimitBuckets.size > 5000) {
      for (const [bucketKey, value] of rateLimitBuckets) {
        if (nowMs - value.windowStart >= RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(bucketKey);
      }
    }
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_PER_MINUTE) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - nowMs) / 1000));
    throw new ChatError(
      429,
      'RATE_LIMITED',
      `请求过于频繁，请 ${retryAfterSec} 秒后再试。`,
      retryAfterSec,
    );
  }
}

/** 测试用：清空限流桶 */
export function resetRateLimitForTests(): void {
  rateLimitBuckets.clear();
}

/* ========================================================================== */
/* 知识库解析                                                                  */
/* ========================================================================== */

const EMPTY_KNOWLEDGE: RagKnowledge = {
  parasites: [],
  foods: [],
  regions: [],
  rules: [],
  sources: [],
  suggestions: [],
  knowledgeChunks: [],
};

let storeWarningLogged = false;

/**
 * 获取知识视图：
 *  1. 优先使用调用方注入的 store（测试/其他服务复用）；
 *  2. 否则使用数据层单例 `getStore()`（BACKEND_CONTRACT 契约）；
 *  3. 数据层异常时返回空知识视图，保证对话接口降级可用、不崩溃。
 */
function loadKnowledge(injected?: RagKnowledge): RagKnowledge {
  if (injected) return injected;
  try {
    return getStore() as KnowledgeStore;
  } catch (error) {
    if (!storeWarningLogged) {
      storeWarningLogged = true;
      console.warn('[chat] 未能加载数据层 store，对话将使用空知识降级运行：', (error as Error)?.message);
    }
    return EMPTY_KNOWLEDGE;
  }
}

/* 索引与词典缓存：数据层单例不变时复用，避免每次请求重复构建 */
const indexCache = new WeakMap<object, RagIndex>();
const lexiconCache = new WeakMap<object, NluLexicon>();

export function getIndex(knowledge: RagKnowledge): RagIndex {
  const cached = indexCache.get(knowledge as object);
  if (cached) return cached;
  const index = buildIndex(knowledge);
  indexCache.set(knowledge as object, index);
  return index;
}

function getLexicon(knowledge: RagKnowledge): NluLexicon {
  const cached = lexiconCache.get(knowledge as object);
  if (cached) return cached;
  const lexicon = buildLexicon(knowledge);
  lexiconCache.set(knowledge as object, lexicon);
  return lexicon;
}

/* ========================================================================== */
/* 参数校验                                                                    */
/* ========================================================================== */

interface ValidatedRequest {
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  context: ChatContext;
}

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY = 12;

export function validateChatRequest(input: unknown): ValidatedRequest {
  if (!input || typeof input !== 'object') {
    throw new ChatError(400, 'INVALID_BODY', '请求体必须是 JSON 对象。');
  }
  const request = input as Partial<ChatRequest>;
  if (typeof request.message !== 'string') {
    throw new ChatError(400, 'INVALID_MESSAGE', 'message 必须是 1–1000 字符的字符串。');
  }
  const message = request.message.trim();
  if (message.length === 0) {
    throw new ChatError(400, 'INVALID_MESSAGE', 'message 不能为空。');
  }
  if (Array.from(message).length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(400, 'INVALID_MESSAGE', `message 不能超过 ${MAX_MESSAGE_LENGTH} 字符。`);
  }

  const history: ValidatedRequest['history'] = [];
  if (request.history != null) {
    if (!Array.isArray(request.history)) {
      throw new ChatError(400, 'INVALID_BODY', 'history 必须是数组。');
    }
    for (const item of request.history.slice(-MAX_HISTORY)) {
      if (!item || typeof item !== 'object') continue;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
        history.push({ role, content: content.slice(0, MAX_MESSAGE_LENGTH) });
      }
    }
  }

  /* context 采用宽松清洗：非法字段丢弃而不是让整次对话失败 */
  const context = normalizeContext(request.context ?? null);
  return { message, history, context };
}

/* ========================================================================== */
/* 主流程                                                                      */
/* ========================================================================== */

export async function handleChat(
  request: ChatRequest,
  options: HandleChatOptions = {},
): Promise<ChatResponse> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  try {
    const validated = validateChatRequest(request);
    checkRateLimit(options.ip ?? 'unknown', now, options.skipRateLimit);

    const knowledge = loadKnowledge(options.store);
    const index = getIndex(knowledge);
    const lexicon = getLexicon(knowledge);

    const nlu = analyzeMessage(validated.message, {
      now,
      lexicon,
      previousContext: validated.context,
      history: validated.history,
    });
    const mergedContext = mergeContext(validated.context, nlu.context, nlu);
    const effectiveNlu = { ...nlu, context: mergedContext };

    const retrieval = retrieveForIntent(index, effectiveNlu, effectiveNlu.primaryIntent);
    let answer = composeAnswer({
      index,
      nlu: effectiveNlu,
      retrieval,
      previousContext: validated.context,
      now,
    });

    /* 可选 LLM 润色：未配置/失败时保持规则回答 */
    const polished = await enhanceAnswer({ message: validated.message, draft: answer }).catch(() => null);
    if (polished) answer = polished;

    answer.elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      answer,
      context: answer.context,
      suggestions: answer.followUps.length > 0 ? answer.followUps : buildExampleQuestions(index, 4),
    };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    console.error('[chat] 处理异常，降级为规则回答：', error);
    let index: RagIndex | null = null;
    try {
      index = getIndex(loadKnowledge(options.store));
    } catch {
      index = null;
    }
    const fallback = composeFallbackAnswer(index, now);
    fallback.elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      answer: fallback,
      context: emptyContext(),
      suggestions: fallback.followUps,
    };
  }
}

/* ========================================================================== */
/* 建议问题                                                                    */
/* ========================================================================== */

/** 对话页初始建议问题（4–6 条，与当前数据相关） */
export async function getChatSuggestions(options: { store?: RagKnowledge } = {}): Promise<string[]> {
  try {
    const knowledge = loadKnowledge(options.store);
    const index = getIndex(knowledge);
    const questions = buildExampleQuestions(index, 6);
    return questions.slice(0, 6);
  } catch {
    return [
      '生吃三文鱼有风险吗？',
      '涮羊肉安全吗？',
      '吃福寿螺要注意什么？',
      '生吃荸荠会感染寄生虫吗？',
      '喝生水有什么风险？',
      '肝吸虫感染后有什么症状？',
    ];
  }
}

/** 路由内部异常时的兜底 ChatResponse（保证 200，不 500） */
export function degradedChatResponse(now = new Date()): ChatResponse {
  const answer = composeFallbackAnswer(null, now);
  return { answer, context: emptyContext(), suggestions: answer.followUps };
}

