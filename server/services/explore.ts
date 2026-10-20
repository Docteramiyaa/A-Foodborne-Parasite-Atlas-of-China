/**
 * /api/explore 多维条件查询。
 *
 * 语义（API.md）：
 * - 不同维度之间为 AND，同一维度多个值为 OR；
 * - 危险组合来自 risk-rules.json，再用 parasites.riskScenarios 补充（同寄生虫只保留一条，
 *   优先规则命中；规则内部按 priority/score 保留最高者）；
 * - 地区证据来自 regions.entries，按证据状态与证据等级排序；
 * - 全部条件为空（或全部无命中）时返回空数组 + total 0，由前端展示引导态。
 *
 * 参数解析/格式校验在路由层完成，本模块只接收合法的 ExploreQuery。
 */
import type {
  EvidenceLevel,
  ExploreQuery,
  ExploreResult,
  ExploreRiskHit,
  ExploreRiskRegionEvidence,
  Food,
  FoodSummary,
  Parasite,
  ParasiteSummary,
  PreparationTag,
  RegionStatus,
  RiskLevel,
  RiskRule,
  Severity,
} from '../../shared/types.js';
import {
  EVIDENCE_RANK,
  PREPARATION_LABELS,
  REGION_STATUS_LABELS,
  REGION_STATUS_RANK,
  RISK_LEVEL_LABELS,
} from '../data/loader.js';
import type { KnowledgeStore } from '../data/store.js';
import { searchKnowledge } from './search.js';

const RISK_WEIGHT: Record<RiskLevel, number> = {
  high: 100,
  moderate: 72,
  contextual: 52,
  low: 32,
  unknown: 12,
};

const SEVERITY_RANK: Record<Severity, number> = {
  'life-threatening': 5,
  severe: 4,
  moderate: 3,
  mild: 2,
  variable: 1,
};

/**
 * 各分区返回上限：用于控制响应体积与前端渲染量（"total" 仍等于实际返回条数之和）。
 * 例如只选“处理方式=生食”时，几乎全部寄生虫都相关，地区证据可能覆盖全国；
 * 这里保留排序后的前 N 条，前端用 total 展示命中总数。
 */
const MAX_REGIONS = 60;
const MAX_CONSEQUENCES = 40;
const MAX_PREVENTION = 40;
const MAX_SEASONAL_NOTES = 40;
const MAX_TEXT_MATCHES = 20;
/** 每条风险命中最多附带的条目级地区证据数 */
const MAX_RISK_REGION_EVIDENCE = 5;

interface Context {
  query: ExploreQuery;
  provinceCodes: string[];
  months: number[];
  foodIds: string[];
  preparationTags: PreparationTag[];
  parasiteIds: string[];
  q: string;
  tokens: string[];
  queryFoods: Food[];
  /** 仅“省份/月份”维度（没有食物/处理方式/寄生虫/文本）时，地区与季节相关性优先 */
  seasonOnly: boolean;
  parasiteSummaryById: Map<string, ParasiteSummary>;
  foodSummaryById: Map<string, FoodSummary>;
  /** 寄生虫 → 出现在证据中的省份集合 */
  evidenceProvinces: Map<string, Set<string>>;
  /** 文本检索命中的实体（q 非空时） */
  textParasiteIds: Set<string>;
  textFoodIds: Set<string>;
  textRegionCodes: Set<string>;
}

const splitTokens = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(Boolean);

const joinText = (...parts: Array<string | undefined | false | string[]>): string => {
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (Array.isArray(part)) {
      for (const item of part) if (item && item.trim()) chunks.push(item.trim());
    } else if (part.trim()) {
      chunks.push(part.trim());
    }
  }
  return chunks.join(' ');
};

function buildContext(store: KnowledgeStore, query: ExploreQuery): Context {
  const provinceCodes = query.provinceCodes ?? [];
  const months = query.months ?? [];
  const foodIds = query.foodIds ?? [];
  const preparationTags = query.preparationTags ?? [];
  const parasiteIds = query.parasiteIds ?? [];
  const q = (query.q ?? '').trim();
  const tokens = splitTokens(q);

  const parasiteSummaryById = new Map(store.parasiteSummaries.map((summary) => [summary.id, summary]));
  const foodSummaryById = new Map(store.foodSummaries.map((summary) => [summary.id, summary]));
  const queryFoods = foodIds.length ? store.foods.filter((food) => foodIds.includes(food.id)) : [];

  const evidenceProvinces = new Map<string, Set<string>>();
  for (const region of store.regions) {
    for (const entry of region.entries) {
      for (const parasiteId of entry.parasiteIds) {
        const set = evidenceProvinces.get(parasiteId);
        if (set) set.add(region.code);
        else evidenceProvinces.set(parasiteId, new Set([region.code]));
      }
    }
  }

  const textParasiteIds = new Set<string>();
  const textFoodIds = new Set<string>();
  const textRegionCodes = new Set<string>();
  if (q) {
    const response = searchKnowledge(store, q);
    for (const hit of response.hits) {
      if (hit.kind === 'parasite') textParasiteIds.add(hit.id);
      else if (hit.kind === 'food') textFoodIds.add(hit.id);
      else if (hit.kind === 'region') textRegionCodes.add(hit.id);
    }
  }

  const seasonOnly = !foodIds.length && !preparationTags.length && !parasiteIds.length && !q;
  return {
    query,
    provinceCodes,
    months,
    foodIds,
    preparationTags,
    parasiteIds,
    q,
    tokens,
    queryFoods,
    seasonOnly,
    parasiteSummaryById,
    foodSummaryById,
    evidenceProvinces,
    textParasiteIds,
    textFoodIds,
    textRegionCodes,
  };
}

/* ========================================================================== */
/* 文本匹配辅助                                                                */
/* ========================================================================== */

function makeTextMatcher(tokens: string[]): (...parts: Array<string | undefined | string[]>) => boolean {
  if (!tokens.length) return () => true;
  return (...parts) => {
    const text = joinText(...parts).toLowerCase();
    if (!text) return false;
    return tokens.every((token) => text.includes(token));
  };
}

function parasiteTextOk(ctx: Context, parasite: Parasite): boolean {
  if (!ctx.tokens.length) return true;
  if (ctx.textParasiteIds.has(parasite.id)) return true;
  return makeTextMatcher(ctx.tokens)(
    parasite.name,
    parasite.latinName,
    parasite.aliases,
    parasite.tagline,
    parasite.summary,
  );
}

function hasEvidenceInProvinces(ctx: Context, parasiteId: string, provinceCodes: string[]): boolean {
  if (!provinceCodes.length) return true;
  const provinces = ctx.evidenceProvinces.get(parasiteId);
  if (!provinces) return false;
  return provinceCodes.some((code) => provinces.has(code));
}

/* ========================================================================== */
/* 条目级地区证据                                                              */
/* ========================================================================== */

/**
 * 查找「该寄生虫 × 该省份」的条目级证据。
 *
 * 只使用 regions.entries 中的真实条目（entry.parasiteIds 包含该寄生虫），
 * 绝不使用省份汇总 evidenceStatus —— 后者是全省所有寄生虫/条目的聚合，
 * 把它当作单项证据会误导用户（如：广东汇总为“高发区”，但棘颚口线虫在
 * 广东的条目实际只是“有省级病例或调查记载”）。
 *
 * 排序：证据状态 > 证据等级 > 来源数量 > 省份代码 > 标题（稳定、可断言）。
 * 去重：同省同一条目只保留一次；每条风险最多 5 条。
 */
function collectRiskRegionEvidence(
  store: KnowledgeStore,
  parasiteId: string,
  regionCodes: string[],
): ExploreRiskRegionEvidence[] {
  if (!regionCodes.length) return [];
  const seen = new Set<string>();
  const collected: ExploreRiskRegionEvidence[] = [];
  for (const code of regionCodes) {
    const region = store.regionByCode.get(code);
    if (!region) continue;
    for (const entry of region.entries) {
      if (!entry.parasiteIds.includes(parasiteId)) continue;
      const key = `${region.code}::${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push({
        code: region.code,
        name: region.name,
        status: entry.status,
        headline: entry.headline,
        level: entry.evidenceLevel,
        sourceIds: [...entry.sourceIds],
      });
    }
  }
  collected.sort(
    (a, b) =>
      REGION_STATUS_RANK[b.status] - REGION_STATUS_RANK[a.status] ||
      EVIDENCE_RANK[b.level] - EVIDENCE_RANK[a.level] ||
      b.sourceIds.length - a.sourceIds.length ||
      a.code.localeCompare(b.code) ||
      a.headline.localeCompare(b.headline),
  );
  return collected.slice(0, MAX_RISK_REGION_EVIDENCE);
}

/**
 * 为一条风险命中构建 regionEvidence。
 * 规则可能没有省份条件（matchedRegionCodes 为空）：若用户指定了省份，
 * 仍按「用户指定省份 × 该寄生虫」查找条目，保证语义为“真实条目证据”。
 */
function buildHitRegionEvidence(
  store: KnowledgeStore,
  ctx: Context,
  parasiteId: string,
  matchedRegionCodes: string[],
): ExploreRiskRegionEvidence[] {
  const codes = matchedRegionCodes.length ? matchedRegionCodes : ctx.provinceCodes;
  return collectRiskRegionEvidence(store, parasiteId, codes);
}

/* ========================================================================== */
/* 风险规则匹配                                                                */
/* ========================================================================== */

function matchRule(store: KnowledgeStore, ctx: Context, rule: RiskRule): ExploreRiskHit | null {
  const parasite = store.parasiteById.get(rule.parasiteId);
  const summary = ctx.parasiteSummaryById.get(rule.parasiteId);
  if (!parasite || !summary) return null;
  if (ctx.parasiteIds.length && !ctx.parasiteIds.includes(rule.parasiteId)) return null;

  const when = rule.when;

  /* 食物条件 */
  let matchedFoodIds: string[] = [];
  if (ctx.queryFoods.length) {
    matchedFoodIds = ctx.queryFoods
      .filter(
        (food) =>
          (when.foodIds ?? []).includes(food.id) || (when.foodCategoryIds ?? []).includes(food.categoryId),
      )
      .map((food) => food.id);
    if (!matchedFoodIds.length) return null;
  } else {
    matchedFoodIds = store.foods
      .filter(
        (food) =>
          (when.foodIds ?? []).includes(food.id) || (when.foodCategoryIds ?? []).includes(food.categoryId),
      )
      .map((food) => food.id);
    const hasFoodCondition = Boolean(when.foodIds?.length || when.foodCategoryIds?.length);
    if (hasFoodCondition && !matchedFoodIds.length) return null;
    matchedFoodIds = matchedFoodIds.slice(0, 8);
  }

  /* 处理方式条件 */
  let matchedPreparationTags: PreparationTag[] = [];
  if (when.preparationTags?.length) {
    if (ctx.preparationTags.length) {
      matchedPreparationTags = when.preparationTags.filter((tag) => ctx.preparationTags.includes(tag));
      if (!matchedPreparationTags.length) return null;
    } else {
      matchedPreparationTags = [...when.preparationTags];
    }
  }

  /* 省份条件 */
  let matchedRegionCodes: string[] = [];
  if (when.provinceCodes?.length) {
    if (ctx.provinceCodes.length) {
      matchedRegionCodes = when.provinceCodes.filter((code) => ctx.provinceCodes.includes(code));
      if (!matchedRegionCodes.length) return null;
    } else {
      matchedRegionCodes = [...when.provinceCodes];
    }
  } else {
    matchedRegionCodes = [...ctx.provinceCodes];
  }

  /* 月份条件 */
  if (when.months?.length) {
    if (ctx.months.length && !when.months.some((month) => ctx.months.includes(month))) return null;
  } else if (ctx.months.length && ctx.seasonOnly) {
    // 仅按省份/季节浏览时：规则未限定月份则用寄生虫季节证据判断相关性
    if (!parasite.seasonality.peakMonths.some((month) => ctx.months.includes(month))) return null;
  }

  /* 仅有地区/季节维度时，规则需与该省证据相关，避免全省范围内无限展开 */
  if (ctx.seasonOnly && ctx.provinceCodes.length && !hasEvidenceInProvinces(ctx, rule.parasiteId, ctx.provinceCodes)) {
    return null;
  }

  /* 文本条件 */
  if (ctx.tokens.length) {
    const foodText = store.foods
      .filter((food) => matchedFoodIds.includes(food.id))
      .map((food) => `${food.name} ${food.aliases.join(' ')}`)
      .join(' ');
    const text = joinText(
      rule.rationale,
      rule.conditions,
      parasite.name,
      parasite.aliases,
      parasite.summary,
      foodText,
      matchedPreparationTags.map((tag) => PREPARATION_LABELS[tag]),
      matchedRegionCodes.map((code) => store.regionByCode.get(code)?.name ?? code),
    );
    if (!makeTextMatcher(ctx.tokens)(text)) return null;
  }

  let score = RISK_WEIGHT[rule.riskLevel] + Math.min(rule.priority, 100) / 2;
  score += matchedFoodIds.length * 2 + matchedPreparationTags.length * 2 + matchedRegionCodes.length * 2;
  if (when.months?.length) score += 1;

  return {
    ruleId: rule.id,
    parasite: summary,
    riskLevel: rule.riskLevel,
    rationale: rule.rationale,
    ...(rule.conditions?.length ? { conditions: rule.conditions } : {}),
    matchedFoodIds,
    matchedPreparationTags,
    matchedRegionCodes,
    regionEvidence: buildHitRegionEvidence(store, ctx, rule.parasiteId, matchedRegionCodes),
    sourceIds: rule.sourceIds,
    score: Math.round(score),
  };
}

/** parasites.riskScenarios 补充（仅补规则未覆盖的寄生虫） */
function matchScenarios(
  store: KnowledgeStore,
  ctx: Context,
  coveredParasiteIds: ReadonlySet<string>,
): ExploreRiskHit[] {
  if (ctx.seasonOnly) return [];
  const hits: ExploreRiskHit[] = [];
  for (const parasite of store.parasites) {
    if (coveredParasiteIds.has(parasite.id)) continue;
    if (ctx.parasiteIds.length && !ctx.parasiteIds.includes(parasite.id)) continue;
    if (ctx.provinceCodes.length && !hasEvidenceInProvinces(ctx, parasite.id, ctx.provinceCodes)) continue;
    if (ctx.tokens.length && !parasiteTextOk(ctx, parasite)) continue;
    const summary = ctx.parasiteSummaryById.get(parasite.id);
    if (!summary) continue;

    let best: ExploreRiskHit | null = null;
    for (const scenario of parasite.riskScenarios) {
      if (ctx.foodIds.length) {
        const matched = scenario.foodIds.filter((id) => ctx.foodIds.includes(id));
        if (!matched.length) continue;
      }
      if (ctx.preparationTags.length && scenario.preparationTags.length) {
        const matched = scenario.preparationTags.filter((tag) => ctx.preparationTags.includes(tag));
        if (!matched.length) continue;
      }
      const matchedFoodIds = ctx.foodIds.length
        ? scenario.foodIds.filter((id) => ctx.foodIds.includes(id))
        : scenario.foodIds.filter((id) => store.foodById.has(id));
      const matchedPreparationTags = ctx.preparationTags.length
        ? scenario.preparationTags.filter((tag) => ctx.preparationTags.includes(tag))
        : [...scenario.preparationTags];
      const matchedRegionCodes = [...ctx.provinceCodes];
      const score =
        RISK_WEIGHT[scenario.riskLevel] + 18 + matchedFoodIds.length * 2 + matchedPreparationTags.length * 2;
      if (best && best.score >= score) continue;
      best = {
        ruleId: `scenario:${parasite.id}:${scenario.id}`,
        parasite: summary,
        riskLevel: scenario.riskLevel,
        rationale: scenario.explanation,
        ...(scenario.examples?.length ? { conditions: scenario.examples } : {}),
        matchedFoodIds,
        matchedPreparationTags,
        matchedRegionCodes,
        regionEvidence: buildHitRegionEvidence(store, ctx, parasite.id, matchedRegionCodes),
        sourceIds: scenario.sourceIds,
        score: Math.round(score),
      };
    }
    if (best) hits.push(best);
  }
  return hits;
}

/* ========================================================================== */
/* interpretation                                                              */
/* ========================================================================== */

function buildInterpretation(store: KnowledgeStore, ctx: Context): ExploreResult['interpretation'] {
  const prepName = new Map(store.taxonomy.preparations.map((prep) => [prep.id, prep.name]));
  return {
    provinceLabels: ctx.provinceCodes.map((code) => store.regionByCode.get(code)?.name ?? code),
    monthLabels: [...ctx.months].sort((a, b) => a - b).map((month) => `${month} 月`),
    foodLabels: ctx.foodIds.map((id) => store.foodById.get(id)?.name ?? id),
    preparationLabels: ctx.preparationTags.map((tag) => prepName.get(tag) ?? PREPARATION_LABELS[tag] ?? tag),
    parasiteLabels: ctx.parasiteIds.map((id) => store.parasiteById.get(id)?.name ?? id),
  };
}

function buildEmptyResult(store: KnowledgeStore, ctx: Context): ExploreResult {
  return {
    query: { ...ctx.query },
    risks: [],
    parasites: [],
    foods: [],
    regions: [],
    consequences: [],
    prevention: [],
    seasonalNotes: [],
    textMatches: [],
    total: 0,
    interpretation: buildInterpretation(store, ctx),
  };
}

/* ========================================================================== */
/* 主入口                                                                      */
/* ========================================================================== */

export function runExplore(store: KnowledgeStore, query: ExploreQuery): ExploreResult {
  const ctx = buildContext(store, query);
  if (
    !ctx.provinceCodes.length &&
    !ctx.months.length &&
    !ctx.foodIds.length &&
    !ctx.preparationTags.length &&
    !ctx.parasiteIds.length &&
    !ctx.q
  ) {
    return buildEmptyResult(store, ctx);
  }
  // 显式指定了但完全无法解析的实体过滤条件：直接返回空结果，避免退化成「无过滤」
  if (ctx.foodIds.length && !ctx.queryFoods.length) return buildEmptyResult(store, ctx);
  if (ctx.parasiteIds.length && !store.parasites.some((parasite) => ctx.parasiteIds.includes(parasite.id))) {
    return buildEmptyResult(store, ctx);
  }
  if (ctx.provinceCodes.length && !ctx.provinceCodes.some((code) => store.regionByCode.has(code))) {
    return buildEmptyResult(store, ctx);
  }

  /* ---------------- 1. 风险组合 ---------------- */
  const ruleHits: ExploreRiskHit[] = [];
  for (const rule of store.rules) {
    const hit = matchRule(store, ctx, rule);
    if (hit) ruleHits.push(hit);
  }
  const bestRuleByParasite = new Map<string, ExploreRiskHit>();
  ruleHits.sort((a, b) => b.score - a.score || a.parasite.id.localeCompare(b.parasite.id));
  for (const hit of ruleHits) {
    if (!bestRuleByParasite.has(hit.parasite.id)) bestRuleByParasite.set(hit.parasite.id, hit);
  }
  const coveredParasiteIds = new Set(bestRuleByParasite.keys());
  const risks = [...bestRuleByParasite.values()].concat(matchScenarios(store, ctx, coveredParasiteIds));
  const parasiteOrder = new Map(store.parasites.map((parasite, index) => [parasite.id, parasite.order || index + 1]));
  risks.sort(
    (a, b) =>
      b.score - a.score ||
      (parasiteOrder.get(a.parasite.id) ?? 999) - (parasiteOrder.get(b.parasite.id) ?? 999) ||
      a.parasite.id.localeCompare(b.parasite.id),
  );
  const riskParasiteIds = new Set(risks.map((hit) => hit.parasite.id));

  /* ---------------- 2. 焦点寄生虫 ---------------- */
  const focusParasiteIds = new Set<string>();
  for (const id of ctx.parasiteIds) if (store.parasiteById.has(id)) focusParasiteIds.add(id);
  for (const id of riskParasiteIds) focusParasiteIds.add(id);
  for (const food of ctx.queryFoods) for (const id of food.parasiteIds) focusParasiteIds.add(id);
  for (const id of ctx.textParasiteIds) focusParasiteIds.add(id);
  for (const foodId of ctx.textFoodIds) {
    const textFood = store.foodById.get(foodId);
    for (const id of textFood?.parasiteIds ?? []) focusParasiteIds.add(id);
  }
  if (ctx.months.length && ctx.seasonOnly) {
    for (const parasite of store.parasites) {
      if (!parasite.seasonality.peakMonths.some((month) => ctx.months.includes(month))) continue;
      if (ctx.provinceCodes.length && !hasEvidenceInProvinces(ctx, parasite.id, ctx.provinceCodes)) continue;
      focusParasiteIds.add(parasite.id);
    }
  }

  /* ---------------- 3. 地区证据 ---------------- */
  const qProvinceSet = new Set(ctx.provinceCodes);
  const foodParasiteIds = new Set(ctx.queryFoods.flatMap((food) => food.parasiteIds));
  const regionItems: ExploreResult['regions'] = [];
  const regionFoodIds = new Set<string>();
  const regionParasiteCount = new Map<string, number>();
  const textMatcher = makeTextMatcher(ctx.tokens);
  // 仅省份/月份浏览时，地区证据是主结果，不按风险命中的寄生虫再收窄；
  // 仅月份（无省份）时仍用季节相关寄生虫过滤，避免把全国所有证据都列出来。
  const filterRegionsByFocus = !ctx.seasonOnly || (!ctx.provinceCodes.length && ctx.months.length > 0);

  // 仅月份（无省份）且没有任何已知季节高峰寄生虫时，不再把全国证据全部当作“相关”
  const skipRegionEntries =
    ctx.seasonOnly && !ctx.provinceCodes.length && ctx.months.length > 0 && focusParasiteIds.size === 0;

  for (const region of store.regions) {
    if (skipRegionEntries) break;
    if (qProvinceSet.size && !qProvinceSet.has(region.code)) continue;
    const regionTextHit = ctx.textRegionCodes.has(region.code);
    for (const entry of region.entries) {
      if (filterRegionsByFocus && focusParasiteIds.size && !entry.parasiteIds.some((id) => focusParasiteIds.has(id))) {
        continue;
      }
      if (ctx.foodIds.length) {
        const explicitFoodMatch = (entry.foodIds ?? []).some((id) => ctx.foodIds.includes(id));
        const relatedParasiteMatch = entry.parasiteIds.some((id) => foodParasiteIds.has(id));
        if (!explicitFoodMatch && !relatedParasiteMatch) continue;
      }
      if (ctx.tokens.length && !regionTextHit) {
        const parasiteNames = entry.parasiteIds.map((id) => store.parasiteById.get(id)?.name ?? id);
        const foodNames = (entry.foodIds ?? []).map((id) => store.foodById.get(id)?.name ?? id);
        if (!textMatcher(entry.headline, entry.detail, parasiteNames, foodNames)) continue;
      }
      regionItems.push({
        code: region.code,
        name: region.name,
        status: entry.status,
        headline: entry.headline,
        parasiteIds: [...entry.parasiteIds],
        level: entry.evidenceLevel as EvidenceLevel,
        sourceIds: [...entry.sourceIds],
      });
      for (const foodId of entry.foodIds ?? []) regionFoodIds.add(foodId);
      for (const parasiteId of entry.parasiteIds) {
        regionParasiteCount.set(parasiteId, (regionParasiteCount.get(parasiteId) ?? 0) + 1);
      }
    }
  }
  regionItems.sort(
    (a, b) =>
      REGION_STATUS_RANK[b.status] - REGION_STATUS_RANK[a.status] ||
      EVIDENCE_RANK[b.level] - EVIDENCE_RANK[a.level] ||
      a.code.localeCompare(b.code),
  );
  for (const item of regionItems) for (const id of item.parasiteIds) focusParasiteIds.add(id);

  /* ---------------- 4. 相关寄生虫 ---------------- */
  const parasiteScore = new Map<string, number>();
  const bump = (id: string, value: number): void => {
    parasiteScore.set(id, (parasiteScore.get(id) ?? 0) + value);
  };
  for (const hit of risks) bump(hit.parasite.id, hit.score);
  for (const id of ctx.parasiteIds) bump(id, 600);
  for (const id of ctx.textParasiteIds) bump(id, 320);
  for (const id of foodParasiteIds) bump(id, 120);
  for (const [id, count] of regionParasiteCount) bump(id, count * 40);
  for (const id of focusParasiteIds) if (!parasiteScore.has(id)) bump(id, 1);
  const parasites: ParasiteSummary[] = [...parasiteScore.keys()]
    .map((id) => ctx.parasiteSummaryById.get(id))
    .filter((summary): summary is ParasiteSummary => Boolean(summary))
    .sort(
      (a, b) =>
        (parasiteScore.get(b.id) ?? 0) - (parasiteScore.get(a.id) ?? 0) ||
        (parasiteOrder.get(a.id) ?? 999) - (parasiteOrder.get(b.id) ?? 999) ||
        a.id.localeCompare(b.id),
    );

  /* ---------------- 5. 相关食物 ---------------- */
  const foodScore = new Map<string, number>();
  const bumpFood = (id: string, value: number): void => {
    if (!ctx.foodSummaryById.has(id)) return;
    foodScore.set(id, (foodScore.get(id) ?? 0) + value);
  };
  for (const id of ctx.foodIds) bumpFood(id, 600);
  for (const hit of risks) for (const id of hit.matchedFoodIds) bumpFood(id, 200);
  for (const id of regionFoodIds) bumpFood(id, 80);
  for (const id of ctx.textFoodIds) bumpFood(id, 160);
  if (!foodScore.size) {
    for (const food of store.foods) {
      if (food.parasiteIds.some((id) => focusParasiteIds.has(id))) bumpFood(food.id, 10);
    }
  }
  const foods: FoodSummary[] = [...foodScore.keys()]
    .map((id) => ctx.foodSummaryById.get(id))
    .filter((summary): summary is FoodSummary => Boolean(summary))
    .sort((a, b) => {
      const orderA = store.foodById.get(a.id)?.order ?? 999;
      const orderB = store.foodById.get(b.id)?.order ?? 999;
      return (foodScore.get(b.id) ?? 0) - (foodScore.get(a.id) ?? 0) || orderA - orderB || a.id.localeCompare(b.id);
    });

  /* ---------------- 6. 后果 / 预防 ---------------- */
  const consequences: ExploreResult['consequences'] = [];
  const prevention: ExploreResult['prevention'] = [];
  for (const parasite of store.parasites) {
    if (!focusParasiteIds.has(parasite.id)) continue;
    for (const consequence of parasite.consequences) {
      if (
        ctx.tokens.length &&
        !textMatcher(consequence.title, consequence.description, parasite.name, parasite.summary)
      ) {
        continue;
      }
      consequences.push({
        id: consequence.id,
        parasiteId: parasite.id,
        parasiteName: parasite.name,
        title: consequence.title,
        description: consequence.description,
        severity: consequence.severity,
        sourceIds: [...consequence.sourceIds],
      });
    }
    for (const measure of parasite.prevention) {
      if (ctx.tokens.length && !textMatcher(measure.title, measure.detail)) continue;
      prevention.push({
        parasiteId: parasite.id,
        parasiteName: parasite.name,
        title: measure.title,
        detail: measure.detail,
        key: Boolean(measure.key),
      });
    }
  }
  consequences.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      (parasiteOrder.get(a.parasiteId) ?? 999) - (parasiteOrder.get(b.parasiteId) ?? 999) ||
      a.id.localeCompare(b.id),
  );
  prevention.sort(
    (a, b) =>
      Number(b.key) - Number(a.key) ||
      (parasiteOrder.get(a.parasiteId) ?? 999) - (parasiteOrder.get(b.parasiteId) ?? 999) ||
      a.title.localeCompare(b.title),
  );

  /* ---------------- 7. 季节证据 ---------------- */
  const seasonalNotes: ExploreResult['seasonalNotes'] = [];
  for (const region of store.regions) {
    if (qProvinceSet.size && !qProvinceSet.has(region.code)) continue;
    for (const note of region.seasonalNotes) {
      if (ctx.months.length && !note.months.some((month) => ctx.months.includes(month))) continue;
      if (!ctx.months.length && !qProvinceSet.size && !ctx.tokens.length && !focusParasiteIds.size) continue;
      if (!ctx.seasonOnly && focusParasiteIds.size && !note.parasiteIds.some((id) => focusParasiteIds.has(id))) {
        continue;
      }
      if (ctx.tokens.length && !textMatcher(note.note, region.name)) continue;
      seasonalNotes.push({
        provinceCode: region.code,
        provinceName: region.name,
        months: [...note.months],
        note: note.note,
        basis: note.basis,
        parasiteIds: [...note.parasiteIds],
        sourceIds: [...note.sourceIds],
      });
    }
  }
  seasonalNotes.sort(
    (a, b) =>
      Number(b.basis === 'infection-evidence') - Number(a.basis === 'infection-evidence') ||
      a.provinceCode.localeCompare(b.provinceCode) ||
      (a.months[0] ?? 0) - (b.months[0] ?? 0),
  );

  /* ---------------- 8. 文本匹配块 ---------------- */
  const textMatches: ExploreResult['textMatches'] = [];
  if (ctx.q) {
    const response = searchKnowledge(store, ctx.q);
    for (const hit of response.hits) {
      if (hit.kind !== 'parasite' && hit.kind !== 'food' && hit.kind !== 'region') continue;
      textMatches.push({ kind: hit.kind, id: hit.id, title: hit.title, excerpt: hit.excerpt });
      if (textMatches.length >= MAX_TEXT_MATCHES) break;
    }
  }

  /* ---------------- 9. 截断（控制响应体积；total 与实际返回一致） ---------------- */
  const limitedRegions = regionItems.slice(0, MAX_REGIONS);
  const limitedConsequences = consequences.slice(0, MAX_CONSEQUENCES);
  const limitedPrevention = prevention.slice(0, MAX_PREVENTION);
  const limitedSeasonalNotes = seasonalNotes.slice(0, MAX_SEASONAL_NOTES);

  const total =
    risks.length +
    parasites.length +
    foods.length +
    limitedRegions.length +
    limitedConsequences.length +
    limitedPrevention.length +
    limitedSeasonalNotes.length +
    textMatches.length;

  return {
    query: { ...ctx.query },
    risks,
    parasites,
    foods,
    regions: limitedRegions,
    consequences: limitedConsequences,
    prevention: limitedPrevention,
    seasonalNotes: limitedSeasonalNotes,
    textMatches,
    total,
    interpretation: buildInterpretation(store, ctx),
  };
}
