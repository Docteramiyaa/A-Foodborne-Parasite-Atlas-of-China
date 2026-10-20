/**
 * 中文文本工具（纯函数）
 * ------------------------------------------------------------
 * 供 NLU、检索与回答组装复用：规范化（全角→半角、英文小写、去 emoji/控制符）、
 * 中文一元/二元切分、关键词匹配、截断与安全正则等。
 *
 * 设计约束：
 *  - 全部为确定性纯函数，不依赖网络/时间/随机数；
 *  - 不引入第三方分词库（离线可跑、无安装依赖）；
 *  - 中文按“字 + 二连字”切分，配合“实体/别名最长匹配”已足以支撑本项目的检索。
 */

/**
 * 中文功能字停用表（单字层面）。
 * 只放虚词/代词等无检索价值的字，避免“的了吗”等噪声主导打分；
 * 注意不要放入 生/熟/虫/医/风/险 等有语义的字。
 */
const STOP_UNIGRAMS = new Set(
  '的了呢吧啊呀哦嗯么是在有和与或我你他她它们这那请问能会要就都也还又才而及等个些样如何为对从到被把让给但所以因为而且并且然后没有不很太更最'.split(''),
);

/** 把全角字符（含全角空格）转换为半角 */
export function toHalfwidth(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x3000) out += ' ';
    else if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0);
    else out += ch;
  }
  return out;
}

const EMOJI_RE =
  /[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}\u{2b00}-\u{2bff}\u{fe0f}\u{fe0e}\u{200d}\u{20e3}\u{e0020}-\u{e007f}]/gu;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/**
 * 规范化用户输入：
 *  1. Unicode NFKC（全角字母/数字/部分符号 → 半角）
 *  2. 全角空格 → 半角空格
 *  3. 英文转小写
 *  4. 去除 emoji、控制符、零宽字符
 *  5. 连续空白折叠为单个空格
 */
export function normalizeText(input: string): string {
  if (!input) return '';
  let text = input;
  try {
    text = text.normalize('NFKC');
  } catch {
    /* 忽略：极端环境下 normalize 不可用时继续 */
  }
  text = toHalfwidth(text);
  text = text.replace(EMOJI_RE, ' ');
  text = text.replace(CONTROL_RE, ' ');
  text = text.toLowerCase();
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** 是否包含有意义的字符（中文/字母/数字） */
export function hasMeaningfulContent(text: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff0-9a-z]/.test(text);
}

/** 截断到 max 个字符（按 Unicode 码点），超出时补省略号并返回 truncated 标记 */
export function truncateText(input: string, max: number): { text: string; truncated: boolean } {
  const chars = Array.from(input);
  if (chars.length <= max) return { text: input, truncated: false };
  return { text: chars.slice(0, max).join(''), truncated: true };
}

/** 安全截断（展示用，不标记） */
export function clip(input: string, max: number): string {
  const { text, truncated } = truncateText(input.trim(), max);
  return truncated ? `${text}…` : text;
}

/** 取第一句（中文按 。！？； 切分，英文按 .!? 切分） */
export function firstSentence(text: string, max = 120): string {
  const clean = (text || '').trim();
  if (!clean) return '';
  const m = clean.match(/^[\s\S]*?[。！？!?；;]/);
  const sentence = m ? m[0] : clean;
  return clip(sentence, max);
}

/** 正则转义 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 去重并保持首次出现顺序 */
export function uniq<T>(items: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** 按给定权重排序去重（保留分值最高的一项） */
export function uniqBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 中文切分                                                                    */
/* -------------------------------------------------------------------------- */

const CJK_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]+/g;
const WORD_RE = /[a-z0-9][a-z0-9._-]*/g;

export interface QueryTokens {
  /** 中文单字（已过滤停用字） */
  unigrams: string[];
  /** 中文二连字 */
  bigrams: string[];
  /** 英文/数字词 */
  words: string[];
}

/** 把任意文本切成中文单字/二连字/英文词 */
export function tokenize(text: string): QueryTokens {
  const normalized = normalizeText(text).replace(/[，。！？、；：（）【】《》“”‘’…—·,.;:!?()\[\]{}"'<>/\\|@#$%^&*+=~`]/g, ' ');
  const unigrams: string[] = [];
  const bigrams: string[] = [];
  for (const run of normalized.match(CJK_RUN_RE) ?? []) {
    const chars = Array.from(run);
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i]!;
      if (!STOP_UNIGRAMS.has(ch)) unigrams.push(ch);
      if (i + 1 < chars.length) bigrams.push(chars[i]! + chars[i + 1]!);
    }
  }
  const words = normalized.match(WORD_RE) ?? [];
  const wordOut = words.filter((w) => w.length >= 2 && !/^\d+$/.test(w));
  return {
    unigrams: uniq(unigrams),
    bigrams: uniq(bigrams),
    words: uniq(wordOut),
  };
}

/** 为一个文本块建立 token 集合（检索时预先构建，避免重复切分） */
export interface TextTokenSet {
  unigrams: Set<string>;
  bigrams: Set<string>;
  words: Set<string>;
  length: number;
}

export function buildTokenSet(text: string): TextTokenSet {
  const tokens = tokenize(text);
  return {
    unigrams: new Set(tokens.unigrams),
    bigrams: new Set(tokens.bigrams),
    words: new Set(tokens.words),
    length: text.length,
  };
}

/** 查询 token 在文本集合中的命中得分（中文二连字权重高、单字权重低） */
export function overlapScore(
  query: QueryTokens,
  target: TextTokenSet,
  weights: { bigram?: number; unigram?: number; word?: number } = {},
): number {
  const wb = weights.bigram ?? 1;
  const wu = weights.unigram ?? 0.25;
  const ww = weights.word ?? 1.5;
  let score = 0;
  for (const token of query.bigrams) if (target.bigrams.has(token)) score += wb;
  for (const token of query.unigrams) if (target.unigrams.has(token)) score += wu;
  for (const token of query.words) if (target.words.has(token)) score += ww;
  return score;
}

/** 文本是否包含任一关键词 */
export function containsAny(text: string, words: readonly string[]): boolean {
  for (const word of words) if (word && text.includes(word)) return true;
  return false;
}

/** 从文本中查找关键词（按长度降序、互不重叠地匹配），返回命中词（按出现顺序） */
export function findKeywords(
  text: string,
  keywords: readonly string[],
): { keyword: string; index: number }[] {
  const hits: { keyword: string; index: number; end: number }[] = [];
  const sorted = [...new Set(keywords.filter((k) => k && k.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  for (const keyword of sorted) {
    let from = 0;
    for (;;) {
      const index = text.indexOf(keyword, from);
      if (index < 0) break;
      hits.push({ keyword, index, end: index + keyword.length });
      from = index + 1;
    }
  }
  hits.sort((a, b) => (a.index === b.index ? b.end - a.end : a.index - b.index));
  const chosen: { keyword: string; index: number }[] = [];
  const occupied: { start: number; end: number }[] = [];
  for (const hit of hits) {
    const overlaps = occupied.some((span) => hit.index < span.end && hit.end > span.start);
    if (overlaps) continue;
    occupied.push({ start: hit.index, end: hit.end });
    chosen.push({ keyword: hit.keyword, index: hit.index });
  }
  return chosen.sort((a, b) => a.index - b.index);
}

/** 按关键词把文本切分为片段（用于 A/B 对比类问句） */
export function splitBySeparators(
  text: string,
  separators: readonly string[],
): { left: string; right: string; separator: string } | null {
  for (const sep of separators) {
    const index = text.indexOf(sep);
    if (index > 0 && index + sep.length < text.length) {
      return {
        left: text.slice(0, index),
        right: text.slice(index + sep.length),
        separator: sep,
      };
    }
  }
  return null;
}

/** 中文数字转阿拉伯数字（支持 1–99，用于“十一月”“下个月”之外的场景） */
export function chineseNumberToInt(input: string): number | null {
  const digits: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  const text = input.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  if (text === '十') return 10;
  const tenIndex = text.indexOf('十');
  if (tenIndex >= 0) {
    const before = text.slice(0, tenIndex);
    const after = text.slice(tenIndex + 1);
    const tens = before ? digits[before] : 1;
    const ones = after ? digits[after] : 0;
    if (tens == null || ones == null) return null;
    return tens * 10 + ones;
  }
  return digits[text] ?? null;
}
