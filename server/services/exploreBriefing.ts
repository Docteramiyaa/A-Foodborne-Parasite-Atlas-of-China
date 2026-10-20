/**
 * 探索页单一结果（ExploreBriefing）。
 *
 * 产品语义见 相关约定：
 * - 条件未填写 = 尚未限定，不静默切换规则；
 * - 当前风险只来自「所选食物的 preparations 中匹配所选做法的对象」，绝不用 food.parasiteIds
 *   或关联寄生虫绕过做法条件生成当前风险；
 * - 食源相关但当前做法未列入风险的寄生虫 → relatedParasites（相关知识），不进 currentRisks；
 * - 地区与季节是背景细化：本地无记录/季节未收录不删除一般风险，只补充说明；
 * - 输出面向普通读者，不出现“证据等级 / 风险组合 / 矩阵 / 条目级”等内部术语。
 *
 * 与前代 ExploreResult 的关系：旧 server/services/explore.ts 保留不动（兼容旧测试），
 * 本文件是 GET /api/explore 的新实现。
 */
import type {
  ExploreBriefing,
  ExploreBriefingQuery,
  ExplorePreparationOption,
  ExploreProtection,
  ExploreRegionKnowledge,
  ExploreRelatedParasite,
  ExploreRiskItem,
  ExploreSeasonGroup,
  ExploreSituation,
  Food,
  FoodSummary,
  Parasite,
  ParasiteSummary,
  PreparationTag,
  Region,
  RiskLevel,
  RiskRule,
  SeasonId,
  SeasonRelation,
  SourceBrief,
} from '../../shared/types.js';
import { PREPARATION_TAGS, REGION_STATUS_RANK } from '../data/loader.js';
import type { KnowledgeStore } from '../data/store.js';

/* ========================================================================== */
/* 季节常量                                                                    */
/* ========================================================================== */

export const SEASON_IDS: readonly SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_INFO: Record<SeasonId, { label: string; months: number[] }> = {
  spring: { label: '春季', months: [3, 4, 5] },
  summer: { label: '夏季', months: [6, 7, 8] },
  autumn: { label: '秋季', months: [9, 10, 11] },
  winter: { label: '冬季', months: [12, 1, 2] },
};

/** 面向自然语句的短做法名（数据里的 label 较长，适合输入控件） */
const PREP_ACTION_LABELS: Record<PreparationTag, string> = {
  raw: '生食',
  undercooked: '半生或欠火候',
  'cured-smoked': '腌制或烟熏',
  grilled: '烧烤',
  'fully-cooked': '充分加热',
  'boiled-water': '煮沸',
  'unwashed-produce': '未洗净生食',
  unknown: '做法不明',
};

const RISK_WEIGHT: Record<RiskLevel, number> = {
  high: 4,
  moderate: 3,
  contextual: 2,
  low: 1,
  unknown: 0,
};

const SEASON_GROUP_ORDER: SeasonRelation[] = ['peak', 'all-year', 'off-peak', 'not-recorded', 'unknown'];

/* ========================================================================== */
/* 小工具                                                                      */
/* ========================================================================== */

const uniq = <T>(values: readonly T[]): T[] => [...new Set(values)];

const isSeasonId = (value: unknown): value is SeasonId =>
  typeof value === 'string' && (SEASON_IDS as readonly string[]).includes(value);

/** 中文并列：A、B和C */
function joinChinese(names: readonly string[]): string {
  const list = uniq(names.filter((name) => Boolean(name && name.trim())));
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]}和${list[1]}`;
  return `${list.slice(0, -1).join('、')}和${list[list.length - 1]}`;
}

/** 取第一句短句（用于季节说明等背景文案） */
function firstSentence(text: string | undefined, max = 42): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const match = clean.match(/^[^。！？；]+[。！？]?/);
  const sentence = (match?.[0] ?? clean).replace(/[。！？]$/, '').trim();
  return sentence.length > max ? `${sentence.slice(0, max)}…` : sentence;
}

function toFoodSummary(food: Food): FoodSummary {
  return {
    id: food.id,
    name: food.name,
    categoryId: food.categoryId,
    categoryLabel: food.categoryLabel,
    tagline: food.tagline,
    parasiteIds: [...food.parasiteIds],
    featured: food.featured,
  };
}

function toParasiteSummary(parasite: Parasite): ParasiteSummary {
  return {
    id: parasite.id,
    name: parasite.name,
    latinName: parasite.latinName,
    category: parasite.category,
    categoryLabel: parasite.categoryLabel,
    tagline: parasite.tagline,
    foodIds: [...parasite.foodIds],
    foodCategoryIds: [...parasite.foodCategoryIds],
    featured: parasite.featured,
    evidenceLevel: parasite.evidence.level,
    seasonPeakMonths: [...parasite.seasonality.peakMonths],
    regionCount: 0,
    consequencesSummary: parasite.consequences
      .slice(0, 2)
      .map((item) => item.title)
      .join('；'),
  };
}

function toPreparationOption(preparation: Food['preparations'][number]): ExplorePreparationOption {
  return {
    tag: preparation.tag,
    label: preparation.label,
    risk: preparation.risk,
    parasiteIds: [...preparation.parasiteIds],
    explanation: preparation.explanation,
    ...(preparation.saferAlternative ? { saferAlternative: preparation.saferAlternative } : {}),
    sourceIds: [...preparation.sourceIds],
  };
}

function taxonomyPreparationOption(store: KnowledgeStore, tag: PreparationTag): ExplorePreparationOption | null {
  const meta = store.taxonomy.preparations.find((item) => item.id === tag);
  if (!meta) return null;
  return {
    tag,
    label: meta.name,
    risk: meta.riskTendency,
    parasiteIds: [],
    explanation: meta.description,
    sourceIds: [],
  };
}

/** 由来源 id 生成 SourceBrief（url/doi 均来自 loader 已归一化的 Source，不造链接） */
function collectSourceBriefs(store: KnowledgeStore, sourceIds: readonly string[]): SourceBrief[] {
  const wanted = new Set(sourceIds);
  return store.sources
    .filter((source) => wanted.has(source.id))
    .map((source) => ({
      id: source.id,
      title: source.title,
      ...(source.authors ? { authors: source.authors } : {}),
      ...(source.venue ? { venue: source.venue } : {}),
      year: source.year,
      ...(source.url ? { url: source.url } : {}),
      ...(source.doi ? { doi: source.doi } : {}),
    }));
}

function buildRegionKnowledge(region: Region): ExploreRegionKnowledge {
  const entries = region.entries.map((entry) => ({
    id: entry.id,
    headline: entry.headline,
    detail: entry.detail,
    parasiteIds: [...entry.parasiteIds],
    sourceIds: [...entry.sourceIds],
  }));
  return {
    code: region.code,
    name: region.name,
    intro: region.intro,
    foodCulture: [...region.foodCulture],
    entries,
    sourceIds: uniq([...region.sourceIds, ...entries.flatMap((entry) => entry.sourceIds)]),
  };
}

/* ========================================================================== */
/* 季节关系                                                                    */
/* ========================================================================== */

/** 计算寄生虫与所选季节的关系与短说明（高峰不等于唯一可能；未收录不等于不匹配） */
function seasonRelationFor(
  parasite: Parasite,
  seasonMonths: readonly number[],
  seasonLabel: string,
): { relation: SeasonRelation; note: string } {
  const peakMonths = uniq(
    parasite.seasonality.peakMonths.filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
  );
  const pattern = parasite.seasonality.pattern ?? '';

  if (peakMonths.length === 12 || /全年/.test(pattern)) {
    return { relation: 'all-year', note: '资料显示全年均可发生，本季也包含在内。' };
  }
  if (peakMonths.length > 0) {
    const overlap = peakMonths.filter((month) => seasonMonths.includes(month)).sort((a, b) => a - b);
    if (overlap.length > 0) {
      return {
        relation: 'peak',
        note: `文献报告的高峰月份包含${overlap.map((month) => `${month}月`).join('、')}；高峰不等于唯一可能。`,
      };
    }
    return {
      relation: 'off-peak',
      note: `文献报告的高峰在${peakMonths.sort((a, b) => a - b).map((month) => `${month}月`).join('、')}，与所选季节不同；这不等于不会发生。`,
    };
  }
  if (!pattern.trim() || /未|无|不明|不详/.test(pattern)) {
    return {
      relation: 'not-recorded',
      note: `${seasonLabel}未收录明确的季节资料；未收录不等于不匹配。`,
    };
  }
  return { relation: 'unknown', note: '现有季节资料不足以判断与本季的关系。' };
}

function seasonGroupLabel(relation: SeasonRelation, seasonLabel: string): string {
  switch (relation) {
    case 'peak':
      return `${seasonLabel}是报告高峰`;
    case 'all-year':
      return '全年均可发生';
    case 'off-peak':
      return `报告高峰不在${seasonLabel}`;
    case 'not-recorded':
      return '现有资料未收录明确季节资料';
    default:
      return '季节资料不足';
  }
}

/* ========================================================================== */
/* 内部上下文                                                                  */
/* ========================================================================== */

interface BriefingContext {
  store: KnowledgeStore;
  region: Region | null;
  seasons: SeasonId[];
  seasonMonths: number[];
  seasonLabel: string;
  foods: Food[];
  preparationTags: PreparationTag[];
  parasites: Parasite[];
  foodSummaryById: Map<string, FoodSummary>;
  parasiteSummaryById: Map<string, ParasiteSummary>;
  /** 构建后的风险项（就地补充 regionNote / seasonRelation，不删除一般风险） */
  currentRisksForEnrichment: ExploreRiskItem[];
}

interface FoodPreparationPair {
  food: Food;
  preparation: Food['preparations'][number];
}

/** 与「寄生虫 × 所选省份」相关的本地条目（按状态强弱排序，取最强者） */
function bestLocalEntries(region: Region | null, parasiteId: string): Region['entries'] {
  if (!region) return [];
  return region.entries
    .filter((entry) => entry.parasiteIds.includes(parasiteId))
    .sort(
      (a, b) =>
        REGION_STATUS_RANK[b.status] - REGION_STATUS_RANK[a.status] || a.id.localeCompare(b.id),
    );
}

/** 风险说明可引用的规则知识（只用于 conditions/sourceIds，不用于生成风险） */
function matchedRules(
  ctx: BriefingContext,
  parasiteId: string,
  foodId: string,
  preparationTag: PreparationTag,
): RiskRule[] {
  const food = ctx.store.foodById.get(foodId);
  return ctx.store.rules.filter((rule) => {
    if (rule.parasiteId !== parasiteId) return false;
    const foodMatch =
      (rule.when.foodIds ?? []).includes(foodId) ||
      (rule.when.foodCategoryIds ?? []).some((categoryId) => categoryId === food?.categoryId);
    const prepMatch = !rule.when.preparationTags?.length || rule.when.preparationTags.includes(preparationTag);
    return foodMatch && prepMatch;
  });
}

/** 该处理已阻断的已知寄生虫：优先取 explanation 明确提到的，其次回退到该食物的已知寄生虫 */
function blockedParasites(ctx: BriefingContext, pair: FoodPreparationPair): Parasite[] {
  const candidates = pair.food.parasiteIds
    .map((id) => ctx.store.parasiteById.get(id))
    .filter((parasite): parasite is Parasite => Boolean(parasite));
  const mentioned = candidates.filter((parasite) => {
    const terms = [parasite.name, ...parasite.aliases].filter(Boolean);
    return terms.some((term) => term && pair.preparation.explanation.includes(term));
  });
  const blocked = mentioned.length ? mentioned : candidates;
  return [...blocked].sort((a, b) => a.order - b.order);
}

/* ========================================================================== */
/* 当前风险 / 有效处理 / 相关知识                                              */
/* ========================================================================== */

interface RiskBuildResult {
  risks: ExploreRiskItem[];
  /** 参与当前风险的寄生虫 id（用于 relatedParasites 排除） */
  parasiteIds: Set<string>;
  /** 命中的做法 tag（用于 headline/summary） */
  tags: PreparationTag[];
  hasConcreteRisk: boolean;
  hasContextualRisk: boolean;
}

function buildCurrentRisks(ctx: BriefingContext, pairs: FoodPreparationPair[]): RiskBuildResult {
  interface Accumulator {
    parasite: Parasite;
    riskLevel: RiskLevel;
    explanation: string;
    conditions: Set<string>;
    sourceIds: Set<string>;
  }
  const accumulators = new Map<string, Accumulator>();
  const tags = new Set<PreparationTag>();

  for (const pair of pairs) {
    const { food, preparation } = pair;
    if (!preparation.parasiteIds.length) continue;
    tags.add(preparation.tag);
    for (const parasiteId of preparation.parasiteIds) {
      const parasite = ctx.store.parasiteById.get(parasiteId);
      if (!parasite) continue;
      const rules = matchedRules(ctx, parasiteId, food.id, preparation.tag);
      const current = accumulators.get(parasiteId);
      if (!current) {
        accumulators.set(parasiteId, {
          parasite,
          riskLevel: preparation.risk,
          explanation: preparation.explanation,
          conditions: new Set(rules.flatMap((rule) => rule.conditions ?? [])),
          sourceIds: new Set([
            ...preparation.sourceIds,
            ...rules.flatMap((rule) => rule.sourceIds),
          ]),
        });
        continue;
      }
      // 同寄生虫合并：保留更高风险等级的解释，条件/来源取并集
      if (RISK_WEIGHT[preparation.risk] > RISK_WEIGHT[current.riskLevel]) {
        current.riskLevel = preparation.risk;
        current.explanation = preparation.explanation;
      }
      for (const condition of rules.flatMap((rule) => rule.conditions ?? [])) current.conditions.add(condition);
      for (const sourceId of [...preparation.sourceIds, ...rules.flatMap((rule) => rule.sourceIds)]) {
        current.sourceIds.add(sourceId);
      }
    }
  }

  const risks: ExploreRiskItem[] = [];
  const parasiteIds = new Set<string>();
  for (const accumulator of accumulators.values()) {
    if (accumulator.riskLevel === 'unknown') continue; // unknown 做法不生成当前风险（见 incomplete 分支）
    const parasite = accumulator.parasite;
    parasiteIds.add(parasite.id);
    const consequenceSourceIds = parasite.consequences.flatMap((item) => item.sourceIds);
    const preventionSourceIds = parasite.prevention.flatMap((item) => item.sourceIds ?? []);
    risks.push({
      parasite: ctx.parasiteSummaryById.get(parasite.id) ?? toParasiteSummary(parasite),
      riskLevel: accumulator.riskLevel,
      explanation: accumulator.explanation,
      ...(accumulator.conditions.size ? { conditions: [...accumulator.conditions].slice(0, 3) } : {}),
      seasonRelation: 'unknown',
      consequences: parasite.consequences.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        severity: item.severity,
      })),
      prevention: parasite.prevention.map((item) => ({
        title: item.title,
        detail: item.detail,
        key: Boolean(item.key),
      })),
      sourceIds: [...new Set([...accumulator.sourceIds, ...consequenceSourceIds, ...preventionSourceIds])],
    });
  }

  risks.sort(
    (a, b) =>
      RISK_WEIGHT[b.riskLevel] - RISK_WEIGHT[a.riskLevel] ||
      (ctx.store.parasiteById.get(a.parasite.id)?.order ?? 999) -
        (ctx.store.parasiteById.get(b.parasite.id)?.order ?? 999) ||
      a.parasite.id.localeCompare(b.parasite.id),
  );

  return {
    risks,
    parasiteIds,
    tags: [...tags],
    hasConcreteRisk: risks.some(
      (risk) => risk.riskLevel === 'high' || risk.riskLevel === 'moderate' || risk.riskLevel === 'low',
    ),
    hasContextualRisk: risks.some((risk) => risk.riskLevel === 'contextual'),
  };
}

interface ProtectionBuildResult {
  protections: ExploreProtection[];
  blockedParasiteIds: Set<string>;
  tags: PreparationTag[];
}

function buildEffectiveProtections(
  ctx: BriefingContext,
  pairs: FoodPreparationPair[],
  selectedParasiteIds: ReadonlySet<string>,
): ProtectionBuildResult {
  const protections: ExploreProtection[] = [];
  const blockedParasiteIds = new Set<string>();
  const tags = new Set<PreparationTag>();
  const seen = new Set<string>();

  for (const pair of pairs) {
    const { food, preparation } = pair;
    const key = `${food.id}::${preparation.tag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tags.add(preparation.tag);
    const allBlocked = blockedParasites(ctx, pair);
    // 无论是否按寄生虫筛选，都记录“该做法已阻断”的全集（用于排除相关知识重复）
    for (const parasite of allBlocked) blockedParasiteIds.add(parasite.id);
    const blocked = selectedParasiteIds.size
      ? allBlocked.filter((parasite) => selectedParasiteIds.has(parasite.id))
      : allBlocked;
    if (selectedParasiteIds.size && !blocked.length) continue;
    const names = blocked.map((parasite) => parasite.name);
    const rules = blocked.flatMap((parasite) => matchedRules(ctx, parasite.id, food.id, preparation.tag));
    const action = PREP_ACTION_LABELS[preparation.tag] ?? preparation.tag;
    protections.push({
      title: names.length
        ? `${action}使${food.name}中已知的${joinChinese(names)}风险不再成立`
        : `${action}是${food.name}的有效处理方式`,
      detail: preparation.explanation,
      parasiteNames: names,
      sourceIds: uniq([
        ...preparation.sourceIds,
        ...rules.flatMap((rule) => rule.sourceIds),
        ...(preparation.sourceIds.length ? [] : food.sourceIds),
      ]),
    });
  }
  return { protections, blockedParasiteIds, tags: [...tags] };
}

/** 食源相关但当前做法下未列入当前风险/已阻断的寄生虫（相关知识） */
function buildRelatedFromFoods(
  ctx: BriefingContext,
  excludedParasiteIds: ReadonlySet<string>,
  situation: ExploreSituation,
  hasPreparation: boolean,
): ExploreRelatedParasite[] {
  const candidates = new Map<string, Parasite>();
  for (const food of ctx.foods) {
    for (const parasiteId of food.parasiteIds) {
      if (excludedParasiteIds.has(parasiteId)) continue;
      const parasite = ctx.store.parasiteById.get(parasiteId);
      if (parasite) candidates.set(parasiteId, parasite);
    }
  }
  const foods = ctx.foods.map((food) => food.name);
  const reason = !hasPreparation
    ? `与${joinChinese(foods)}有关；是否构成当前风险取决于做法，选择做法后才能判断。`
    : situation === 'effective'
      ? `与${joinChinese(foods)}有关；现有资料没有把它列入这种做法的阻断范围，需要结合其他资料判断。`
      : `与${joinChinese(foods)}有关；在当前做法下未列入当前风险，换成其他做法时需要重新判断。`;
  return [...candidates.values()]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((parasite) => ({
      parasite: ctx.parasiteSummaryById.get(parasite.id) ?? toParasiteSummary(parasite),
      reason,
    }));
}

/** 区域/季节背景细化当前风险（只补充说明，不删除一般风险） */
function enrichRisks(ctx: BriefingContext): { notices: string[] } {
  const notices: string[] = [];
  const missingLocal: string[] = [];
  let notRecorded = false;

  for (const risk of ctx.currentRisksForEnrichment) {
    const parasite = ctx.store.parasiteById.get(risk.parasite.id);
    if (!parasite) continue;
    if (ctx.region) {
      const entries = bestLocalEntries(ctx.region, parasite.id);
      if (entries.length) risk.regionNote = entries[0].headline;
      else missingLocal.push(parasite.name);
    }
    if (ctx.seasons.length) {
      const relation = seasonRelationFor(parasite, ctx.seasonMonths, ctx.seasonLabel);
      risk.seasonRelation = relation.relation;
      risk.seasonNote = relation.note;
      if (relation.relation === 'not-recorded') notRecorded = true;
    } else {
      risk.seasonRelation = 'unknown';
    }
  }

  if (ctx.region && missingLocal.length) {
    notices.push(
      `${ctx.region.name}的本地资料未收录${joinChinese(missingLocal)}的直接记录；这不改变上述一般风险说明。`,
    );
  }
  if (ctx.seasons.length && notRecorded) {
    notices.push('部分风险缺少明确的季节资料；未收录不等于与本季无关。');
  }
  return { notices };
}

/* ========================================================================== */
/* 季节分组（仅背景模式使用）                                                  */
/* ========================================================================== */

function buildSeasonGroups(
  ctx: BriefingContext,
  candidateParasiteIds: readonly string[] | null,
): ExploreSeasonGroup[] {
  if (!ctx.seasons.length) return [];
  const candidates =
    candidateParasiteIds === null
      ? ctx.store.parasites
      : candidateParasiteIds
          .map((id) => ctx.store.parasiteById.get(id))
          .filter((parasite): parasite is Parasite => Boolean(parasite));
  if (!candidates.length) return [];

  const groups = new Map<SeasonRelation, { id: string; name: string; note?: string }[]>();
  for (const parasite of [...candidates].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    const relation = seasonRelationFor(parasite, ctx.seasonMonths, ctx.seasonLabel).relation;
    const note = firstSentence(parasite.seasonality.pattern) || firstSentence(parasite.seasonality.evidenceNote);
    const list = groups.get(relation) ?? [];
    list.push({ id: parasite.id, name: parasite.name, ...(note ? { note } : {}) });
    groups.set(relation, list);
  }

  return SEASON_GROUP_ORDER.filter((relation) => groups.has(relation)).map((relation) => ({
    relation,
    label: seasonGroupLabel(relation, ctx.seasonLabel),
    parasites: groups.get(relation) ?? [],
  }));
}

/* ========================================================================== */
/* 主入口                                                                      */
/* ========================================================================== */

export function runExploreBriefing(store: KnowledgeStore, query: ExploreBriefingQuery): ExploreBriefing {
  const provinceCodes = uniq((query.provinceCodes ?? []).filter((code) => store.regionByCode.has(code)));
  const seasons = uniq((query.seasons ?? []).filter(isSeasonId));
  const foodIds = uniq((query.foodIds ?? []).filter((id) => store.foodById.has(id)));
  const preparationTags = uniq(
    (query.preparationTags ?? []).filter((tag): tag is PreparationTag =>
      (PREPARATION_TAGS as readonly string[]).includes(tag),
    ),
  );
  const parasiteIds = uniq((query.parasiteIds ?? []).filter((id) => store.parasiteById.has(id)));

  const region = provinceCodes.length ? (store.regionByCode.get(provinceCodes[0]) ?? null) : null;
  const foods = foodIds
    .map((id) => store.foodById.get(id))
    .filter((food): food is Food => Boolean(food));
  const parasites = parasiteIds
    .map((id) => store.parasiteById.get(id))
    .filter((parasite): parasite is Parasite => Boolean(parasite));

  const foodSummaryById = new Map(store.foodSummaries.map((summary) => [summary.id, summary]));
  const parasiteSummaryById = new Map(store.parasiteSummaries.map((summary) => [summary.id, summary]));
  const orderedSeasons = SEASON_IDS.filter((season) => seasons.includes(season));
  const seasonMonths = uniq(orderedSeasons.flatMap((season) => SEASON_INFO[season].months)).sort((a, b) => a - b);
  const seasonLabel = orderedSeasons.map((season) => SEASON_INFO[season].label).join('、');

  const ctx: BriefingContext = {
    store,
    region,
    seasons: orderedSeasons,
    seasonMonths,
    seasonLabel,
    foods,
    preparationTags,
    parasites,
    foodSummaryById,
    parasiteSummaryById,
    currentRisksForEnrichment: [],
  };

  const echoedQuery: ExploreBriefingQuery = {};
  if (provinceCodes.length) echoedQuery.provinceCodes = provinceCodes;
  if (orderedSeasons.length) echoedQuery.seasons = orderedSeasons;
  if (foodIds.length) echoedQuery.foodIds = foodIds;
  if (preparationTags.length) echoedQuery.preparationTags = preparationTags;
  if (parasiteIds.length) echoedQuery.parasiteIds = parasiteIds;

  const selectionPreparation = ((): ExplorePreparationOption | null => {
    if (!preparationTags.length) return null;
    const tag = preparationTags[0];
    for (const food of foods) {
      const found = food.preparations.find((preparation) => preparation.tag === tag);
      if (found) return toPreparationOption(found);
    }
    return taxonomyPreparationOption(store, tag);
  })();

  const selection: ExploreBriefing['selection'] = {
    province: region
      ? { code: region.code, name: region.name, hasLocalKnowledge: region.entries.length > 0 }
      : null,
    season: orderedSeasons.length
      ? { id: orderedSeasons[0], label: seasonLabel, months: [...seasonMonths] }
      : null,
    foods: foods
      .map((food) => foodSummaryById.get(food.id) ?? toFoodSummary(food))
      .filter((summary): summary is FoodSummary => Boolean(summary)),
    preparation: selectionPreparation,
    parasites: parasites
      .map((parasite) => parasiteSummaryById.get(parasite.id) ?? toParasiteSummary(parasite))
      .filter((summary): summary is ParasiteSummary => Boolean(summary)),
  };

  /* ---------------------------------------------------------------- */
  /* 空条件：只提示先选择                                             */
  /* ---------------------------------------------------------------- */
  const nothingSelected =
    !region && !orderedSeasons.length && !foods.length && !preparationTags.length && !parasites.length;
  if (nothingSelected) {
    return {
      query: echoedQuery,
      situation: 'empty',
      headline: '先选择地区、季节、食物或做法',
      summary: '选好条件后，这里会说明在当前情况下需要留意什么。',
      selection,
      currentRisks: [],
      effectiveProtections: [],
      relatedParasites: [],
      seasonGroups: [],
      regionKnowledge: null,
      preparationOptions: [],
      notices: [],
      sources: [],
    };
  }

  const prepOptionsForFoods = (): ExplorePreparationOption[] => {
    const options: ExplorePreparationOption[] = [];
    const seen = new Set<PreparationTag>();
    for (const food of foods) {
      for (const preparation of food.preparations) {
        if (seen.has(preparation.tag)) continue;
        seen.add(preparation.tag);
        options.push(toPreparationOption(preparation));
      }
    }
    return options;
  };
  const taxonomyOptions = (): ExplorePreparationOption[] => {
    // 没有食物时无法判断“未洗净蔬果/煮沸水”是否适用，只给通用烹饪做法。
    const genericTags = new Set<PreparationTag>(['raw', 'undercooked', 'cured-smoked', 'grilled', 'fully-cooked']);
    return store.taxonomy.preparations
      .filter((meta) => genericTags.has(meta.id))
      .map((meta) => taxonomyPreparationOption(store, meta.id))
      .filter((option): option is ExplorePreparationOption => Boolean(option));
  };

  /* ---------------------------------------------------------------- */
  /* 食物 + 做法：当前风险 / 处理有效 / 信息不足                      */
  /* ---------------------------------------------------------------- */
  if (foods.length && preparationTags.length) {
    const pairs: FoodPreparationPair[] = [];
    for (const food of foods) {
      for (const preparation of food.preparations) {
        if (preparationTags.includes(preparation.tag)) pairs.push({ food, preparation });
      }
    }

    const notices: string[] = [];
    const regionKnowledge = region ? buildRegionKnowledge(region) : null;

    if (!pairs.length) {
      // 所选做法在所选食物资料中不存在
      const foodNames = joinChinese(foods.map((food) => food.name));
      const prepNames = joinChinese(preparationTags.map((tag) => PREP_ACTION_LABELS[tag] ?? tag));
      return {
        query: echoedQuery,
        situation: 'incomplete',
        headline: '还需要确认做法',
        summary: `${foodNames}的资料中没有与“${prepNames}”对应的说明；换一个做法，或补充更具体的处理方式后再判断。`,
        selection,
        currentRisks: [],
        effectiveProtections: [],
        relatedParasites: buildRelatedFromFoods(ctx, new Set(), 'incomplete', false),
        seasonGroups: buildSeasonGroups(ctx, foods.flatMap((food) => food.parasiteIds)),
        regionKnowledge,
        preparationOptions: prepOptionsForFoods(),
        notices: ['换一个做法或补充更具体的处理方式后再判断。'],
        sources: regionKnowledge ? collectSourceBriefs(store, regionKnowledge.sourceIds) : [],
      };
    }

    const matchedTags = new Set(pairs.map((pair) => pair.preparation.tag));
    const unmatchedTags = preparationTags.filter((tag) => !matchedTags.has(tag));
    const effectivePairs = pairs.filter(
      (pair) => pair.preparation.risk === 'low' && pair.preparation.parasiteIds.length === 0,
    );
    const unknownPairs = pairs.filter((pair) => pair.preparation.risk === 'unknown');
    const riskPairs = pairs.filter(
      (pair) => pair.preparation.parasiteIds.length > 0 && pair.preparation.risk !== 'unknown',
    );

    const selectedParasiteIdSet = new Set(ctx.parasites.map((parasite) => parasite.id));
    const riskResult = buildCurrentRisks(ctx, riskPairs);
    const protectionResult = buildEffectiveProtections(ctx, effectivePairs, selectedParasiteIdSet);
    // 用户额外选了寄生虫时，只展示这些寄生虫的当前风险/有效处理
    const visibleRisks = selectedParasiteIdSet.size
      ? riskResult.risks.filter((risk) => selectedParasiteIdSet.has(risk.parasite.id))
      : riskResult.risks;
    ctx.currentRisksForEnrichment = visibleRisks;

    const allRiskParasiteIds = new Set(riskResult.parasiteIds); // 含未展示的当前风险，用于排除相关知识
    const excludedIds = new Set([
      ...allRiskParasiteIds,
      ...protectionResult.blockedParasiteIds,
      ...selectedParasiteIdSet,
    ]);

    const visibleRiskIds = new Set(visibleRisks.map((risk) => risk.parasite.id));
    const visibleRiskPairs = riskPairs.filter((pair) =>
      pair.preparation.parasiteIds.some((parasiteId) => visibleRiskIds.has(parasiteId)),
    );
    const visibleEffectivePairs = selectedParasiteIdSet.size
      ? effectivePairs.filter((pair) =>
          blockedParasites(ctx, pair).some((parasite) => selectedParasiteIdSet.has(parasite.id)),
        )
      : effectivePairs;
    const visibleConcreteRisk = visibleRisks.some(
      (risk) => risk.riskLevel === 'high' || risk.riskLevel === 'moderate' || risk.riskLevel === 'low',
    );
    const visibleContextualRisk = visibleRisks.some((risk) => risk.riskLevel === 'contextual');

    const actionLabelsOf = (pairsList: FoodPreparationPair[]): string =>
      joinChinese(uniq(pairsList.map((pair) => PREP_ACTION_LABELS[pair.preparation.tag] ?? pair.preparation.tag)));
    const foodNamesOf = (pairsList: FoodPreparationPair[]): string =>
      joinChinese(uniq(pairsList.map((pair) => pair.food.name)));
    const selectedParasiteNames = joinChinese(ctx.parasites.map((parasite) => parasite.name));

    let situation: ExploreSituation;
    if (visibleConcreteRisk) situation = 'risk';
    else if (visibleContextualRisk) situation = 'uncertain';
    else if (protectionResult.protections.length) situation = 'effective';
    else if (selectedParasiteIdSet.size) situation = 'uncertain';
    else if (unknownPairs.length || unmatchedTags.length) situation = 'incomplete';
    else situation = 'incomplete';

    let headline = '';
    let summary = '';
    if (situation === 'risk') {
      const riskParasiteNames = joinChinese(visibleRisks.map((risk) => risk.parasite.name));
      headline = `${actionLabelsOf(visibleRiskPairs)}${foodNamesOf(visibleRiskPairs)}需要留意${riskParasiteNames}风险`;
      summary = `${actionLabelsOf(visibleRiskPairs)}${foodNamesOf(visibleRiskPairs)}时，${riskParasiteNames}是当前需要留意的风险。${
        region || orderedSeasons.length ? '地区与季节的情况见下。' : ''
      }`;
    } else if (situation === 'uncertain') {
      if (!visibleRisks.length) {
        // 用户指定了寄生虫，但知识库没有它在当前食物×做法下的直接资料
        const actions = joinChinese(ctx.preparationTags.map((tag) => PREP_ACTION_LABELS[tag] ?? tag));
        headline = `现有资料没有直接说明${actions}对${selectedParasiteNames}的作用`;
        summary = `现有资料没有把${selectedParasiteNames}列入这种做法的阻断范围，也没有列出它的残余风险；需要结合其他资料判断，或换一种做法再看。`;
      } else {
        headline = `${actionLabelsOf(visibleRiskPairs)}${foodNamesOf(visibleRiskPairs)}的风险取决于具体条件`;
        summary = '是否仍有风险取决于食材来源、加工工艺与处理细节；下面列出需要留意的情况。';
      }
    } else if (situation === 'effective') {
      const foodsText = joinChinese(uniq(visibleEffectivePairs.map((pair) => pair.food.name)));
      const action = joinChinese(
        uniq(
          visibleEffectivePairs.map(
            (pair) => PREP_ACTION_LABELS[pair.preparation.tag] ?? pair.preparation.tag,
          ),
        ),
      );
      const blockedNames = joinChinese(protectionResult.protections.flatMap((item) => item.parasiteNames));
      headline = blockedNames
        ? `${action}后，${foodsText}中已知的${blockedNames}风险不再成立`
        : `${action}后，${foodsText}的已知寄生虫风险不再成立`;
      summary = `${action}是${foodsText}已知寄生虫风险的有效处理方式；这些风险在该处理下不再成立。`;
    } else {
      headline = '还需要确认做法';
      summary = '所选做法在这类食物中的资料不足，暂时无法判断当前风险；换一个更具体的做法后再看。';
    }

    // 多食物/多做法组合：若部分组合已达到有效防护，在当前情况里说明，避免只看到风险
    if (protectionResult.protections.length && situation !== 'effective' && visibleEffectivePairs.length) {
      const protectedFoods = joinChinese(uniq(visibleEffectivePairs.map((pair) => pair.food.name)));
      summary = `${summary} 另有${protectedFoods}的所选组合已达到有效防护，见下。`;
    }

    const enrich = enrichRisks(ctx);
    notices.push(...enrich.notices);
    if (unknownPairs.length && situation !== 'incomplete') {
      notices.push('部分所选做法在这类食物中的资料不足，未纳入当前判断。');
    }
    if (unmatchedTags.length) {
      notices.push(
        `所选食物没有“${joinChinese(unmatchedTags.map((tag) => PREP_ACTION_LABELS[tag] ?? tag))}”的对应说明，判断可能不完整。`,
      );
    }
    if (situation === 'uncertain' && !visibleRisks.length) {
      notices.push('可以换一种做法，或先查看这类食物的其他处理方式。');
    }

    const relatedParasites = buildRelatedFromFoods(ctx, excludedIds, situation, true);
    const sourceIds = uniq([
      ...visibleRisks.flatMap((risk) => risk.sourceIds),
      ...protectionResult.protections.flatMap((protection) => protection.sourceIds),
      ...(regionKnowledge?.sourceIds ?? []),
    ]);
    const seasonGroups = orderedSeasons.length
      ? buildSeasonGroups(
          ctx,
          uniq([
            ...ctx.foods.flatMap((food) => food.parasiteIds),
            ...visibleRisks.map((risk) => risk.parasite.id),
            ...protectionResult.blockedParasiteIds,
          ]),
        )
      : [];

    return {
      query: echoedQuery,
      situation,
      headline,
      summary,
      selection,
      currentRisks: visibleRisks,
      effectiveProtections: protectionResult.protections,
      relatedParasites,
      seasonGroups,
      regionKnowledge,
      preparationOptions: prepOptionsForFoods(),
      notices: uniq(notices).slice(0, 2),
      sources: collectSourceBriefs(store, sourceIds),
    };
  }

  /* ---------------------------------------------------------------- */
  /* 有食物、没有做法 → 信息不足（不能输出当前风险）                  */
  /* ---------------------------------------------------------------- */
  if (foods.length && !preparationTags.length) {
    const foodNames = joinChinese(foods.map((food) => food.name));
    const regionKnowledge = region ? buildRegionKnowledge(region) : null;
    const relatedParasites = buildRelatedFromFoods(ctx, new Set(), 'incomplete', false);
    const seasonGroups = buildSeasonGroups(ctx, foods.flatMap((food) => food.parasiteIds));
    const notices = ['补充做法后可以判断当前风险。'];
    if (region) {
      notices.push(`地区资料见下方“${region.name}”，可作为背景参考。`);
    }
    return {
      query: echoedQuery,
      situation: 'incomplete',
      headline: '还需要确认做法',
      summary: `已选择${foodNames}。不同做法下风险差别很大，选择做法后才能判断当前需要留意什么。`,
      selection,
      currentRisks: [],
      effectiveProtections: [],
      relatedParasites,
      seasonGroups,
      regionKnowledge,
      preparationOptions: prepOptionsForFoods(),
      notices: uniq(notices).slice(0, 2),
      sources: regionKnowledge ? collectSourceBriefs(store, regionKnowledge.sourceIds) : [],
    };
  }

  /* ---------------------------------------------------------------- */
  /* 有做法、没有食物 → 信息不足                                       */
  /* ---------------------------------------------------------------- */
  if (!foods.length && preparationTags.length) {
    const prepNames = joinChinese(preparationTags.map((tag) => PREP_ACTION_LABELS[tag] ?? tag));
    const regionKnowledge = region ? buildRegionKnowledge(region) : null;
    const candidateIds = region
      ? uniq(region.entries.flatMap((entry) => entry.parasiteIds))
      : [];
    return {
      query: echoedQuery,
      situation: 'incomplete',
      headline: '还需要选择食物',
      summary: `已选择“${prepNames}”。选择具体食物后，才能判断在这种做法下需要留意什么。`,
      selection,
      currentRisks: [],
      effectiveProtections: [],
      relatedParasites: [],
      seasonGroups: buildSeasonGroups(ctx, candidateIds),
      regionKnowledge,
      preparationOptions: taxonomyOptions(),
      notices: ['选择食物后，才能判断当前做法下的风险。'],
      sources: regionKnowledge ? collectSourceBriefs(store, regionKnowledge.sourceIds) : [],
    };
  }

  /* ---------------------------------------------------------------- */
  /* 地区 / 季节 / 寄生虫背景（没有食物或做法）                       */
  /* ---------------------------------------------------------------- */
  const regionKnowledge = region ? buildRegionKnowledge(region) : null;
  const regionParasiteIds = region ? uniq(region.entries.flatMap((entry) => entry.parasiteIds)) : [];
  const selectedParasiteIds = parasites.map((parasite) => parasite.id);
  const relatedParasites: ExploreRelatedParasite[] = [];
  if (region) {
    for (const parasiteId of regionParasiteIds) {
      if (selectedParasiteIds.includes(parasiteId)) continue;
      const parasite = store.parasiteById.get(parasiteId);
      if (parasite) {
        relatedParasites.push({
          parasite: parasiteSummaryById.get(parasite.id) ?? toParasiteSummary(parasite),
          reason: '本地资料提及',
        });
      }
    }
  }
  relatedParasites.sort(
    (a, b) =>
      (store.parasiteById.get(a.parasite.id)?.order ?? 999) -
        (store.parasiteById.get(b.parasite.id)?.order ?? 999) ||
      a.parasite.id.localeCompare(b.parasite.id),
  );

  const seasonCandidates: string[] | null = region
    ? regionParasiteIds
    : parasites.length
      ? selectedParasiteIds
      : null; // null = 全部寄生虫（纯季节背景）
  const seasonGroups = buildSeasonGroups(ctx, seasonCandidates);

  const notices: string[] = [];
  const selectedParasiteNames = joinChinese(parasites.map((parasite) => parasite.name));
  const regionParasiteNames = joinChinese(regionParasiteIds.map((id) => store.parasiteById.get(id)?.name ?? id));

  let headline = '';
  let summary = '';
  if (region && parasites.length) {
    const missing = parasites.filter((parasite) => bestLocalEntries(region, parasite.id).length === 0);
    headline = `${region.name}与${selectedParasiteNames}的本地资料`;
    summary = missing.length
      ? `${region.name}的资料未收录${joinChinese(missing.map((parasite) => parasite.name))}的专门记录；还需要选择食物和做法，才能判断当前风险。`
      : `${region.name}的资料提到${joinChinese(
          parasites
            .map((parasite) => (bestLocalEntries(region, parasite.id).length ? parasite.name : ''))
            .filter(Boolean),
        )}；还需要选择食物和做法，才能判断当前风险。`;
    if (missing.length) notices.push(`${region.name}的本地资料未收录${joinChinese(missing.map((p) => p.name))}的直接记录。`);
  } else if (region && orderedSeasons.length) {
    headline = `${region.name}的本地资料与${seasonLabel}背景`;
    summary = `先看${region.name}的本地资料；${seasonLabel}的季节背景见下。选择食物和做法后，可以判断当前风险。`;
  } else if (region) {
    headline = `看看${region.name}的本地资料`;
    summary = regionParasiteIds.length
      ? `本地资料提到${regionParasiteNames}。结合食物与做法，才能判断当前风险。`
      : `${region.name}的本地资料还没有收录具体的寄生虫记录，可以先看看其他地区，或直接按食物和做法查询。`;
    if (!regionParasiteIds.length) notices.push(`${region.name}的本地资料尚未收录具体的寄生虫记录。`);
  } else if (parasites.length && orderedSeasons.length) {
    headline = `${selectedParasiteNames}与${seasonLabel}`;
    summary = `已选择${selectedParasiteNames}；${seasonLabel}的季节背景见下。还需要选择食物和做法，才能判断当前风险。`;
  } else if (parasites.length) {
    const relatedFoodNames = joinChinese(
      uniq(parasites.flatMap((parasite) => parasite.foodIds.map((id) => store.foodById.get(id)?.name ?? id))),
    );
    headline = `已选择${selectedParasiteNames}`;
    summary = relatedFoodNames
      ? `${selectedParasiteNames}与${relatedFoodNames}有关。还需要选择食物和做法，才能判断当前风险。`
      : `${selectedParasiteNames}还需要结合具体食物与做法，才能判断当前风险。`;
  } else if (orderedSeasons.length) {
    const peakNames = joinChinese(
      seasonGroups
        .filter((group) => group.relation === 'peak')
        .flatMap((group) => group.parasites.map((parasite) => parasite.name)),
    );
    const allYearNames = joinChinese(
      seasonGroups
        .filter((group) => group.relation === 'all-year')
        .flatMap((group) => group.parasites.map((parasite) => parasite.name)),
    );
    headline = `${seasonLabel}与本季相关的情况`;
    summary = peakNames
      ? `按现有季节资料，${seasonLabel}处于报告高峰的有${peakNames}${
          allYearNames ? `；${allYearNames}在资料中为全年可发生` : ''
        }。未收录季节资料的寄生虫，不等于与本季无关。`
      : `${seasonLabel}在现有季节资料中没有相关的高峰记录；未收录不等于与本季无关。`;
  } else {
    headline = '先选择地区、季节、食物或做法';
    summary = '选好条件后，这里会说明在当前情况下需要留意什么。';
  }

  if (orderedSeasons.length && seasonGroups.some((group) => group.relation === 'not-recorded')) {
    notices.push('部分寄生虫缺少明确的季节资料；未收录不等于与本季无关。');
  }

  const sourceIds = regionKnowledge ? regionKnowledge.sourceIds : [];
  return {
    query: echoedQuery,
    situation: 'context',
    headline,
    summary,
    selection,
    currentRisks: [],
    effectiveProtections: [],
    relatedParasites,
    seasonGroups,
    regionKnowledge,
    preparationOptions: [],
    notices: uniq(notices).slice(0, 2),
    sources: collectSourceBriefs(store, sourceIds),
  };
}

export default runExploreBriefing;



