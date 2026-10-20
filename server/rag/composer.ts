/**
 * 回答组装（ChatAnswer）
 * ------------------------------------------------------------
 * 把 NLU 条件 + 检索结果组织成面向公众的结构化中文回答：
 *   先直接回答 → 为什么 → 可能后果 → 预防/应对 → 地区/季节 → 资料依据 → 说明
 *
 * 硬约束：
 *  1. 输出严格符合 shared/types.ts 的 ChatAnswer；
 *  2. 风险等级只能是 high/moderate/low/contextual/unknown，label 使用固定文案；
 *  3. citations 只能引用知识库中真实存在的来源（最多 6 条）；
 *  4. 不给出个人诊断、不推荐具体用药剂量；已食用后的建议与食前预防分开；
 *  5. 资料不足时明确说“资料不足/不代表没有风险”，不把缺失当无风险；
 *  6. 关键条件缺失时优先追问（最多 1 个 clarify），不凭空假设。
 */
import type {
  ChatAnswer,
  ChatCitation,
  ChatContext,
  ChatIntent,
  ChatSection,
  ChatSectionKind,
  ClarifyQuestion,
  PreparationTag,
  RiskLevel,
  RiskVerdict,
  Severity,
} from '../../shared/types.js';
import type { RagIndex } from './knowledge.js';
import { PREPARATION_LABELS, provinceDisplayName } from './knowledge.js';
import type {
  ConsequenceItem,
  FoodHit,
  KnowledgeItem,
  ParasiteHit,
  RegionHit,
  RetrievalResult,
  RuleMatch,
} from './retriever.js';
import type { NluResult } from './nlu.js';
import { hasMeaningfulContent, clip, firstSentence, uniq } from './text.js';

/* ========================================================================== */
/* 常量与文案                                                                  */
/* ========================================================================== */

export const DISCLAIMER_BASE =
  '本回答基于知识库资料整理，不构成医疗诊断或治疗建议；如出现严重或持续症状，请及时就医。';

const DISCLAIMER_EXTRA: Partial<Record<ChatIntent, string>> = {
  'post-exposure': '本回答不能替代医生的面诊与检查；如已出现不适，请尽快就医并告知医生近期饮食史。',
  treatment: '具体用药、剂量与疗程须由医生根据诊断决定，请勿自行用药。',
  symptoms: '仅凭症状不能判断是否感染，需要结合饮食史与医学检查，由医生评估。',
};

const VERDICT_LABELS: Record<RiskLevel, string> = {
  high: '存在明确的高风险组合',
  moderate: '需要特别注意',
  low: '风险较低',
  contextual: '取决于具体条件',
  unknown: '资料不足',
};

const RISK_RANK: Record<RiskLevel, number> = { high: 4, moderate: 3, contextual: 2, low: 1, unknown: 0 };

const SEVERITY_LABELS: Record<Severity, string> = {
  mild: '通常较轻',
  moderate: '中度',
  severe: '可能较重',
  'life-threatening': '可能危及生命',
  variable: '因人而异',
};

const REGION_STATUS_LABELS: Record<string, string> = {
  endemic: '地方性流行 / 高流行',
  'high-burden': '高发区 / 主要流行区',
  reported: '有省级病例或调查记载',
  'national-context': '仅有全国性资料',
  limited: '资料有限',
  'not-reported': '文献未见报道（不等于无风险）',
  unknown: '未知',
};

const PREP_RISK: Record<PreparationTag, RiskLevel> = {
  raw: 'high',
  undercooked: 'moderate',
  'cured-smoked': 'contextual',
  grilled: 'contextual',
  'fully-cooked': 'low',
  'boiled-water': 'low',
  'unwashed-produce': 'moderate',
  unknown: 'unknown',
};

const PREP_EXPLAIN: Partial<Record<PreparationTag, string>> = {
  raw: '未经加热直接食用，寄生虫囊蚴/幼虫通常无法被杀灭；酱油、芥末、白酒、醋等调味不能替代加热。',
  undercooked: '涮、烫、快炒、短时煎烤等做法可能使中心温度不足，风险取决于火候、食材大小与时间。',
  'cured-smoked': '腌腊、烟熏、风干等工艺可能只抑制而不能灭活寄生虫，是否安全取决于盐度、温度与时间。',
  grilled: '明火烧烤表面容易焦熟，但大块肉、整鱼或螺类的中心温度可能不足。',
  'fully-cooked': '充分加热（中心温度达到灭活条件）是降低已知寄生虫风险最可靠的方式；仍需注意生熟分开，避免交叉污染。',
  'boiled-water': '将水煮沸可灭活水中原虫包囊等；野外还需注意容器与水源的二次污染。',
  'unwashed-produce': '未洗净或未去皮的蔬果可能带有寄生虫卵、包囊或囊蚴，充分清洗/去皮可降低风险。',
};

const PREP_SHORT: Record<PreparationTag, string> = {
  raw: '生食',
  undercooked: '半生 / 欠火候',
  'cured-smoked': '腌腊烟熏',
  grilled: '烧烤',
  'fully-cooked': '充分加热',
  'boiled-water': '煮沸',
  'unwashed-produce': '未洗净生食',
  unknown: '做法未知',
};

const DEFAULT_QUESTIONS = [
  '生吃三文鱼有风险吗？',
  '涮羊肉安全吗？',
  '福寿螺怎么吃才安全？',
  '生吃荸荠会感染寄生虫吗？',
  '喝生水要注意什么？',
  '肝吸虫感染后有什么症状？',
  '已经吃了生鱼片，现在该怎么办？',
  '哪些省份有华支睾吸虫的流行记载？',
];

/* ========================================================================== */
/* 上下文合并                                                                  */
/* ========================================================================== */

/**
 * 合并上一轮与本轮上下文：
 *  - 新信息覆盖旧信息；未提及字段沿用上一轮；
 *  - 用户否定/纠正时覆盖（例如“不是生的”会清除上一轮的 raw）；
 *  - 食物切换时不再沿用上一轮的处理方式，避免把“生鱼片”的做法套到新食物上；
 *  - 症状按并集累积（同一会话中陆续补充）。
 */
export function mergeContext(
  previous: ChatContext | null | undefined,
  current: ChatContext,
  nlu?: Pick<NluResult, 'negationNotes'>,
): ChatContext {
  const prev = previous ?? {
    provinceCodes: [],
    months: [],
    foodIds: [],
    preparationTags: [],
    parasiteIds: [],
    exposure: 'unknown',
    symptoms: [],
  } satisfies ChatContext;

  const foodChanged =
    current.foodIds.length > 0 && !current.foodIds.some((id) => prev.foodIds.includes(id));

  let preparationTags: PreparationTag[];
  if (current.preparationTags.length > 0) preparationTags = current.preparationTags;
  else if (foodChanged) preparationTags = [];
  else preparationTags = prev.preparationTags;

  /* “不是生的/不吃生的” → 清除上一轮的生食标签 */
  if (nlu?.negationNotes.some((note) => note.includes('不按生食处理'))) {
    preparationTags = preparationTags.filter((tag) => tag !== 'raw');
  }

  const symptoms = uniq([...prev.symptoms, ...current.symptoms]).slice(0, 20);

  const months = current.months.length > 0 ? current.months : prev.months;
  const provinceCodes = current.provinceCodes.length > 0 ? current.provinceCodes : prev.provinceCodes;
  const foodIds = current.foodIds.length > 0 ? current.foodIds : prev.foodIds;
  const parasiteIds =
    current.parasiteIds.length > 0
      ? current.parasiteIds
      : foodChanged || preparationTags.length !== prev.preparationTags.length
        ? []
        : prev.parasiteIds;

  const exposure =
    current.exposure !== 'unknown'
      ? current.exposure
      : prev.exposure !== 'unknown'
        ? prev.exposure
        : 'unknown';

  const timeExpression = current.timeExpression ?? prev.timeExpression;

  return {
    provinceCodes,
    months,
    foodIds,
    preparationTags,
    parasiteIds,
    exposure,
    symptoms,
    ...(timeExpression ? { timeExpression } : {}),
  };
}

/** 上下文为空判断 */
export function isEmptyContext(context: ChatContext): boolean {
  return (
    context.provinceCodes.length === 0 &&
    context.months.length === 0 &&
    context.foodIds.length === 0 &&
    context.preparationTags.length === 0 &&
    context.parasiteIds.length === 0 &&
    context.symptoms.length === 0 &&
    context.exposure === 'unknown'
  );
}

/* ========================================================================== */
/* 展示辅助                                                                    */
/* ========================================================================== */

function parasiteNames(hits: ParasiteHit[], limit = 3): string[] {
  return hits.slice(0, limit).map((hit) => hit.parasite.name);
}

function foodNames(hits: FoodHit[], limit = 3): string[] {
  return hits.slice(0, limit).map((hit) => hit.food.name);
}

function prepLabels(tags: PreparationTag[], limit = 3): string[] {
  return tags.slice(0, limit).map((tag) => PREP_SHORT[tag] ?? tag);
}

function joinNames(items: string[], fallback = ''): string {
  if (items.length === 0) return fallback;
  return items.join('、');
}

function monthText(months: number[]): string {
  if (months.length === 0) return '';
  return months.map((month) => `${month} 月`).join('、');
}

/** 用户是否明确给出了“季节/月份”类时间（而不是“昨天/最近”这类暴露时间） */
function hasSeasonalTime(nlu: NluResult): boolean {
  const expression = nlu.context.timeExpression ?? '';
  if (/月|季|春|夏|秋|冬|春节|过年|下个|上个|这个月|本月/.test(expression)) return true;
  return /\d{1,2}\s*月/.test(nlu.normalizedText);
}

/** 本轮相对上一轮新增的处理方式标签 */
function newlyAddedPreparationTags(
  current: PreparationTag[],
  previous?: ChatContext | null,
): PreparationTag[] {
  const prev = previous?.preparationTags ?? [];
  return current.filter((tag) => !prev.includes(tag));
}

function uniqueSourceIds(items: { sourceIds?: string[] }[]): string[] {
  const ids: string[] = [];
  for (const item of items) for (const id of item.sourceIds ?? []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

function sourceNames(index: RagIndex, ids: string[], limit = 3): string[] {
  return ids
    .map((id) => index.sourceById.get(id)?.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, limit)
    .map((title) => clip(title, 40));
}

function parasiteTaglineRetrieval(hits: ParasiteHit[]): string {
  for (const hit of hits) {
    const tagline = firstSentence(hit.parasite.tagline || hit.parasite.summary || '', 80);
    if (tagline) return tagline;
  }
  return '';
}

/* ========================================================================== */
/* 风险判断                                                                    */
/* ========================================================================== */

interface VerdictInput {
  retrieval: RetrievalResult;
  nlu: NluResult;
  intent: ChatIntent;
}

function bestRuleMatch(retrieval: RetrievalResult): RuleMatch | null {
  const matches = [...retrieval.rules];
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const riskDelta = RISK_RANK[b.rule.riskLevel] - RISK_RANK[a.rule.riskLevel];
    if (riskDelta !== 0) return riskDelta;
    return b.score - a.score;
  });
  return matches[0] ?? null;
}

function scenarioLevels(retrieval: RetrievalResult): RiskLevel[] {
  return retrieval.scenarios.map((scenario) => scenario.scenario.riskLevel);
}

/** 根据规则 / 食物处理方式矩阵 / 场景，给出定性风险判断 */
export function buildVerdict({ retrieval, nlu, intent }: VerdictInput): RiskVerdict | null {
  if (!['risk-assessment', 'post-exposure', 'follow-up', 'clarification-answer'].includes(intent)) {
    return null;
  }

  const foodHits = retrieval.foods;
  const parasiteHits = retrieval.parasites;
  const rationale: string[] = [];
  const parasiteIds: string[] = [];
  const matchedRule = bestRuleMatch(retrieval);
  let level: RiskLevel | null = null;
  let hasDocumentedRisk = false;

  /*
   * 病原集合（parasiteIds）只来自“与已识别食物+处理方式匹配的高/中风险规则与场景”：
   *  - contextual 规则只作为条件说明，不进入病原清单；
   *  - 地区证据只用于地区章节，不影响病原集合；
   *  - 症状提示只参与排序，不产生病原。
   */
  const strongRules = retrieval.rules.filter((match) => RISK_RANK[match.rule.riskLevel] >= 3);
  const strongScenarios = retrieval.scenarios.filter(
    (match) => RISK_RANK[match.scenario.riskLevel] >= 3 && !match.preparationUnknown,
  );
  const conditionalScenarios = retrieval.scenarios.filter((match) => match.preparationUnknown);
  const contextualRules = retrieval.rules.filter((match) => match.rule.riskLevel === 'contextual');
  const addParasite = (id: string) => {
    if (parasiteIds.includes(id)) return;
    if (!retrieval.parasites.some((hit) => hit.parasite.id === id)) return;
    parasiteIds.push(id);
  };
  for (const match of strongRules) addParasite(match.rule.parasiteId);
  for (const match of strongScenarios) addParasite(match.parasite.id);

  if (matchedRule) {
    level = matchedRule.rule.riskLevel;
    rationale.push(matchedRule.rule.rationale);
    for (const condition of matchedRule.rule.conditions ?? []) rationale.push(`附加条件：${condition}`);
    hasDocumentedRisk = RISK_RANK[level] >= 3;
    for (const match of strongRules.slice(0, 3)) {
      if (!rationale.includes(match.rule.rationale)) rationale.push(match.rule.rationale);
    }
    for (const match of strongScenarios.slice(0, 2)) {
      if (!rationale.includes(match.scenario.explanation)) rationale.push(match.scenario.explanation);
    }
  }

  if (!level) {
    /* 规则未命中的退路：已说明处理方式时使用食物风险矩阵 */
    for (const hit of foodHits) {
      if (!hit.preparation) continue;
      if (!level || RISK_RANK[hit.preparation.risk] > RISK_RANK[level]) level = hit.preparation.risk;
      if (!rationale.includes(hit.preparation.explanation)) rationale.push(hit.preparation.explanation);
      if (RISK_RANK[hit.preparation.risk] >= 3) {
        for (const pid of hit.preparation.parasiteIds ?? []) addParasite(pid);
        hasDocumentedRisk = true;
      }
    }
  }

  if (!level) {
    /* 已说明处理方式但没有矩阵：按处理方式的通用风险倾向 */
    for (const tag of nlu.context.preparationTags) {
      const tagLevel = PREP_RISK[tag] ?? 'unknown';
      if (!level || RISK_RANK[tagLevel] > RISK_RANK[level]) level = tagLevel;
      const explain = PREP_EXPLAIN[tag];
      if (explain && !rationale.includes(explain)) rationale.push(explain);
    }
    for (const match of strongScenarios.slice(0, 2)) {
      if (!rationale.includes(match.scenario.explanation)) rationale.push(match.scenario.explanation);
    }
    if (level && RISK_RANK[level] >= 3) hasDocumentedRisk = true;
  }

  if (!level) {
    const foodsWithParasites = foodHits.filter((hit) => (hit.food.parasiteIds ?? []).length > 0);
    if (foodsWithParasites.length > 0) {
      /* 处理方式未知：不下确定结论，只说明取决于做法 */
      level = 'contextual';
      rationale.push('是否安全取决于具体处理方式：生食、半生与充分加热对应的风险差别很大。');
      const tags = uniq(foodsWithParasites.flatMap((hit) => (hit.food.preparations ?? []).map((prep) => prep.tag)));
      if (tags.length > 0) {
        rationale.push(
          `该食物在知识库中记录的处理方式包括：${tags.map((tag) => PREP_SHORT[tag]).join('、')}。`,
        );
      }
      for (const match of conditionalScenarios.slice(0, 3)) {
        const note = `${match.parasite.name}：${match.scenario.title}（如果吃法属于这一类，风险会明显升高）。`;
        if (!rationale.includes(note)) rationale.push(note);
      }
      for (const match of strongScenarios.slice(0, 2)) addParasite(match.parasite.id);
    } else if (foodHits.length > 0) {
      level = 'unknown';
      rationale.push('该食物在现有资料中未明确列出相关寄生虫，但资料不足不等于没有风险。');
    } else if (parasiteHits.length > 0) {
      /* 只提到寄生虫：一般性知识说明，不针对个人下结论 */
      level = 'contextual';
      const scenarios = parasiteHits.flatMap((hit) => hit.scenarioMatches.map((s) => s.scenario));
      if (scenarios.length > 0) {
        const highest = scenarios.reduce(
          (acc, scenario) => (RISK_RANK[scenario.riskLevel] > RISK_RANK[acc] ? scenario.riskLevel : acc),
          'unknown' as RiskLevel,
        );
        hasDocumentedRisk = RISK_RANK[highest] >= 3;
        rationale.push(
          `文献记载的感染方式主要包括：${uniq(scenarios.map((scenario) => scenario.title)).slice(0, 3).join('；')}。`,
        );
      } else {
        rationale.push('是否感染取决于是否接触过相关的风险食物与暴露方式，无法仅凭寄生虫名称判断个人风险。');
      }
      for (const hit of parasiteHits.slice(0, 3)) parasiteIds.push(hit.parasite.id);
      rationale.push('以上为一般性知识说明，不针对个人情况。');
    } else if (retrieval.ambiguousFoodIds.length > 0) {
      level = 'contextual';
      rationale.push('不同候选食物对应的寄生虫不同，需要先确认具体是哪一种。');
    } else {
      level = 'unknown';
      rationale.push('目前缺少食物、处理方式等关键信息。');
    }
  }

  if (!level) return null;

  /* contextual 规则：只作为条件说明，不进入病原清单 */
  if (level === 'contextual') {
    for (const match of contextualRules.slice(0, 2)) {
      const note = `在特定条件下仍需注意：${match.rule.rationale}`;
      if (!rationale.includes(note)) rationale.push(note);
    }
  }

  /* 已食用场景：强调“高风险暴露 ≠ 已感染” */
  if (intent === 'post-exposure') {
    rationale.push(
      '这是一次已经发生的暴露；是否感染需要结合饮食史与医学检查由医生判断，不能仅凭暴露方式下结论。',
    );
  }

  const finalParasiteIds = uniq(parasiteIds).slice(0, 6);
  const finalRationale = uniq(rationale.filter(Boolean)).slice(0, 5);
  if (level === 'high' || level === 'moderate') hasDocumentedRisk = true;

  return {
    level,
    label: VERDICT_LABELS[level],
    rationale: finalRationale.length > 0 ? finalRationale : ['现有资料不足以判断具体风险。'],
    parasiteIds: finalParasiteIds,
    hasDocumentedRisk,
  };
}

/* ========================================================================== */
/* 章节构建                                                                    */
/* ========================================================================== */

interface SectionContext {
  index: RagIndex;
  nlu: NluResult;
  retrieval: RetrievalResult;
  verdict: RiskVerdict | null;
  now: Date;
}

function whySection(ctx: SectionContext): ChatSection | null {
  const { retrieval, verdict } = ctx;
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const parasiteIds: string[] = [];
  const sourceIds: string[] = [];

  if (verdict && verdict.level === 'contextual') {
    for (const item of verdict.rationale.slice(0, 2)) paragraphs.push(item);
  }

  /*
   * 病原说明只围绕“与本次食物+处理方式匹配”的寄生虫展开：
   * 有 verdict.parasiteIds 时严格按该清单；否则回退到检索候选（其本身只来自食物/规则匹配）。
   */
  const focusIds = verdict?.parasiteIds.length ? verdict.parasiteIds : null;
  const parasiteHitsForWhy = focusIds
    ? focusIds
        .map((id) => retrieval.parasites.find((hit) => hit.parasite.id === id))
        .filter((hit): hit is ParasiteHit => Boolean(hit))
    : retrieval.parasites;

  for (const hit of parasiteHitsForWhy.slice(0, 2)) {
    const parasite = hit.parasite;
    parasiteIds.push(parasite.id);
    if (parasite.transmission?.summary) {
      paragraphs.push(`${parasite.name}：${parasite.transmission.summary}`);
      sourceIds.push(...(parasite.transmission.sourceIds ?? []));
    }
    if (parasite.transmission?.infectiveStage || parasite.transmission?.entryMode) {
      bullets.push(
        `感染阶段 / 侵入方式：${[parasite.transmission?.infectiveStage, parasite.transmission?.entryMode]
          .filter(Boolean)
          .join('；')}`,
      );
    }
  }

  /* 规则给出的判断理由（避免与 verdict 重复） */
  const rulesForWhy = retrieval.rules.filter(
    (match) => !focusIds || focusIds.includes(match.rule.parasiteId),
  );
  for (const match of rulesForWhy.slice(0, 2)) {
    const text = `风险组合：${match.rule.rationale}`;
    const duplicated = rationaleContains(verdict?.rationale, match.rule.rationale);
    if (!duplicated && !paragraphs.includes(text)) paragraphs.push(text);
    sourceIds.push(...(match.rule.sourceIds ?? []));
  }

  /* 食物概述：仅在没有明确病原集合时补充（避免把食物全量关联的其它寄生虫混入风险叙述） */
  if (!focusIds && foodParagraphsEnabled(ctx)) {
    for (const hit of retrieval.foods.slice(0, 1)) {
      if (hit.food.summary) {
        paragraphs.push(`${hit.food.name}：${firstSentence(hit.food.summary, 110)}`);
        sourceIds.push(...(hit.food.sourceIds ?? []));
      }
    }
  }

  if (paragraphs.length === 0 && bullets.length === 0) return null;
  return {
    kind: 'why',
    title: '为什么会有这个风险',
    paragraphs: paragraphs.slice(0, 4),
    ...(bullets.length > 0 ? { bullets: bullets.slice(0, 3) } : {}),
    ...(parasiteIds.length > 0 ? { parasiteIds: uniq(parasiteIds) } : {}),
    ...(sourceIds.length > 0 ? { sourceIds: uniq(sourceIds) } : {}),
  };
}

/** 判断某段说明是否已被 verdict 的理由覆盖（避免回答内重复叙述） */
function rationaleContains(rationale: string[] | undefined, text: string): boolean {
  if (!rationale || !text) return false;
  const normalized = text.replace(/[。；;，,、\s]/g, '');
  return rationale.some((item) => {
    const current = item.replace(/[。；;，,、\s]/g, '');
    return current.includes(normalized.slice(0, 12)) || normalized.includes(current.slice(0, 12));
  });
}

function foodParagraphsEnabled(ctx: SectionContext): boolean {
  return ['knowledge', 'risk-assessment', 'follow-up', 'clarification-answer', 'prevention'].includes(
    ctx.nlu.primaryIntent,
  );
}

function consequenceSection(ctx: SectionContext): ChatSection | null {
  const { retrieval } = ctx;
  if (retrieval.consequences.length === 0) return null;
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const parasiteIds: string[] = [];
  const sourceIds: string[] = [];

  /* 症状检索时优先展示与用户症状相关的后果 */
  const symptoms = ctx.nlu.context.symptoms;
  const sorted = [...retrieval.consequences].sort((a, b) => {
    const aHit = symptoms.some((symptom) => `${a.title}${a.detail}`.includes(symptom)) ? 1 : 0;
    const bHit = symptoms.some((symptom) => `${b.title}${b.detail}`.includes(symptom)) ? 1 : 0;
    if (aHit !== bHit) return bHit - aHit;
    return 0;
  });

  for (const item of sorted.slice(0, 3)) {
    paragraphs.push(`${item.parasiteName}·${item.title}：${clip(item.detail, 130)}`);
    if (!parasiteIds.includes(item.parasiteId)) parasiteIds.push(item.parasiteId);
    sourceIds.push(...item.sourceIds);
    if (item.onset) bullets.push(`${item.parasiteName}：起病/潜伏期参考——${item.onset}`);
  }
  const severity = sorted[0]?.severity;
  if (severity) bullets.push(`文献描述的严重程度：${SEVERITY_LABELS[severity]}（个体差异较大）。`);

  return {
    kind: 'consequence',
    title: '可能的后果',
    paragraphs: paragraphs.slice(0, 3),
    ...(bullets.length > 0 ? { bullets: bullets.slice(0, 3) } : {}),
    parasiteIds: uniq(parasiteIds),
    sourceIds: uniq(sourceIds),
  };
}

function preventionSection(ctx: SectionContext): ChatSection | null {
  const { retrieval } = ctx;
  const keyItems = retrieval.prevention.filter((item) => item.key);
  const restItems = retrieval.prevention.filter((item) => !item.key);
  const genericQuestion =
    ctx.nlu.context.foodIds.length === 0 &&
    ctx.nlu.context.parasiteIds.length === 0 &&
    ctx.nlu.primaryIntent === 'prevention';

  let items: KnowledgeItem[];
  if (genericQuestion) {
    /* 通用预防问题：跨寄生虫轮换取要点，避免回答只讲一种寄生虫 */
    const groups = new Map<string, KnowledgeItem[]>();
    for (const item of [...keyItems, ...restItems]) {
      const key = item.parasiteId || item.parasiteName;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    const lists = [...groups.values()];
    items = [];
    for (let round = 0; round < 3 && items.length < 5; round += 1) {
      for (const list of lists) {
        const item = list[round];
        if (item && items.length < 5) items.push(item);
      }
    }
  } else {
    items = [...keyItems, ...restItems].slice(0, 5);
  }

  if (items.length === 0) return null;

  const bullets = items.map(
    (item) => `${item.key ? '【关键】' : ''}${item.parasiteName}·${item.title}：${clip(item.detail, 100)}`,
  );
  const sourceIds = uniqueSourceIds(items);

  const paragraphs: string[] = [];
  for (const hit of retrieval.foods.slice(0, 1)) {
    if (hit.food.seasonNote && ctx.nlu.context.months.length > 0) {
      paragraphs.push(`季节性提示：${clip(hit.food.seasonNote, 120)}`);
    }
  }

  return {
    kind: 'prevention',
    title: '关键预防',
    paragraphs: paragraphs.slice(0, 2),
    bullets: bullets.slice(0, 5),
    ...(sourceIds.length > 0 ? { sourceIds } : {}),
  };
}

function postExposureSection(ctx: SectionContext): ChatSection | null {
  const { retrieval, nlu } = ctx;
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const parasiteIds: string[] = [];
  const sourceIds: string[] = [];

  paragraphs.push('以下是一般性的观察与就医提示，不能替代医生的面诊与检查。');

  for (const item of retrieval.postExposure.slice(0, 4)) {
    bullets.push(`${item.parasiteName}·${item.title}：${clip(item.detail, 110)}`);
    if (!parasiteIds.includes(item.parasiteId)) parasiteIds.push(item.parasiteId);
    sourceIds.push(...item.sourceIds);
  }

  const symptoms = nlu.context.symptoms;
  if (symptoms.length > 0) {
    bullets.push(
      `您提到了「${symptoms.join('、')}」。如果症状持续或加重，或出现高热、剧烈头痛、意识改变、抽搐等情况，请尽快就医，并主动告知医生近期饮食史。`,
    );
  } else {
    bullets.push(
      '请留意是否出现腹痛、腹泻、发热、乏力、肌肉酸痛等不适；若出现或持续，请及时就医并告知医生近期饮食史。',
    );
  }

  if (retrieval.parasites.length > 0) {
    const onset = retrieval.consequences.find((item) => item.onset)?.onset;
    if (onset) bullets.push(`文献中的起病/潜伏期参考：${onset}（个体差异较大）。`);
  }

  return {
    kind: 'post-exposure',
    title: '已食用后的观察与就医提示',
    paragraphs,
    bullets: bullets.slice(0, 5),
    ...(parasiteIds.length > 0 ? { parasiteIds: uniq(parasiteIds) } : {}),
    ...(sourceIds.length > 0 ? { sourceIds: uniq(sourceIds) } : {}),
  };
}

function treatmentSection(ctx: SectionContext): ChatSection | null {
  const { retrieval, index } = ctx;
  if (retrieval.treatments.length === 0) {
    return {
      kind: 'treatment',
      title: '治疗与就医',
      paragraphs: [
        '不同食源性寄生虫病的治疗方案差别较大，是否需要治疗、如何治疗必须由医生在明确诊断后决定。',
        '如果您担心自己已经感染，建议到正规医疗机构就诊，并主动说明近期饮食史；不要自行购买或服用抗寄生虫药物。',
      ],
    };
  }
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const sourceIds: string[] = [];
  const parasiteIds: string[] = [];

  for (const item of retrieval.treatments.slice(0, 2)) {
    paragraphs.push(`${item.parasiteName}：${clip(item.detail, 140)}`);
    paragraphs.push(`注意：${clip(item.note, 120)}`);
    parasiteIds.push(item.parasiteId);
    sourceIds.push(...item.sourceIds);
    const parasite = index.parasiteById.get(item.parasiteId);
    const drugs = parasite?.treatment?.drugs ?? [];
    if (drugs.length > 0) {
      bullets.push(
        `资料转述：${item.parasiteName}相关文献中提及的药物包括${drugs.join('、')}；仅作资料转述，具体用药与剂量须由医生决定。`,
      );
    }
  }
  bullets.push('不要根据网络信息自行用药；诊断与治疗方案由医疗机构结合检查结果确定。');

  return {
    kind: 'treatment',
    title: '治疗与就医',
    paragraphs: paragraphs.slice(0, 4),
    bullets,
    parasiteIds: uniq(parasiteIds),
    ...(sourceIds.length > 0 ? { sourceIds: uniq(sourceIds) } : {}),
  };
}

function regionSection(ctx: SectionContext): ChatSection | null {
  const { retrieval } = ctx;
  if (retrieval.regions.length === 0) return null;

  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const sourceIds: string[] = [];
  const parasiteIds: string[] = [];

  for (const hit of retrieval.regions.slice(0, 3)) {
    if (hit.entries.length > 0) {
      for (const evidence of hit.entries.slice(0, 2)) {
        const entry = evidence.entry;
        paragraphs.push(
          `${hit.name}：${entry.headline}。${clip(entry.detail, 150)}（文献状态：${REGION_STATUS_LABELS[entry.status] ?? entry.status}；证据等级：${entry.evidenceLevel}）`,
        );
        const context = entry.studyContext;
        if (context) {
          const scope = [context.population, context.sample, context.period, context.statistic, context.location]
            .filter(Boolean)
            .join('；');
          if (scope) bullets.push(`${hit.name}·研究口径：${clip(scope, 120)}`);
        }
        sourceIds.push(...entry.sourceIds);
        for (const pid of entry.parasiteIds) if (!parasiteIds.includes(pid)) parasiteIds.push(pid);
      }
    }
  }

  /* 没有匹配证据的省份：明确资料缺口，不当作“无风险” */
  const uncovered = retrieval.regionCoverage.filter((coverage) => !coverage.hasEvidence);
  for (const coverage of uncovered.slice(0, 3)) {
    paragraphs.push(coverage.note);
  }

  if (paragraphs.length === 0 && bullets.length === 0) return null;
  return {
    kind: 'region',
    title: '地区资料',
    paragraphs: paragraphs.slice(0, 5),
    ...(bullets.length > 0 ? { bullets: bullets.slice(0, 4) } : {}),
    ...(parasiteIds.length > 0 ? { parasiteIds: uniq(parasiteIds) } : {}),
    ...(sourceIds.length > 0 ? { sourceIds: uniq(sourceIds) } : {}),
  };
}

function seasonSection(ctx: SectionContext): ChatSection | null {
  const { retrieval, nlu } = ctx;
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const sourceIds: string[] = [];
  const parasiteIds: string[] = [];
  const months = nlu.context.months;

  for (const item of retrieval.seasonal.slice(0, 3)) {
    let text = `${item.parasiteName}：${item.pattern}。${clip(item.evidenceNote, 130)}`;
    if (months.length > 0 && item.peakMonths.length > 0) {
      const overlap = months.filter((month) => item.peakMonths.includes(month));
      text +=
        overlap.length > 0
          ? ` 文献记载的风险高峰月份包括 ${item.peakMonths.join('、')} 月，与您提到的时间有重合。`
          : ` 文献记载的风险高峰月份为 ${item.peakMonths.join('、')} 月，与您提到的时间不完全一致；但这不构成“绝对安全”的结论，风险更多取决于饮食方式。`;
    } else if (item.peakMonths.length === 0) {
      text += ' 现有资料未给出明确的季节高峰，风险更多取决于饮食方式而非月份。';
    }
    paragraphs.push(text);
    if (!parasiteIds.includes(item.parasiteId)) parasiteIds.push(item.parasiteId);
    sourceIds.push(...item.sourceIds);
    if (item.contextNote) bullets.push(`饮食情境提示（非流行病学结论）：${clip(item.contextNote, 130)}`);
  }

  for (const note of retrieval.regionalSeasons.slice(0, 2)) {
    bullets.push(
      `${note.regionName}·季节资料（${note.basis === 'infection-evidence' ? '文献季节证据' : '饮食情境提示，非流行病学结论'}）：${clip(note.note, 120)}`,
    );
    sourceIds.push(...note.sourceIds);
  }

  if (paragraphs.length === 0 && bullets.length === 0) return null;
  return {
    kind: 'season',
    title: '季节与时间',
    paragraphs: paragraphs.slice(0, 3),
    ...(bullets.length > 0 ? { bullets: bullets.slice(0, 4) } : {}),
    ...(parasiteIds.length > 0 ? { parasiteIds: uniq(parasiteIds) } : {}),
    ...(sourceIds.length > 0 ? { sourceIds: uniq(sourceIds) } : {}),
  };
}

function evidenceSection(ctx: SectionContext): ChatSection | null {
  const { retrieval } = ctx;
  const paragraphs = [
    '不同调查的研究对象、样本量与统计口径不同，相关数字不能直接比较或外推；资料不足处已明确标注，不能理解为“没有风险”。',
  ];
  const bullets: string[] = [];
  for (const hit of retrieval.parasites.slice(0, 3)) {
    for (const caveat of (hit.parasite.evidence?.caveats ?? []).slice(0, 1)) {
      bullets.push(`${hit.parasite.name}：${clip(caveat, 110)}`);
    }
  }
  const sourceIds = uniq([
    ...retrieval.parasites.flatMap((hit) => hit.parasite.distribution?.sourceIds ?? []),
    ...retrieval.rules.flatMap((match) => match.rule.sourceIds ?? []),
  ]);

  if (bullets.length === 0 && sourceIds.length === 0) return null;
  return {
    kind: 'evidence',
    title: '资料依据与适用范围',
    paragraphs,
    ...(bullets.length > 0 ? { bullets: bullets.slice(0, 3) } : {}),
    ...(sourceIds.length > 0 ? { sourceIds: uniq(sourceIds).slice(0, 6) } : {}),
  };
}

function noteSection(ctx: SectionContext): ChatSection | null {
  const { nlu } = ctx;
  const paragraphs: string[] = [...nlu.notes];
  if (nlu.negationNotes.length > 0) paragraphs.push(...nlu.negationNotes);
  for (const ambiguous of nlu.ambiguousFoods) paragraphs.push(ambiguous.note);
  if (nlu.context.exposure === 'after') {
    paragraphs.push('已食用不等于一定感染；是否需要检查或治疗应由医生结合饮食史与检查结果判断。');
  }
  if (paragraphs.length === 0) return null;
  return {
    kind: 'note',
    title: '说明',
    paragraphs: uniq(paragraphs).slice(0, 4),
  };
}

/* ========================================================================== */
/* 追问构建                                                                    */
/* ========================================================================== */

const FOOD_CLARIFY_OPTIONS = [
  { label: '淡水鱼（如草鱼、鲤鱼）', value: 'freshwater-fish', hint: '鱼生、生滚鱼片等' },
  { label: '海鱼 / 刺身（如三文鱼）', value: 'marine-fish', hint: '刺身、寿司、醋腌海鱼等' },
  { label: '猪肉 / 牛羊肉', value: 'pork', hint: '七分熟牛排、涮肉等' },
  { label: '螺、蟹、蛙等水产', value: 'snail', hint: '福寿螺、溪蟹、牛蛙等' },
];

function prepOptionsForFood(hit: FoodHit | null, index: RagIndex): ClarifyQuestion['options'] {
  const tags = hit?.food.preparations?.map((prep) => prep.tag) ?? [];
  const generic: PreparationTag[] = ['raw', 'undercooked', 'fully-cooked', 'cured-smoked'];
  const candidates = tags.length > 0 ? tags : generic;
  const options: ClarifyQuestion['options'] = [];
  for (const tag of candidates) {
    if (tag === 'unknown' || tag === 'boiled-water') continue;
    const option: ClarifyQuestion['options'][number] = {
      label: PREP_SHORT[tag],
      value: tag,
    };
    if (tag === 'raw') option.hint = '刺身、生腌、醉制';
    if (tag === 'undercooked') option.hint = '涮烫、快炒、七分熟';
    options.push(option);
  }
  if (candidates.includes('boiled-water')) {
    options.push({ label: '煮沸 / 烧开', value: 'boiled-water' });
  }
  return options.slice(0, 4);
}

/** 构建最多一个追问：食物 > 歧义 > 做法 > 症状 > 地区 */
export function buildClarify(ctx: SectionContext): ClarifyQuestion | null {
  const { nlu, retrieval, index } = ctx;
  const intent = nlu.primaryIntent;
  const relevantIntent = ['risk-assessment', 'post-exposure', 'follow-up', 'clarification-answer', 'prevention', 'symptoms'].includes(intent);
  if (!relevantIntent) return null;

  const unresolvedFood = retrieval.unresolvedFoodMentions[0];
  if (retrieval.foods.length === 0 && retrieval.parasites.length === 0 && unresolvedFood) {
    return {
      question: `您提到的「${clip(unresolvedFood, 20)}」我暂时没有对应的专门资料。您想了解的是哪一类食物？`,
      field: 'food',
      options: FOOD_CLARIFY_OPTIONS,
    };
  }

  if (retrieval.foods.length === 0 && retrieval.parasites.length === 0) {
    return {
      question: '您吃的是哪一类食物？知道食物和做法后，我才能判断风险来自哪些寄生虫。',
      field: 'food',
      options: FOOD_CLARIFY_OPTIONS,
    };
  }

  if (nlu.ambiguousFoods.length > 0 && intent !== 'comparison') {
    const ambiguous = nlu.ambiguousFoods[0]!;
    return {
      question: `您描述的是“${ambiguous.text}”，不同具体食物对应的风险寄生虫不同，能确认是下面哪一种吗？`,
      field: 'food',
      options: ambiguous.candidates.slice(0, 3).map((candidate) => ({
        label: candidate.name,
        value: candidate.id,
      })),
    };
  }

  const foodHit = retrieval.foods[0] ?? null;
  const needsPreparation =
    foodHit != null &&
    nlu.context.preparationTags.length === 0 &&
    ((foodHit.food.parasiteIds ?? []).length > 0 || (foodHit.food.preparations ?? []).some((prep) => prep.tag === 'raw'));
  if (needsPreparation) {
    const question =
      intent === 'post-exposure'
        ? `您当时吃的${foodHit!.food.name}是怎么做的？这会影响需要警惕的寄生虫。`
        : `您打算怎么处理/吃${foodHit!.food.name}？不同做法的风险差别很大。`;
    return {
      question,
      field: 'preparation',
      options: prepOptionsForFood(foodHit, index),
    };
  }

  /* 极短的澄清回答（如只回答了“生的”），仍缺食物 */
  if ((intent === 'clarification-answer' || intent === 'follow-up') && retrieval.foods.length === 0 && nlu.context.preparationTags.length > 0) {
    return {
      question: '明白您说的是这种处理方式。能再告诉我具体是哪种食物吗？',
      field: 'food',
      options: FOOD_CLARIFY_OPTIONS,
    };
  }

  if (intent === 'post-exposure' && nlu.context.symptoms.length === 0) {
    return {
      question: '吃了之后，现在有没有出现不舒服？',
      field: 'symptoms',
      options: [
        { label: '腹泻 / 腹痛', value: '腹泻、腹痛' },
        { label: '发热 / 乏力', value: '发热、乏力' },
        { label: '头痛 / 肌肉痛', value: '头痛、肌肉痛' },
        { label: '目前没有明显不适', value: '无明显不适' },
      ],
    };
  }

  if (
    nlu.signals.region &&
    nlu.context.provinceCodes.length === 0 &&
    retrieval.parasites.length > 0
  ) {
    return {
      question: '您想了解哪个地区的资料？',
      field: 'province',
      options: [
        { label: '广东', value: '440000' },
        { label: '广西', value: '450000' },
        { label: '四川', value: '510000' },
        { label: '云南', value: '530000' },
      ],
    };
  }

  return null;
}

/* ========================================================================== */
/* 追问建议                                                                    */
/* ========================================================================== */

function buildFollowUps(ctx: SectionContext, clarify: ClarifyQuestion | null): string[] {
  const { index, nlu, retrieval } = ctx;
  const intent = nlu.primaryIntent;
  const items: string[] = [];

  const add = (text: string) => {
    const trimmed = clip(text.trim(), 42);
    if (trimmed && !items.includes(trimmed)) items.push(trimmed);
  };

  if (intent === 'greeting' || intent === 'out-of-scope') {
    for (const question of buildExampleQuestions(index, 4)) add(question);
    return items.slice(0, 4);
  }

  const foodHit = retrieval.foods[0] ?? null;
  const topParasite = retrieval.parasites[0]?.parasite ?? null;

  if (intent === 'post-exposure') {
    add('需要做哪些检查才能确认？');
    add('多久没有症状可以放心？');
    add('以后怎么避免类似风险？');
  } else if (intent === 'comparison') {
    add('那如果两边都彻底煮熟呢？');
    if (topParasite) add(`${topParasite.name}主要怎么传播？`);
  } else if (intent === 'prevention') {
    if (foodHit) add(`${foodHit.food.name}煮熟后风险如何？`);
    add('生熟分开具体要注意什么？');
    add('哪些人群需要特别小心？');
  } else if (intent === 'treatment') {
    add('出现哪些情况需要尽快就医？');
    add('就医时应该告诉医生什么？');
  } else if (intent === 'symptoms') {
    if (topParasite) add(`${topParasite.name}怎么预防？`);
    add('出现症状后应该做什么检查？');
  } else if (intent === 'region' || intent === 'season') {
    if (topParasite) add(`${topParasite.name}主要通过哪些食物感染？`);
    add('其他省份有相关记载吗？');
  } else if (intent === 'knowledge') {
    if (topParasite) add(`${topParasite.name}感染后有什么症状？`);
    add('这种寄生虫在我国哪些地区流行？');
  } else if (intent === 'follow-up' || intent === 'clarification-answer') {
    if (foodHit) add(`${foodHit.food.name}彻底煮熟后风险如何？`);
    if (foodHit) add(`${foodHit.food.name}怎么挑选和处理更安全？`);
    add('如果已经吃过了，需要注意什么？');
  } else {
    /* 食前风险 */
    if (foodHit) {
      add(`${foodHit.food.name}彻底煮熟后风险如何？`);
      add(`${foodHit.food.name}怎么处理更安全？`);
    }
    if (nlu.context.provinceCodes.length > 0) {
      add(`${provinceDisplayName(nlu.context.provinceCodes[0]!)}还有哪些相关寄生虫？`);
    }
    add('如果已经吃过了，需要注意什么？');
  }

  if (clarify) {
    for (const option of clarify.options.slice(0, 2)) {
      if (clarify.field === 'preparation') add(`如果是${option.label}呢？`);
    }
  }

  for (const question of buildExampleQuestions(index, 6)) {
    if (items.length >= 4) break;
    add(question);
  }

  return items.slice(0, 4);
}

/** 示例问题：优先使用 store.suggestions，其次使用与当前数据相关的模板 */
export function buildExampleQuestions(index: RagIndex, limit = 4): string[] {
  const suggestions = (index.knowledge.suggestions ?? []).filter((item) => typeof item === 'string' && item.trim());
  if (suggestions.length >= 4) return suggestions.slice(0, limit);

  const foodNamesList = index.foods.map((food) => food.name);
  const parasiteNamesList = index.parasites.map((parasite) => parasite.name);
  const dynamic: string[] = [];
  const pickFood = (name: string) => foodNamesList.includes(name);
  if (pickFood('淡水鱼')) dynamic.push('生吃淡水鱼会感染肝吸虫吗？');
  if (pickFood('海鱼与洄游鱼')) dynamic.push('生吃三文鱼刺身有风险吗？');
  if (pickFood('羊肉')) dynamic.push('涮羊肉安全吗？');
  if (pickFood('螺类')) dynamic.push('福寿螺怎么吃才安全？');
  if (pickFood('水生植物')) dynamic.push('生吃荸荠会感染寄生虫吗？');
  if (pickFood('饮用水')) dynamic.push('喝生水要注意什么？');
  if (pickFood('蟹类')) dynamic.push('醉蟹能吃吗？');
  if (parasiteNamesList.some((name) => name.includes('华支睾吸虫') || name.includes('肝吸虫'))) {
    dynamic.push('肝吸虫感染后有什么症状？');
  }
  for (const question of DEFAULT_QUESTIONS) dynamic.push(question);
  return uniq(dynamic).slice(0, Math.max(limit, 4));
}

/* ========================================================================== */
/* 引用构建                                                                    */
/* ========================================================================== */

interface CitationReason {
  sourceId: string;
  weight: number;
  reasons: string[];
}

function collectCitationReasons(
  ctx: SectionContext,
  sections: ChatSection[],
  verdict: RiskVerdict | null,
): Map<string, CitationReason> {
  const { index, retrieval } = ctx;
  const map = new Map<string, CitationReason>();
  const bump = (sourceId: string, weight: number, reason: string) => {
    if (!index.sourceById.has(sourceId)) return;
    const existing = map.get(sourceId);
    if (existing) {
      existing.weight += weight;
      if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      map.set(sourceId, { sourceId, weight, reasons: reason ? [reason] : [] });
    }
  };

  for (const section of sections) {
    for (const sourceId of section.sourceIds ?? []) {
      bump(sourceId, 2, `支持「${section.title}」`);
    }
  }
  for (const match of retrieval.rules.slice(0, 3)) {
    for (const sourceId of match.rule.sourceIds ?? []) bump(sourceId, 3, '支持风险组合判断');
  }
  for (const hit of retrieval.parasites.slice(0, 3)) {
    for (const sourceId of hit.parasite.transmission?.sourceIds ?? []) bump(sourceId, 1.5, `${hit.parasite.name}传播途径`);
    for (const sourceId of hit.parasite.distribution?.sourceIds ?? []) bump(sourceId, 1, `${hit.parasite.name}分布背景`);
    for (const sourceId of hit.parasite.seasonality?.sourceIds ?? []) bump(sourceId, 1, `${hit.parasite.name}季节资料`);
  }
  for (const regionHit of retrieval.regions.slice(0, 3)) {
    for (const evidence of regionHit.entries.slice(0, 2)) {
      for (const sourceId of evidence.entry.sourceIds ?? []) bump(sourceId, 2.5, `${regionHit.name}地区证据`);
    }
  }
  for (const item of retrieval.consequences.slice(0, 3)) {
    for (const sourceId of item.sourceIds) bump(sourceId, 1, '后果描述');
  }
  for (const item of retrieval.prevention.slice(0, 4)) {
    for (const sourceId of item.sourceIds) bump(sourceId, 1, '预防要点');
  }
  if (verdict) {
    for (const match of retrieval.rules.slice(0, 2)) {
      for (const sourceId of match.rule.sourceIds ?? []) bump(sourceId, 2, '风险判断依据');
    }
  }
  return map;
}

function buildCitations(ctx: SectionContext, sections: ChatSection[], verdict: RiskVerdict | null): ChatCitation[] {
  const { index } = ctx;
  const reasons = collectCitationReasons(ctx, sections, verdict);
  const ranked = [...reasons.values()]
    .map((item) => {
      const source = index.sourceById.get(item.sourceId)!;
      const reliabilityBonus = source.reliability === 'high' ? 2 : source.reliability === 'medium' ? 1 : 0.5;
      return { item, source, score: item.weight + reliabilityBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return ranked.map(({ item, source }) => {
    const relevance =
      item.reasons.length > 0
        ? item.reasons.slice(0, 2).join('；')
        : source.usage
          ? clip(source.usage, 60)
          : '知识库中的相关资料';
    const citation: ChatCitation = {
      sourceId: source.id,
      title: source.title,
      reliability: source.reliability,
      relevance: clip(relevance, 80),
    };
    if (source.venue) citation.venue = source.venue;
    if (source.year != null) citation.year = source.year;
    if (source.url) citation.url = source.url;
    return citation;
  });
}

/* ========================================================================== */
/* 对比回答                                                                    */
/* ========================================================================== */

interface SideEvaluation {
  text: string;
  label: string;
  level: RiskLevel;
  explanation: string;
  parasiteIds: string[];
}

function evaluateSide(
  sideText: string,
  foodIds: string[],
  preps: PreparationTag[],
  parasiteIds: string[],
  index: RagIndex,
): SideEvaluation {
  const levels: RiskLevel[] = [];
  const explanations: string[] = [];
  const parasites: string[] = [];
  const labels: string[] = [];

  for (const tag of preps) {
    levels.push(PREP_RISK[tag] ?? 'unknown');
    const explain = PREP_EXPLAIN[tag];
    if (explain) explanations.push(explain);
  }
  for (const foodId of foodIds) {
    const food = index.foodById.get(foodId);
    if (!food) continue;
    labels.push(food.name);
    if (preps.length > 0) {
      for (const tag of preps) {
        const prep = (food.preparations ?? []).find((item) => item.tag === tag);
        if (prep) {
          levels.push(prep.risk);
          explanations.push(prep.explanation);
        }
      }
    } else {
      const rawPrep = (food.preparations ?? []).find((item) => item.tag === 'raw');
      if (rawPrep) levels.push(rawPrep.risk);
      explanations.push(firstSentence(food.summary, 80));
    }
    for (const pid of food.parasiteIds ?? []) {
      const parasite = index.parasiteById.get(pid);
      if (parasite) parasites.push(parasite.name);
    }
  }
  for (const pid of parasiteIds) {
    const parasite = index.parasiteById.get(pid);
    if (!parasite) continue;
    labels.push(parasite.name);
    const levelsFromScenarios = (parasite.riskScenarios ?? [])
      .map((scenario) => scenario.riskLevel)
      .filter((level): level is RiskLevel => Boolean(level));
    levels.push(...levelsFromScenarios);
    if (parasite.tagline) explanations.push(parasite.tagline);
  }

  if (preps.length > 0) labels.unshift(...prepLabels(preps, 2));
  const level = levels.reduce<RiskLevel>(
    (acc, item) => (RISK_RANK[item] > RISK_RANK[acc] ? item : acc),
    'unknown',
  );
  return {
    text: sideText,
    label: labels.length > 0 ? uniq(labels).join('、') : sideText,
    level,
    explanation: explanations[0] ?? '',
    parasiteIds: uniq(parasites),
  };
}

function comparisonSection(ctx: SectionContext, left: SideEvaluation, right: SideEvaluation): ChatSection | null {
  const bullets = [
    `${left.text}（${left.label}）：风险${VERDICT_LABELS[left.level]}`,
    `${right.text}（${right.label}）：风险${VERDICT_LABELS[right.level]}`,
  ];
  const paragraphs: string[] = [];
  if (left.explanation) paragraphs.push(`「${left.text}」：${left.explanation}`);
  if (right.explanation) paragraphs.push(`「${right.text}」：${right.explanation}`);
  const sourceIds = uniq(
    retrievalSourcesForEntities(
      ctx.index,
      uniq([...left.parasiteIds, ...right.parasiteIds]),
      ctx.retrieval,
    ),
  );
  if (paragraphs.length === 0 && bullets.length === 0) return null;
  return {
    kind: 'why',
    title: '两者的差异在哪里',
    paragraphs: paragraphs.slice(0, 3),
    bullets,
    ...(sourceIds.length > 0 ? { sourceIds: sourceIds.slice(0, 6) } : {}),
  };
}

function retrievalSourcesForEntities(index: RagIndex, names: string[], retrieval: RetrievalResult): string[] {
  const ids: string[] = [];
  for (const hit of retrieval.parasites) {
    if (names.includes(hit.parasite.name)) {
      ids.push(...(hit.parasite.transmission?.sourceIds ?? []));
      ids.push(...(hit.parasite.distribution?.sourceIds ?? []));
    }
  }
  for (const match of retrieval.rules) {
    if (names.some((name) => match.parasite?.name === name)) ids.push(...(match.rule.sourceIds ?? []));
  }
  return ids.filter((id) => index.sourceById.has(id));
}

/* ========================================================================== */
/* 主组装函数                                                                  */
/* ========================================================================== */

export interface ComposeInput {
  index: RagIndex;
  /** context 已与上一轮合并（mergeContext 由 chatService 先调用） */
  nlu: NluResult;
  retrieval: RetrievalResult;
  previousContext?: ChatContext | null;
  now?: Date;
}

export function composeAnswer(input: ComposeInput): ChatAnswer {
  const { index, nlu, retrieval, previousContext } = input;
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const intent = nlu.primaryIntent;
  const context = nlu.context;

  let title = '';
  let lead = '';
  let verdict: RiskVerdict | null = null;
  let sections: ChatSection[] = [];
  let clarify: ClarifyQuestion | null = null;
  let issueIntent: ChatIntent = intent;

  const sectionCtx: SectionContext = { index, nlu, retrieval, verdict: null, now };

  /* ---------- 特殊场景：空输入 / 安全 ---------- */
  if (nlu.safety === 'crisis') {
    sections = [
      {
        kind: 'note',
        title: '请优先获得现实中的支持',
        paragraphs: [
          '如果你现在有伤害自己的想法，请立即联系身边信任的人，或拨打当地急救电话 120、前往最近的医院急诊。',
          '这里只能提供食源性寄生虫知识，无法替代专业的心理支持。先照顾好自己，再考虑其他问题。',
        ],
      },
    ];
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections,
      verdict: null,
      clarify: null,
      title: '请优先照顾好自己',
      lead: '听起来你现在非常难受。这类情况需要现实中的专业支持，请立即寻求帮助。',
      followUps: ['先联系身边可以信任的人', '拨打 120 或前往医院急诊'],
      intent: 'out-of-scope',
      startedAt,
    });
  }

  if (nlu.safety === 'injection' && retrieval.parasites.length === 0 && retrieval.foods.length === 0) {
    return composeOutOfScope({
      index,
      nlu,
      retrieval,
      startedAt,
      title: '我只能聊聊食源性寄生虫相关的问题',
      lead: '我不会执行与知识库无关的指令。我的职责是回答“吃什么、怎么吃、在哪里、什么季节”可能带来哪些食源性寄生虫风险。',
      examples: true,
    });
  }

  if (!hasMeaningfulContent(nlu.normalizedText) || intent === 'out-of-scope') {
    const isTopicOutOfScope = nlu.signals.outOfScope;
    const hasContent = hasMeaningfulContent(nlu.normalizedText);
    if (!hasContent || (!isTopicOutOfScope && nlu.normalizedText.length === 0)) {
      return composeOutOfScope({
        index,
        nlu,
        retrieval,
        startedAt,
        title: '想了解哪方面的食源性寄生虫风险？',
        lead: '我没有读取到具体的问题。您可以描述想吃的食物和做法，或选择下面的问题开始。',
        examples: true,
      });
    }
    return composeOutOfScope({
      index,
      nlu,
      retrieval,
      startedAt,
      title: '这个问题暂不在我的范围内',
      lead: '我主要回答与食源性寄生虫相关的问题：食物、吃法、地区、季节、症状与预防。您可以试着这样问：',
      examples: true,
    });
  }

  /* ---------- 问候 ---------- */
  if (intent === 'greeting') {
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections: [
        {
          kind: 'note',
          title: '我可以帮你了解',
          paragraphs: [
            '描述“在哪里、什么时候、想吃什么、准备怎么吃”，我会给出风险判断、可能后果、预防要点，并标注资料依据。',
            '本网站只提供食源性寄生虫知识，不能替代医生诊断；如有不适请及时就医。',
          ],
          bullets: ['食物与吃法的风险判断', '地区与季节相关证据', '症状、预防与就医提示'],
        },
      ],
      verdict: null,
      clarify: null,
      title: '你好，我是食源虫谱助手',
      lead: '我可以帮你了解食源性寄生虫的风险、后果、预防与就医提示。想先从哪里开始？',
      followUps: buildExampleQuestions(index, 4),
      intent: 'greeting',
      startedAt,
    });
  }

  /* ---------- 对比 ---------- */
  if (intent === 'comparison' && nlu.comparison) {
    const comparison = nlu.comparison;
    const left = evaluateSide(
      comparison.left,
      comparison.leftFoodIds,
      comparison.leftPreparationTags,
      comparison.leftParasiteIds,
      index,
    );
    const right = evaluateSide(
      comparison.right,
      comparison.rightFoodIds,
      comparison.rightPreparationTags,
      comparison.rightParasiteIds,
      index,
    );
    const leftRank = RISK_RANK[left.level];
    const rightRank = RISK_RANK[right.level];
    const higher = leftRank > rightRank ? left : rightRank > leftRank ? right : null;
    title = `${clip(left.text, 16)} vs ${clip(right.text, 16)}：风险对比`;
    if (higher) {
      lead = `直接回答：${higher.text}（${higher.label}）的风险更高，${higher.level === 'high' ? '属于需要重点避免的做法' : '需要结合具体条件判断'}。两者的关键差别在于处理方式：充分加热能灭活大多数寄生虫，而生食或半生做法无法可靠灭活。`;
    } else {
      lead = '直接回答：两者风险都需要注意，但风险来源不同。关键差别在于处理方式与可能涉及的寄生虫：充分加热能显著降低已知风险，生食或半生做法无法可靠灭活。';
    }
    const cmp = comparisonSection(sectionCtx, left, right);
    sections = [
      ...(cmp ? [cmp] : []),
      consequenceSection(sectionCtx),
      preventionSection(sectionCtx),
      evidenceSection(sectionCtx),
      noteSection(sectionCtx),
    ].filter((section): section is ChatSection => Boolean(section));
    clarify = buildClarify(sectionCtx);
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections,
      verdict: null,
      clarify,
      title,
      lead,
      followUps: buildFollowUps({ ...sectionCtx, retrieval }, clarify),
      intent: 'comparison',
      startedAt,
    });
  }

  /* ---------- 地理/季节类 ---------- */
  if (intent === 'region' || intent === 'season') {
    verdict = null;
    if (intent === 'region') {
      const regionNames = retrieval.regions.map((hit) => hit.name);
      const covered = retrieval.regionCoverage.filter((coverage) => coverage.hasEvidence);
      title = `${joinNames(regionNames.length > 0 ? regionNames : nlu.context.provinceCodes.map(provinceDisplayName), '地区')}：地区资料`;
      if (covered.length > 0) {
        lead = `关于${joinNames(regionNames)}：本知识库收录了相关省级调查或病例记载。需要注意，省级资料来自特定研究、监测或调查，适用范围有限，不能直接等同于个人风险。`;
      } else if (regionNames.length > 0) {
        lead = `本知识库暂未收录${joinNames(regionNames)}针对此问题的专门调查，这不代表该地区没有风险。以下提供全国层面资料与一般防护原则。`;
      } else {
        lead = '不同省份的食源性寄生虫资料差异较大。现有资料多来自特定调查或监测，不能简单横向比较；资料不足处已在回答中标注。';
      }
    } else {
      title = '季节与食源性寄生虫风险';
      const timeText = nlu.context.timeExpression ?? monthText(nlu.context.months);
      lead = timeText
        ? `您提到的时间是「${timeText}」。季节性资料需要区分“文献记载的感染高峰”和“饮食情境提示”，两者含义不同。`
        : '不同寄生虫的季节性差异很大；现有资料对多数食源性寄生虫并未给出明确季节高峰，风险更多取决于饮食方式。';
    }
    sections = [
      intent === 'region' ? regionSection(sectionCtx) : seasonSection(sectionCtx),
      intent === 'season' ? regionSection(sectionCtx) : seasonSection(sectionCtx),
      whySection(sectionCtx),
      consequenceSection(sectionCtx),
      evidenceSection(sectionCtx),
      noteSection(sectionCtx),
    ].filter((section): section is ChatSection => Boolean(section));
    clarify = buildClarify(sectionCtx);
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections,
      verdict,
      clarify,
      title,
      lead,
      followUps: buildFollowUps(sectionCtx, clarify),
      intent,
      startedAt,
    });
  }

  /* ---------- 知识 / 预防 / 症状 / 治疗 ---------- */
  if (intent === 'knowledge' || intent === 'prevention' || intent === 'symptoms' || intent === 'treatment') {
    verdict = null;
    const topParasite = retrieval.parasites[0]?.parasite ?? null;
    const topFood = retrieval.foods[0]?.food ?? null;
    /* 用户是否明确指定了对象；没有时按“一般性知识”处理，避免把通用问题讲成某一种寄生虫 */
    const hasSubjectContext = context.parasiteIds.length > 0 || context.foodIds.length > 0;
    const subject = hasSubjectContext
      ? topParasite?.name ?? topFood?.name ?? '食源性寄生虫'
      : '食源性寄生虫';
    if (intent === 'knowledge') {
      title = `${subject}：知识说明`;
      lead = hasSubjectContext && topParasite
        ? `${topParasite.name}：${firstSentence(topParasite.tagline || topParasite.summary, 120)}`
        : hasSubjectContext && topFood
          ? `${topFood.name}：${firstSentence(topFood.tagline || topFood.summary, 120)}`
          : '食源性寄生虫包括吸虫、绦虫、线虫和原虫等，主要通过生食或半生食相关食物、饮用不洁水等途径感染。';
    } else if (intent === 'prevention') {
      title = `${subject}：预防要点`;
      const keyMeasures = retrieval.prevention
        .filter((item) => item.key)
        .slice(0, 2)
        .map((item) => item.title);
      lead = hasSubjectContext && topParasite
        ? `预防${topParasite.name}感染：${keyMeasures.length > 0 ? `关键是${keyMeasures.join('、')}。` : '核心是避免生食或半生食相关食物、充分加热并注意生熟分开。'}以下是知识库中的具体防护要点。`
        : '预防食源性寄生虫，核心是「充分加热、生熟分开、选对来源」。以下是知识库中常见食源性寄生虫的一般性预防要点（不针对某种特定食物）。';
    } else if (intent === 'symptoms') {
      title = `${subject}：可能的症状与后果`;
      const consequenceTitles = retrieval.consequences.slice(0, 2).map((item) => item.title);
      lead = consequenceTitles.length > 0
        ? `感染${subject}后，文献描述的常见问题包括${consequenceTitles.join('、')}等；早期可能没有明显症状，个体差异较大。`
        : `不同的食源性寄生虫引起的症状不同，常见包括腹痛、腹泻、发热、乏力等；仅凭症状不能判断是否感染。`;
    } else {
      title = `${subject}：治疗与就医`;
      lead = '不同食源性寄生虫病的治疗方案差别较大，是否需要治疗、如何治疗必须由医生在明确诊断后决定；不要自行用药。';
    }

    sections = [
      intent === 'prevention' ? preventionSection(sectionCtx) : null,
      intent === 'prevention' ? whySection(sectionCtx) : null,
      intent === 'symptoms' ? consequenceSection(sectionCtx) : null,
      intent === 'treatment' ? treatmentSection(sectionCtx) : null,
      intent === 'knowledge' ? whySection(sectionCtx) : null,
      intent === 'knowledge' ? consequenceSection(sectionCtx) : null,
      intent !== 'prevention' && intent !== 'symptoms' && intent !== 'treatment' ? preventionSection(sectionCtx) : null,
      intent === 'symptoms' && nlu.context.exposure === 'after' ? postExposureSection(sectionCtx) : null,
      intent === 'treatment' ? postExposureSection(sectionCtx) : null,
      regionSection(sectionCtx),
      hasSeasonalTime(nlu) ? seasonSection(sectionCtx) : null,
      evidenceSection(sectionCtx),
      noteSection(sectionCtx),
    ].filter((section): section is ChatSection => Boolean(section));
    clarify = buildClarify(sectionCtx);
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections,
      verdict,
      clarify,
      title,
      lead,
      followUps: buildFollowUps(sectionCtx, clarify),
      intent,
      startedAt,
    });
  }

  /* ---------- 已食用 / 食后担忧 ---------- */
  if (intent === 'post-exposure') {
    verdict = buildVerdict({ retrieval, nlu, intent });
    sectionCtx.verdict = verdict;
    const ambiguousText = nlu.ambiguousFoods[0]?.text;
    const foodText = joinNames(foodNames(retrieval.foods), '相关食物');
    const subjectText = ambiguousText ? `“${ambiguousText}”` : foodText;
    const prepText = prepLabels(context.preparationTags).join('、');
    title = `${clip(ambiguousText ?? foodText, 16)}食用后：观察与就医提示`;
    if (verdict) {
      const exposurePhrase =
        verdict.level === 'high'
          ? `先说结论：这是一次已发生的高风险暴露，但不等于已经感染——`
          : `先说结论：这属于「${verdict.label}」，但已经食用不等于一定感染——`;
      lead = `您已经${prepText ? `${prepText}` : '食用'}了${subjectText}。${exposurePhrase}是否感染需要医生结合饮食史与检查判断。以下是一般性的观察与就医提示。`;
    } else {
      lead = `您已经食用了${subjectText}。先说明：以下是一般性的观察与就医提示，不能替代医生的面诊与检查。`;
    }
    sections = [
      postExposureSection(sectionCtx),
      consequenceSection(sectionCtx),
      treatmentSection(sectionCtx),
      preventionSection(sectionCtx),
      regionSection(sectionCtx),
      hasSeasonalTime(nlu) ? seasonSection(sectionCtx) : null,
      evidenceSection(sectionCtx),
      noteSection(sectionCtx),
    ].filter((section): section is ChatSection => Boolean(section));
    clarify = buildClarify(sectionCtx);
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections,
      verdict,
      clarify,
      title,
      lead,
      followUps: buildFollowUps(sectionCtx, clarify),
      intent: 'post-exposure',
      startedAt,
    });
  }

  /* ---------- 追问 / 澄清回答 / 食前风险评估 ---------- */
  const isFollowUpTurn = intent === 'follow-up' || intent === 'clarification-answer' || (nlu.isFollowUp && intent === 'risk-assessment');
  const previousFoodIds = previousContext?.foodIds ?? [];
  const previousProvinceCodes = previousContext?.provinceCodes ?? [];
  const previousMonths = previousContext?.months ?? [];
  const foodChanged =
    context.foodIds.length > 0 && !context.foodIds.some((id) => previousFoodIds.includes(id));
  const newPreparationTags = newlyAddedPreparationTags(context.preparationTags, previousContext);
  const newProvinceCodes = context.provinceCodes.filter((code) => !previousProvinceCodes.includes(code));
  const newMonths = context.months.filter((month) => !previousMonths.includes(month));

  /* 追问但完全没有食物/寄生虫线索：请求补充 */
  if (
    isFollowUpTurn &&
    context.foodIds.length === 0 &&
    context.parasiteIds.length === 0 &&
    retrieval.parasites.length === 0 &&
    retrieval.foods.length === 0
  ) {
    clarify = buildClarify(sectionCtx);
    const titleText = '需要先确认具体食物';
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections: [noteSection(sectionCtx)].filter((section): section is ChatSection => Boolean(section)),
      verdict: null,
      clarify,
      title: titleText,
      lead: '要继续比较不同做法或判断风险，我还需要知道您说的是哪种食物。请补充具体食物（例如淡水鱼、猪肉、福寿螺）和做法。',
      followUps: buildFollowUps({ ...sectionCtx, retrieval }, clarify),
      intent: nlu.primaryIntent,
      startedAt,
    });
  }

  /* 换做法（追问“换一种做法/怎么吃”，但没有给出新做法）：对比该食物的不同处理方式 */
  const preparationFollowUp = /(换一种|换一个|换个做法|换做法|改一种|其他做法|别的做法|怎么吃|怎么处理|做法)/.test(
    nlu.normalizedText,
  );
  if (
    isFollowUpTurn &&
    preparationFollowUp &&
    newPreparationTags.length === 0 &&
    retrieval.foods.length > 0 &&
    context.foodIds.length > 0
  ) {
    const food = retrieval.foods[0]!.food;
    const prepBullets = (food.preparations ?? []).map(
      (prep) =>
        `${prep.label}：风险${VERDICT_LABELS[prep.risk] ?? prep.risk}——${clip(prep.explanation, 90)}${prep.saferAlternative ? `（更安全：${clip(prep.saferAlternative, 60)}）` : ''}`,
    );
    const titleText = `${food.name}：不同做法风险对比`;
    return finalizeAnswer({
      index,
      nlu,
      retrieval,
      sections: [
        {
          kind: 'why',
          title: '不同做法的风险差异',
          paragraphs: [
            `同一种食物，处理方式不同，寄生虫风险差别很大。以下按知识库中${food.name}的处理方式整理：`,
          ],
          ...(prepBullets.length > 0 ? { bullets: prepBullets.slice(0, 5) } : {}),
          sourceIds: uniq((food.preparations ?? []).flatMap((prep) => prep.sourceIds ?? [])),
        },
      ],
      verdict: null,
      clarify: null,
      title: titleText,
      lead: '不同做法的风险差别很大：充分加热是降低已知寄生虫风险最可靠的方式，生食、半生、腌制与烧烤等方式不能可靠灭活寄生虫。具体风险取决于火候、食材大小与来源。',
      followUps: buildFollowUps({ ...sectionCtx, retrieval }, null),
      intent: nlu.primaryIntent,
      startedAt,
    });
  }

  /* 标准食前风险评估 / 条件更新 */
  verdict = buildVerdict({ retrieval, nlu, intent: 'risk-assessment' });
  sectionCtx.verdict = verdict;
  const foodsText = joinNames(foodNames(retrieval.foods), '该食物');
  const prepText = prepLabels(context.preparationTags).join('、');
  const parasiteText = joinNames(parasiteNames(retrieval.parasites, 2), '相关寄生虫');
  const provinceText = joinNames(context.provinceCodes.map(provinceDisplayName));
  const monthsText = monthText(context.months);

  /* 标题 */
  if (intent === 'follow-up' || intent === 'clarification-answer') {
    title = '已按补充的条件更新判断';
  } else if (retrieval.foods.length > 0) {
    title = prepText ? `${foodsText}（${prepText}）：风险与预防` : `${foodsText}：寄生虫风险`;
  } else if (retrieval.parasites.length > 0) {
    title = `${parasiteText}：风险与预防`;
  } else {
    title = '食源性寄生虫风险判断';
  }

  /* lead：先直接回答 */
  const conditionText = [prepText, foodsText, provinceText ? `${provinceText}地区` : '', monthsText].filter(Boolean).join(' · ');
  let changePrefix = '';
  if (isFollowUpTurn) {
    const changes: string[] = [];
    if (newPreparationTags.length > 0) changes.push(`做法：${prepLabels(newPreparationTags).join('、')}`);
    if (foodChanged) changes.push(`食物：${foodsText}`);
    if (newProvinceCodes.length > 0) changes.push(`地区：${joinNames(newProvinceCodes.map(provinceDisplayName))}`);
    if (newMonths.length > 0) changes.push(`时间：${monthText(newMonths)}`);
    if (changes.length > 0) changePrefix = `你补充了${changes.join('、')}。`;
  }

  if (verdict) {
    const verdictParasiteNames = verdict.parasiteIds
      .map((id) => index.parasiteById.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    const verdictParasiteText = joinNames(verdictParasiteNames.slice(0, 3), '');
    switch (verdict.level) {
      case 'high':
        lead = `${changePrefix}直接回答：${conditionText || '这种情况'}属于「${verdict.label}」，${verdictParasiteText ? `可能涉及${verdictParasiteText}感染。` : ''}知识库规则：${verdict.rationale[0] ?? ''}`;
        break;
      case 'moderate':
        lead = `${changePrefix}直接回答：${conditionText || '这种情况'}属于「${verdict.label}」，${verdictParasiteText ? `存在感染${verdictParasiteText}的风险，` : ''}具体风险受处理方式、来源与个体情况影响。`;
        break;
      case 'low':
        lead = `${changePrefix}直接回答：风险较低。${PREP_EXPLAIN['fully-cooked'] ?? ''}`;
        break;
      case 'contextual': {
        const missing = retrieval.foods.length === 0
          ? '具体食物'
          : context.preparationTags.length === 0
            ? '具体做法'
            : '更多条件';
        lead = `${changePrefix}直接回答：${conditionText || '目前的信息'}是否安全，取决于${missing}。${verdict.rationale[0] ?? ''}`;
        break;
      }
      default:
        lead =
          retrieval.foods.length === 0 && retrieval.parasites.length === 0
            ? `${changePrefix}我先了解一下情况：请告诉我想了解的食物和吃法（例如“生吃淡水鱼”“涮羊肉”），我再帮您判断风险。`
            : `${changePrefix}直接回答：现有资料不足以判断。知识库暂未收录足够信息，资料不足不代表没有风险。`;
    }
  } else {
    lead = `${changePrefix}我正在按知识库资料帮您梳理相关风险与预防要点。`;
  }

  /* 歧义提示 */
  if (nlu.ambiguousFoods.length > 0 && intent !== 'comparison') {
    lead += ` 您提到的“${nlu.ambiguousFoods[0]!.text}”存在歧义：${nlu.ambiguousFoods[0]!.note}`;
  }

  /* 地区证据提示（有明确记载时简短带一句） */
  const coveredRegion = retrieval.regions.find((hit) => hit.entries.length > 0);
  if (coveredRegion) {
    lead += ` 关于${coveredRegion.name}：本知识库收录了相关省级资料，详见下方“地区资料”。`;
  } else if (provinceText && retrieval.regionCoverage.some((coverage) => !coverage.hasEvidence)) {
    lead += ` 本知识库暂未收录${provinceText}针对此问题的专门调查，这不代表该地区没有风险。`;
  }

  sections = [
    whySection(sectionCtx),
    consequenceSection(sectionCtx),
    preventionSection(sectionCtx),
    regionSection(sectionCtx),
    hasSeasonalTime(nlu) ? seasonSection(sectionCtx) : null,
    evidenceSection(sectionCtx),
    noteSection(sectionCtx),
  ].filter((section): section is ChatSection => Boolean(section));
  clarify = buildClarify(sectionCtx);

  return finalizeAnswer({
    index,
    nlu,
    retrieval,
    sections,
    verdict,
    clarify,
    title,
    lead: lead.replace(/\s+/g, ' ').trim(),
    followUps: buildFollowUps(sectionCtx, clarify),
    intent,
    startedAt,
  });
}

/* ========================================================================== */
/* 最终组装                                                                    */
/* ========================================================================== */

interface FinalizeInput {
  index: RagIndex;
  nlu: NluResult;
  retrieval: RetrievalResult;
  sections: ChatSection[];
  verdict: RiskVerdict | null;
  clarify: ClarifyQuestion | null;
  title: string;
  lead: string;
  followUps: string[];
  intent: ChatIntent;
  startedAt: number;
}

function sectionCharLength(section: ChatSection): number {
  return (
    section.title.length +
    section.paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0) +
    (section.bullets ?? []).reduce((sum, bullet) => sum + bullet.length, 0)
  );
}

/**
 * 控制回答体积：优先保留“直接回答 → 原因 → 后果 → 预防”的主干，
 * 超长时先削减补充性章节（依据/季节/说明/地区），再压缩最长章节的条目。
 */
function shrinkSections(sections: ChatSection[], budget: number): ChatSection[] {
  let total = sections.reduce((sum, section) => sum + sectionCharLength(section), 0);
  if (total <= budget) return sections;
  const result = [...sections];
  const dropOrder: ChatSectionKind[] = ['evidence', 'season', 'note', 'region', 'consequence', 'prevention'];
  for (const kind of dropOrder) {
    if (total <= budget || result.length <= 2) break;
    const index = result.findIndex((section) => section.kind === kind);
    if (index < 0) continue;
    total -= sectionCharLength(result[index]!);
    result.splice(index, 1);
  }
  let guard = 0;
  while (total > budget && result.length > 0 && guard < 24) {
    guard += 1;
    let target = result[0]!;
    for (const section of result) {
      if (sectionCharLength(section) > sectionCharLength(target)) target = section;
    }
    if (target.bullets && target.bullets.length > 1) {
      const removed = target.bullets.pop() ?? '';
      total -= removed.length;
    } else if (target.paragraphs.length > 1) {
      const removed = target.paragraphs.pop() ?? '';
      total -= removed.length;
    } else if (result.length > 1) {
      const index = result.indexOf(target);
      total -= sectionCharLength(target);
      if (index >= 0) result.splice(index, 1);
    } else {
      break;
    }
  }
  return sections.filter((section) => result.includes(section));
}

function finalizeAnswer(input: FinalizeInput): ChatAnswer {
  const { index, nlu, retrieval, sections: inputSections, verdict, clarify, title, followUps, intent } = input;
  const context = nlu.context;
  const lead = clip(input.lead, 540);
  const sections = shrinkSections(inputSections, Math.max(1500, 3300 - lead.length));

  const sectionCtx: SectionContext = { index, nlu, retrieval, verdict, now: new Date() };
  const citations = buildCitations(sectionCtx, sections, verdict);

  /*
   * related.parasiteIds 与 verdict 保持同一口径：
   *  - 风险评估/食后：只来自与食物+处理方式匹配的高/中风险规则与场景（verdict.parasiteIds）；
   *  - 用户明确提到的寄生虫始终保留；
   *  - 地区/季节回答：使用地区证据中涉及的寄生虫；
   *  - 没有食物/寄生虫的通用知识回答：才使用通用候选（会在文案中注明“一般性知识”）。
   */
  const relatedParasiteIds = uniq([
    ...(verdict?.parasiteIds ?? []),
    ...context.parasiteIds,
    ...(intent === 'comparison' ? retrieval.parasites.slice(0, 3).map((hit) => hit.parasite.id) : []),
    ...(intent === 'region' || intent === 'season'
      ? retrieval.regions.flatMap((hit) => hit.entries.flatMap((evidence) => evidence.entry.parasiteIds)).slice(0, 4)
      : []),
    /* 处理方式未知（contextual/unknown）时，食物本身关联的寄生虫可作为关联实体，但不写入 verdict */
    ...(verdict && ['contextual', 'unknown'].includes(verdict.level) && context.foodIds.length > 0
      ? retrieval.parasites.slice(0, 2).map((hit) => hit.parasite.id)
      : []),
    ...(context.foodIds.length === 0 &&
    context.parasiteIds.length === 0 &&
    ['prevention', 'knowledge', 'symptoms', 'treatment'].includes(intent)
      ? retrieval.parasites.slice(0, 3).map((hit) => hit.parasite.id)
      : []),
  ]).slice(0, 6);
  const relatedFoodIds = uniq(retrieval.foods.map((hit) => hit.food.id)).slice(0, 6);
  const relatedRegionCodes = uniq(retrieval.regions.map((hit) => hit.code)).slice(0, 6);
  const ruleIds = uniq(retrieval.rules.map((match) => match.rule.id)).slice(0, 6);

  const hasMap = context.provinceCodes.length > 0 || context.foodIds.length > 0 || context.parasiteIds.length > 0;
  const mapQuery = hasMap
    ? {
        provinceCodes: context.provinceCodes,
        foodIds: context.foodIds.filter((id) => index.foodById.has(id)),
        months: context.months,
        parasiteIds: context.parasiteIds.filter((id) => index.parasiteById.has(id)),
        preparationTags: context.preparationTags,
      }
    : null;

  let disclaimer = DISCLAIMER_BASE;
  const extra = DISCLAIMER_EXTRA[intent];
  if (extra) disclaimer = `${DISCLAIMER_BASE} ${extra}`;

  const followUpsFinal = followUps.length >= 2 ? followUps.slice(0, 4) : buildExampleQuestions(index, 3);

  return {
    intent,
    secondaryIntents: nlu.secondaryIntents,
    title,
    lead,
    verdict,
    sections,
    followUps: followUpsFinal,
    clarify,
    citations,
    context,
    related: {
      parasiteIds: relatedParasiteIds,
      foodIds: relatedFoodIds,
      regionCodes: relatedRegionCodes,
      sourceIds: citations.map((citation) => citation.sourceId),
      ruleIds,
    },
    mapQuery,
    disclaimer,
    generatedBy: 'rules',
    elapsedMs: Math.max(1, Date.now() - input.startedAt),
  };
}

interface OutOfScopeInput {
  index: RagIndex;
  nlu: NluResult;
  retrieval: RetrievalResult;
  startedAt: number;
  title: string;
  lead: string;
  examples: boolean;
}

function composeOutOfScope(input: OutOfScopeInput): ChatAnswer {
  const { index, nlu, retrieval } = input;
  const examples = buildExampleQuestions(index, 3);
  const sections: ChatSection[] = [
    {
      kind: 'note',
      title: '我可以回答的问题类型',
      paragraphs: [
        '例如：某种食物生吃/半生/煮熟的风险，已食用后的观察与就医提示，地区与季节资料，以及某种寄生虫的传播与预防知识。',
        '我不提供个人诊断、不推荐具体用药剂量，也不处理与食源性寄生虫无关的问题。',
      ],
      bullets: examples,
    },
  ];
  return finalizeAnswer({
    index,
    nlu,
    retrieval,
    sections,
    verdict: null,
    clarify: null,
    title: input.title,
    lead: input.lead,
    followUps: examples,
    intent: 'out-of-scope',
    startedAt: input.startedAt,
  });
}

/* ========================================================================== */
/* 降级回答（内部异常时保证不 500）                                             */
/* ========================================================================== */

/** 内部异常时的规则降级回答：仍然结构化、带边界声明、不编造引用 */
export function composeFallbackAnswer(index: RagIndex | null, now = new Date()): ChatAnswer {
  const examples = index ? buildExampleQuestions(index, 4) : DEFAULT_QUESTIONS.slice(0, 4);
  const context: ChatContext = {
    provinceCodes: [],
    months: [],
    foodIds: [],
    preparationTags: [],
    parasiteIds: [],
    exposure: 'unknown',
    symptoms: [],
  };
  return {
    intent: 'out-of-scope',
    secondaryIntents: [],
    title: '回答暂时不可用',
    lead: '抱歉，刚才的处理出现了问题。您可以换一种说法再试一次，或从下面的示例问题开始。',
    verdict: null,
    sections: [
      {
        kind: 'note',
        title: '可以尝试这样问',
        paragraphs: ['把食物、做法、地区和时间说清楚，通常能获得更准确的回答。'],
        bullets: examples.slice(0, 3),
      },
    ],
    followUps: examples,
    clarify: null,
    citations: [],
    context,
    related: { parasiteIds: [], foodIds: [], regionCodes: [], sourceIds: [], ruleIds: [] },
    mapQuery: null,
    disclaimer: DISCLAIMER_BASE,
    generatedBy: 'rules',
    elapsedMs: 1,
  };
}
