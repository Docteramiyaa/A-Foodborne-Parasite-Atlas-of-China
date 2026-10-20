/**
 * 对话页本地状态工具
 * ------------------------------------------------------------
 * - 消息记录 / 结构化上下文（ChatContext）的会话级持久化（sessionStorage）
 * - 请求历史（最近 12 条）的构造
 * - 上下文合并与移除
 *
 * 隐私说明：对话只保存在当前浏览器标签页的 sessionStorage 中，
 * 关闭标签页即清除；不会写入服务端账号或长期存储。
 */
import type { ChatAnswer, ChatContext, ClarifyQuestion, PreparationTag, RiskVerdict } from '@shared/types';

export type HistoryTurn = { role: 'user' | 'assistant'; content: string };

export interface UserChatItem {
  id: string;
  role: 'user';
  content: string;
  /** 该条消息的请求失败（历史中不参与后续上下文） */
  failed?: boolean;
}

export interface AssistantChatItem {
  id: string;
  role: 'assistant';
  answer: ChatAnswer;
  at: number;
}

export interface ErrorChatItem {
  id: string;
  role: 'error';
  /** 面向用户的错误说明 */
  message: string;
  /** 重试时重新发送的文本 */
  retryText: string;
  /** 发送该消息时的历史快照（重试沿用，避免把失败轮次混入历史） */
  history: HistoryTurn[];
  /** 需要恢复 normal 状态的用户消息 id */
  retryUserId?: string;
  at: number;
}

export type ChatItem = UserChatItem | AssistantChatItem | ErrorChatItem;

export const EMPTY_CONTEXT: ChatContext = {
  provinceCodes: [],
  months: [],
  foodIds: [],
  preparationTags: [],
  parasiteIds: [],
  exposure: 'unknown',
  symptoms: [],
};

const PREPARATION_TAGS: PreparationTag[] = [
  'raw',
  'undercooked',
  'cured-smoked',
  'grilled',
  'fully-cooked',
  'boiled-water',
  'unwashed-produce',
  'unknown',
];

const EXPOSURES = ['before', 'after', 'unknown'] as const;

export function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* 忽略：回退到时间戳 id */
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function uniqPreparationTags(values: PreparationTag[]): PreparationTag[] {
  return Array.from(new Set(values));
}

/** 把任意来源（URL / 后端 / sessionStorage）的上下文归一化为完整 ChatContext */
export function normalizeContext(input: Partial<ChatContext> | null | undefined): ChatContext {
  if (!isRecord(input)) return { ...EMPTY_CONTEXT };
  const rawPrep = Array.isArray(input.preparationTags) ? input.preparationTags : [];
  const exposure = EXPOSURES.includes(input.exposure as (typeof EXPOSURES)[number])
    ? (input.exposure as ChatContext['exposure'])
    : 'unknown';
  const timeExpression =
    typeof input.timeExpression === 'string' && input.timeExpression.trim().length > 0
      ? input.timeExpression.trim().slice(0, 60)
      : undefined;
  return {
    provinceCodes: uniqStrings(stringArray(input.provinceCodes)),
    months: uniqNumbers(numberArray(input.months)).filter((m) => m >= 1 && m <= 12),
    foodIds: uniqStrings(stringArray(input.foodIds)),
    preparationTags: uniqPreparationTags(
      rawPrep.filter((t): t is PreparationTag => PREPARATION_TAGS.includes(t as PreparationTag)),
    ),
    parasiteIds: uniqStrings(stringArray(input.parasiteIds)),
    exposure,
    symptoms: uniqStrings(stringArray(input.symptoms).map((s) => s.slice(0, 40))),
    ...(timeExpression ? { timeExpression } : {}),
  };
}

/** 合并两份上下文（数组取并集；暴露状态以已知者为准；时间表达保留最新） */
export function mergeContext(base: ChatContext, patch: Partial<ChatContext> | null | undefined): ChatContext {
  const a = normalizeContext(base);
  const b = normalizeContext(patch);
  const exposure = b.exposure !== 'unknown' ? b.exposure : a.exposure;
  const timeExpression = b.timeExpression ?? a.timeExpression;
  return {
    provinceCodes: uniqStrings([...a.provinceCodes, ...b.provinceCodes]),
    months: uniqNumbers([...a.months, ...b.months]),
    foodIds: uniqStrings([...a.foodIds, ...b.foodIds]),
    preparationTags: uniqPreparationTags([...a.preparationTags, ...b.preparationTags]),
    parasiteIds: uniqStrings([...a.parasiteIds, ...b.parasiteIds]),
    exposure,
    symptoms: uniqStrings([...a.symptoms, ...b.symptoms]),
    ...(timeExpression ? { timeExpression } : {}),
  };
}

export function hasContextConditions(context: ChatContext): boolean {
  return (
    context.provinceCodes.length > 0 ||
    context.months.length > 0 ||
    context.foodIds.length > 0 ||
    context.preparationTags.length > 0 ||
    context.parasiteIds.length > 0 ||
    context.exposure !== 'unknown' ||
    context.symptoms.length > 0 ||
    Boolean(context.timeExpression)
  );
}

/** 助手回答压缩为请求历史中的一句话（供后端理解指代） */
export function answerToHistory(answer: ChatAnswer | null | undefined): string {
  if (!answer) return '';
  const parts: string[] = [];
  if (answer.title) parts.push(answer.title);
  if (answer.lead) parts.push(answer.lead);
  if (answer.verdict && typeof answer.verdict.label === 'string') parts.push(`风险判断：${answer.verdict.label}。`);
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 600);
}

/** 由当前消息列表构造最近 12 条请求历史 */
export function buildHistory(items: ChatItem[], endExclusive?: number): HistoryTurn[] {
  const limit = typeof endExclusive === 'number' ? Math.min(endExclusive, items.length) : items.length;
  const turns: HistoryTurn[] = [];
  for (let i = 0; i < limit; i += 1) {
    const item = items[i];
    if (item.role === 'user') {
      if (item.failed) continue;
      turns.push({ role: 'user', content: item.content });
    } else if (item.role === 'assistant') {
      const content = answerToHistory(item.answer);
      if (content) turns.push({ role: 'assistant', content });
    }
  }
  return turns.slice(-12);
}

/* ------------------------------------------------------------------ */
/* 会话持久化（sessionStorage）                                         */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'atlas.chat.session.v1';
const MAX_STORED_ITEMS = 40;
const MAX_PAYLOAD_CHARS = 900_000;

export interface ChatSession {
  items: ChatItem[];
  context: ChatContext;
}

function coerceVerdict(raw: unknown): RiskVerdict | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.level !== 'string' || typeof raw.label !== 'string') return null;
  return {
    level: raw.level as RiskVerdict['level'],
    label: raw.label,
    rationale: stringArray(raw.rationale),
    parasiteIds: stringArray(raw.parasiteIds),
    hasDocumentedRisk: Boolean(raw.hasDocumentedRisk),
  };
}

function coerceClarify(raw: unknown): ClarifyQuestion | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.question !== 'string' || typeof raw.field !== 'string' || !Array.isArray(raw.options)) return null;
  const options = raw.options
    .filter((o): o is Record<string, unknown> => isRecord(o) && typeof o.label === 'string')
    .map((o) => ({
      label: o.label as string,
      value: typeof o.value === 'string' ? o.value : (o.label as string),
      ...(typeof o.hint === 'string' ? { hint: o.hint } : {}),
    }));
  if (options.length === 0) return null;
  return {
    question: raw.question,
    field: raw.field as ClarifyQuestion['field'],
    options,
  };
}

/** 校验并补齐后端返回的 ChatAnswer（字段缺失时安全降级，供渲染使用） */
export function normalizeAnswer(raw: unknown): ChatAnswer | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.title !== 'string' && typeof raw.lead !== 'string') return null;
  return {
    intent: (typeof raw.intent === 'string' ? raw.intent : 'knowledge') as ChatAnswer['intent'],
    secondaryIntents: Array.isArray(raw.secondaryIntents) ? (raw.secondaryIntents as ChatAnswer['secondaryIntents']) : [],
    title: typeof raw.title === 'string' ? raw.title : '知识库回答',
    lead: typeof raw.lead === 'string' ? raw.lead : '',
    verdict: coerceVerdict(raw.verdict),
    sections: Array.isArray(raw.sections)
      ? raw.sections
          .filter((s): s is Record<string, unknown> => isRecord(s) && typeof s.kind === 'string')
          .map((s) => ({
            kind: s.kind as ChatAnswer['sections'][number]['kind'],
            title: typeof s.title === 'string' ? s.title : '',
            paragraphs: stringArray(s.paragraphs),
            bullets: Array.isArray(s.bullets) ? stringArray(s.bullets) : undefined,
            parasiteIds: Array.isArray(s.parasiteIds) ? stringArray(s.parasiteIds) : undefined,
            sourceIds: Array.isArray(s.sourceIds) ? stringArray(s.sourceIds) : undefined,
          }))
      : [],
    followUps: stringArray(raw.followUps),
    clarify: coerceClarify(raw.clarify),
    citations: Array.isArray(raw.citations)
      ? raw.citations
          .filter((c): c is Record<string, unknown> => isRecord(c) && typeof c.sourceId === 'string')
          .map((c) => ({
            sourceId: c.sourceId as string,
            title: typeof c.title === 'string' ? c.title : (c.sourceId as string),
            ...(typeof c.venue === 'string' ? { venue: c.venue } : {}),
            ...(typeof c.year === 'string' || typeof c.year === 'number' ? { year: c.year } : {}),
            reliability:
              c.reliability === 'high' || c.reliability === 'medium' || c.reliability === 'reference'
                ? c.reliability
                : 'reference',
            relevance: typeof c.relevance === 'string' ? c.relevance : '',
            ...(typeof c.url === 'string' ? { url: c.url } : {}),
          }))
      : [],
    context: normalizeContext(isRecord(raw.context) ? (raw.context as Partial<ChatContext>) : null),
    related: isRecord(raw.related)
      ? {
          parasiteIds: stringArray(raw.related.parasiteIds),
          foodIds: stringArray(raw.related.foodIds),
          regionCodes: stringArray(raw.related.regionCodes),
          sourceIds: stringArray(raw.related.sourceIds),
          ruleIds: stringArray(raw.related.ruleIds),
        }
      : { parasiteIds: [], foodIds: [], regionCodes: [], sourceIds: [], ruleIds: [] },
    mapQuery: isRecord(raw.mapQuery)
      ? {
          provinceCodes: stringArray(raw.mapQuery.provinceCodes),
          foodIds: stringArray(raw.mapQuery.foodIds),
          months: numberArray(raw.mapQuery.months),
          parasiteIds: stringArray(raw.mapQuery.parasiteIds),
          preparationTags: stringArray(raw.mapQuery.preparationTags) as PreparationTag[],
        }
      : null,
    disclaimer:
      typeof raw.disclaimer === 'string' && raw.disclaimer.trim()
        ? raw.disclaimer
        : '以上内容来自知识库公开资料，不构成医疗诊断或治疗建议。',
    generatedBy: raw.generatedBy === 'llm' ? 'llm' : 'rules',
    ...(typeof raw.elapsedMs === 'number' ? { elapsedMs: raw.elapsedMs } : {}),
  };
}

function coerceItems(raw: unknown): ChatItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ChatItem[] = [];
  for (const entry of raw.slice(-MAX_STORED_ITEMS)) {
    if (!isRecord(entry)) continue;
    if (entry.role === 'user' && typeof entry.content === 'string' && entry.content.trim()) {
      items.push({
        id: typeof entry.id === 'string' ? entry.id : makeId(),
        role: 'user',
        content: entry.content.slice(0, 1200),
        ...(entry.failed ? { failed: true } : {}),
      });
    } else if (entry.role === 'assistant') {
      const answer = normalizeAnswer(entry.answer);
      if (answer) {
        items.push({
          id: typeof entry.id === 'string' ? entry.id : makeId(),
          role: 'assistant',
          answer,
          at: typeof entry.at === 'number' ? entry.at : Date.now(),
        });
      }
    } else if (entry.role === 'error' && typeof entry.message === 'string' && typeof entry.retryText === 'string') {
      items.push({
        id: typeof entry.id === 'string' ? entry.id : makeId(),
        role: 'error',
        message: entry.message.slice(0, 500),
        retryText: entry.retryText.slice(0, 1000),
        history: Array.isArray(entry.history)
          ? entry.history
              .filter((h): h is Record<string, unknown> => isRecord(h) && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
              .map((h) => ({ role: h.role as HistoryTurn['role'], content: h.content as string }))
              .slice(-12)
          : [],
        ...(typeof entry.retryUserId === 'string' ? { retryUserId: entry.retryUserId } : {}),
        at: typeof entry.at === 'number' ? entry.at : Date.now(),
      });
    }
  }
  return items;
}

/** 读取并校验会话；任何异常都安全降级为 null */
export function loadSession(): ChatSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const items = coerceItems(parsed.items);
    const context = normalizeContext(isRecord(parsed.context) ? (parsed.context as Partial<ChatContext>) : null);
    if (items.length === 0 && !hasContextConditions(context)) return null;
    return { items, context };
  } catch {
    return null;
  }
}

function trimItems(items: ChatItem[]): ChatItem[] {
  return items.slice(-MAX_STORED_ITEMS);
}

/** 保存会话；容量不足时自动裁剪，绝不向页面抛错 */
export function saveSession(session: ChatSession): void {
  try {
    const base = { version: 1, savedAt: Date.now(), context: session.context };
    let payload = JSON.stringify({ ...base, items: trimItems(session.items) });
    if (payload.length > MAX_PAYLOAD_CHARS) {
      payload = JSON.stringify({ ...base, items: trimItems(session.items).slice(-14) });
    }
    if (payload.length > MAX_PAYLOAD_CHARS * 2) return;
    window.sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 忽略存储异常（隐私模式 / 配额） */
    }
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}
