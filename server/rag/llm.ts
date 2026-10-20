/**
 * 可选 LLM 增强（默认关闭）
 * ------------------------------------------------------------
 * 设计约束（来自 docs/PROJECT_BRIEF.md 与 docs/BACKEND_CONTRACT.md）：
 *  1. 只有配置了 `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` 才会发起网络请求；
 *     未配置时直接返回 null，由规则回答兜底，测试不依赖网络。
 *  2. 模型只负责“润色/组织已有证据”，不得新增事实、不得编造来源、不得给出诊断或用药剂量。
 *  3. 任何失败（网络错误、超时、非法 JSON、越界内容）都返回 null → 降级到规则回答。
 *  4. 引用（citations）完全沿用规则回答中已验证的来源，不接受模型新增引用。
 */
import type { ChatAnswer, ChatSection, ChatSectionKind } from '../../shared/types.js';
import { clip } from './text.js';

/* ========================================================================== */
/* 配置                                                                        */
/* ========================================================================== */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

type EnvLike = Record<string, string | undefined>;

/** 读取 LLM 配置；缺少任一必需项时返回 null（默认关闭） */
export function readLlmConfig(env: EnvLike = process.env): LlmConfig | null {
  const baseUrl = (env.LLM_BASE_URL ?? '').trim();
  const apiKey = (env.LLM_API_KEY ?? '').trim();
  const model = (env.LLM_MODEL ?? '').trim();
  if (!baseUrl || !apiKey || !model) return null;
  if (!/^https?:\/\//i.test(baseUrl)) return null;
  const timeoutRaw = Number.parseInt(env.LLM_TIMEOUT_MS ?? '', 10);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.min(timeoutRaw, 60_000) : 20_000;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model, timeoutMs };
}

export function isLlmEnabled(env: EnvLike = process.env): boolean {
  return readLlmConfig(env) != null;
}

/* ========================================================================== */
/* 校验结果的结构                                                              */
/* ========================================================================== */

const SECTION_KINDS: ChatSectionKind[] = [
  'why',
  'consequence',
  'prevention',
  'post-exposure',
  'treatment',
  'region',
  'season',
  'evidence',
  'note',
];

interface LlmPolished {
  title?: string;
  lead?: string;
  rationale?: string[];
  sections?: ChatSection[];
  followUps?: string[];
}

const FORBIDDEN_PATTERNS: RegExp[] = [
  /你(已经)?(感染|患)(了|上)?[^，。；]{0,8}(寄生虫|病)/,
  /(可以|已经)?确诊(为)?[^，。；]{0,10}/,
  /建议(服用|使用|吃|口服)[^，。；]{0,12}(药|mg|毫克)/i,
  /\d+\s*(mg|毫克|微克|μg|ug|g)\b/i,
  /(每(日|天)|疗程)[^，。；]{0,8}(片|粒|mg|毫克)/,
  /(处方|剂量为|按照说明书服用)/,
];

function hasForbiddenContent(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

function asStringArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const text = item.trim();
    if (!text) continue;
    out.push(clip(text, maxLength));
    if (out.length >= maxItems) break;
  }
  return out;
}

function parsePolished(raw: string): LlmPolished | null {
  let text = raw.trim();
  /* 容忍 ```json ... ``` 包裹 */
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const polished: LlmPolished = {};

  if (typeof obj.title === 'string' && obj.title.trim()) {
    const title = clip(obj.title.trim(), 40);
    if (hasForbiddenContent(title)) return null;
    polished.title = title;
  }
  if (typeof obj.lead === 'string' && obj.lead.trim()) {
    const lead = clip(obj.lead.trim(), 400);
    if (hasForbiddenContent(lead)) return null;
    polished.lead = lead;
  }
  const rationale = asStringArray(obj.rationale, 5, 160);
  if (rationale) {
    if (rationale.some((item) => hasForbiddenContent(item))) return null;
    polished.rationale = rationale;
  }

  if (Array.isArray(obj.sections)) {
    const sections: ChatSection[] = [];
    for (const item of obj.sections.slice(0, 7)) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const kind = record.kind;
      if (typeof kind !== 'string' || !SECTION_KINDS.includes(kind as ChatSectionKind)) continue;
      if (typeof record.title !== 'string' || !record.title.trim()) continue;
      const paragraphs = asStringArray(record.paragraphs, 5, 500) ?? [];
      const bullets = asStringArray(record.bullets, 6, 300) ?? undefined;
      const allText = [...paragraphs, ...(bullets ?? [])].join('\n');
      if (allText.trim() && hasForbiddenContent(allText)) return null;
      sections.push({
        kind: kind as ChatSectionKind,
        title: clip(record.title.trim(), 30),
        paragraphs,
        ...(bullets ? { bullets } : {}),
      });
    }
    if (sections.length > 0) polished.sections = sections;
  }

  const followUps = asStringArray(obj.followUps, 4, 60);
  if (followUps && followUps.length >= 2 && !followUps.some((item) => hasForbiddenContent(item))) {
    polished.followUps = followUps;
  }

  if (!polished.title && !polished.lead && !polished.sections && !polished.followUps && !polished.rationale) {
    return null;
  }
  return polished;
}

/* ========================================================================== */
/* 提示词                                                                      */
/* ========================================================================== */

const SYSTEM_PROMPT = [
  '你是「食源虫谱」网站的问答润色助手，服务于中国公众的食源性寄生虫科普。',
  '你的任务：改写给定的规则回答，使表达更自然、更易读，但必须严格遵守：',
  '1. 只使用给定的证据、风险判断与引用来源；不得新增任何医学事实、数字、地区或来源。',
  '2. 不得给出个人诊断（不要写“你已经感染/可以确诊”），不得推荐具体药物剂量或用药方案。',
  '3. 保留医学边界：已食用后的观察与就医提示必须与食前预防区分；资料不足必须写“资料不足/不代表没有风险”。',
  '4. 不要提及“知识库/规则引擎/模型”等技术细节，不要输出 Markdown 代码块。',
  '5. 只输出一个 JSON 对象，字段为：title（字符串）、lead（字符串）、sections（数组）、followUps（2-4 个字符串）、rationale（可选，字符串数组）。',
  '6. sections 每项字段：kind（只能是 why|consequence|prevention|post-exposure|treatment|region|season|evidence|note）、title、paragraphs（字符串数组）、bullets（可选字符串数组）。',
  '7. 所有文本使用简体中文；语气客观、克制，不使用恐吓性表述。',
].join('\n');

interface EnhanceInput {
  message: string;
  draft: ChatAnswer;
}

function buildUserPrompt(input: EnhanceInput): string {
  const draft = input.draft;
  const evidence = {
    verdict: draft.verdict
      ? {
          level: draft.verdict.level,
          label: draft.verdict.label,
          rationale: draft.verdict.rationale,
          parasiteIds: draft.verdict.parasiteIds,
        }
      : null,
    related: draft.related,
    citations: draft.citations.map((citation) => ({
      sourceId: citation.sourceId,
      title: citation.title,
      relevance: citation.relevance,
    })),
    draftAnswer: {
      title: draft.title,
      lead: draft.lead,
      sections: draft.sections,
      followUps: draft.followUps,
      clarify: draft.clarify,
    },
  };
  return [
    `用户问题：${input.message}`,
    '',
    '以下是规则回答与可用证据（JSON）；请在不改变事实与判断的前提下润色：',
    JSON.stringify(evidence, null, 2),
  ].join('\n');
}

/* ========================================================================== */
/* 调用与降级                                                                  */
/* ========================================================================== */

export interface EnhanceOptions {
  env?: EnvLike;
  /** 测试注入；默认使用全局 fetch */
  fetchImpl?: typeof fetch;
  now?: Date;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * 尝试用 LLM 润色规则回答。
 * 未配置 / 超时 / 网络错误 / 校验失败 → 返回 null（调用方继续使用规则回答）。
 */
export async function enhanceAnswer(input: EnhanceInput, options: EnhanceOptions = {}): Promise<ChatAnswer | null> {
  const config = readLlmConfig(options.env ?? process.env);
  if (!config) return null;
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;
    const polished = parsePolished(content);
    if (!polished) return null;
    return applyPolished(input.draft, polished);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 把通过校验的润色结果合并进规则回答（引用、上下文、免责声明保持不变） */
export function applyPolished(draft: ChatAnswer, polished: LlmPolished): ChatAnswer {
  const sections: ChatSection[] = polished.sections
    ? polished.sections.map((section) => ({
        ...section,
        paragraphs: section.paragraphs.filter((paragraph) => paragraph.trim().length > 0),
      }))
    : draft.sections;

  const verdict = draft.verdict && polished.rationale && polished.rationale.length > 0
    ? { ...draft.verdict, rationale: polished.rationale }
    : draft.verdict;

  return {
    ...draft,
    title: polished.title ?? draft.title,
    lead: polished.lead ?? draft.lead,
    sections: sections.length > 0 ? sections : draft.sections,
    followUps: polished.followUps ?? draft.followUps,
    verdict,
    generatedBy: 'llm',
  };
}
