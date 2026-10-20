/**
 * Summary / Detail 组装与派生数据。
 *
 * 这里负责把 loader 产出的原始实体聚合成：
 * - 列表摘要（ParasiteSummary / FoodSummary / RegionSummary）
 * - 详情页数据（ParasiteDetail / FoodDetail / RegionDetail / SourceDetail）
 * - AtlasMeta / AtlasPayload 所需字段
 * - 对话检索用 knowledgeChunks 与 suggestions
 *
 * 设计原则：
 * 1. 派生结果在 store 构建时计算一次，路由请求只做 O(1) 查询；
 * 2. 数据不完整时所有数组都可以为空，不在这里抛错；
 * 3. 所有排序都显式定义 tie-break，保证同样数据输出稳定（测试可断言）。
 */
import type {
  AtlasMeta,
  EvidenceLevel,
  Food,
  FoodDetail,
  FoodSummary,
  Parasite,
  ParasiteDetail,
  ParasiteSummary,
  Region,
  RegionDetail,
  RegionStatus,
  RegionSummary,
  RiskRule,
  Source,
  SourceDetail,
  Taxonomy,
} from '../../shared/types.js';
import {
  collectSourceIdsDeep,
  EVIDENCE_LEVEL_LABELS,
  EVIDENCE_RANK,
  PREPARATION_LABELS,
  REGION_STATUS_LABELS,
  REGION_STATUS_RANK,
  RISK_LEVEL_LABELS,
  SEVERITY_LABELS,
} from '../data/loader.js';
import type { CityEntry, LoadedData, ProvinceCenter } from '../data/loader.js';
import type { KnowledgeChunk } from '../data/store.js';

/* ========================================================================== */
/* 季节与时间                                                                  */
/* ========================================================================== */

export type SeasonId = AtlasMeta['now']['season'];

export const SEASON_LABELS: Record<SeasonId, string> = {
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
};

/** 3–5 春、6–8 夏、9–11 秋、12–2 冬 */
export function seasonOfMonth(month: number): SeasonId {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * 按 Asia/Shanghai 时区计算当前时间与季节。
 * 返回的 iso 带 +08:00 偏移，前端可直接展示。
 */
export function computeShanghaiNow(date: Date = new Date()): AtlasMeta['now'] {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const year = Number.parseInt(parts.year ?? '', 10) || date.getUTCFullYear();
  const month = Number.parseInt(parts.month ?? '', 10) || date.getUTCMonth() + 1;
  const day = Number.parseInt(parts.day ?? '', 10) || date.getUTCDate();
  const hour = Number.parseInt(parts.hour ?? '', 10);
  const minute = Number.parseInt(parts.minute ?? '', 10);
  const second = Number.parseInt(parts.second ?? '', 10);
  const season = seasonOfMonth(month);
  return {
    iso: `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+08:00`,
    year,
    month,
    season,
    seasonLabel: SEASON_LABELS[season],
  };
}

/* ========================================================================== */
/* 派生数据容器                                                                */
/* ========================================================================== */

export type ParasiteRegionEvidenceItem = ParasiteDetail['regionEvidence'][number];
export type FoodRegionItem = FoodDetail['regions'][number];

export interface DerivedStoreData {
  data: LoadedData;
  taxonomy: Taxonomy;
  parasites: Parasite[];
  foods: Food[];
  regions: Region[];
  rules: RiskRule[];
  sources: Source[];
  provinceCenters: ProvinceCenter[];
  cities: CityEntry[];

  parasiteById: Map<string, Parasite>;
  foodById: Map<string, Food>;
  regionByCode: Map<string, Region>;
  regionByShortCode: Map<string, Region>;
  sourceById: Map<string, Source>;

  /** 寄生虫 → 省级证据（每个省份最多一条聚合结果） */
  parasiteRegionEvidence: Map<string, ParasiteRegionEvidenceItem[]>;
  /** 寄生虫 → 出现在多少个省份的证据中（regionCount） */
  regionCountByParasite: Map<string, number>;
  /** 食物 → 相关省份证据（食物详情 regions 字段） */
  foodRegionEvidence: Map<string, FoodRegionItem[]>;

  parasiteSummaries: ParasiteSummary[];
  foodSummaries: FoodSummary[];
  regionSummaries: RegionSummary[];
  parasiteSummaryById: Map<string, ParasiteSummary>;
  foodSummaryById: Map<string, FoodSummary>;

  rulesByParasite: Map<string, RiskRule[]>;
  rulesByFood: Map<string, RiskRule[]>;
  sourceCitedBy: Map<string, SourceDetail['citedBy']>;
  neighborsByRegionCode: Map<string, RegionDetail['neighbors']>;

  meta: AtlasMeta;
  knowledgeChunks: KnowledgeChunk[];
  suggestions: string[];
}

interface CitationAccumulator {
  parasites: Set<string>;
  foods: Set<string>;
  regions: Set<string>;
}

/* ========================================================================== */
/* 地区证据聚合                                                                */
/* ========================================================================== */

function aggregateParasiteRegionEvidence(regions: Region[]): {
  evidence: Map<string, ParasiteRegionEvidenceItem[]>;
  counts: Map<string, number>;
} {
  const evidence = new Map<string, ParasiteRegionEvidenceItem[]>();
  for (const region of regions) {
    const bestByParasite = new Map<string, ParasiteRegionEvidenceItem>();
    for (const entry of region.entries) {
      for (const parasiteId of entry.parasiteIds) {
        const current = bestByParasite.get(parasiteId);
        if (!current) {
          bestByParasite.set(parasiteId, {
            code: region.code,
            name: region.name,
            status: entry.status,
            headline: entry.headline,
            level: entry.evidenceLevel,
            sourceIds: [...entry.sourceIds],
          });
          continue;
        }
        const mergedSources = new Set([...current.sourceIds, ...entry.sourceIds]);
        current.sourceIds = [...mergedSources];
        const betterStatus = REGION_STATUS_RANK[entry.status] > REGION_STATUS_RANK[current.status];
        const sameStatusBetterLevel =
          REGION_STATUS_RANK[entry.status] === REGION_STATUS_RANK[current.status] &&
          EVIDENCE_RANK[entry.evidenceLevel] > EVIDENCE_RANK[current.level];
        if (betterStatus || sameStatusBetterLevel) {
          current.status = entry.status;
          current.headline = entry.headline;
          current.level = entry.evidenceLevel;
        }
      }
    }
    for (const [parasiteId, item] of bestByParasite) {
      const list = evidence.get(parasiteId);
      if (list) list.push(item);
      else evidence.set(parasiteId, [item]);
    }
  }
  const counts = new Map<string, number>();
  for (const [parasiteId, list] of evidence) {
    list.sort(
      (a, b) =>
        REGION_STATUS_RANK[b.status] - REGION_STATUS_RANK[a.status] ||
        EVIDENCE_RANK[b.level] - EVIDENCE_RANK[a.level] ||
        a.code.localeCompare(b.code),
    );
    counts.set(parasiteId, list.length);
  }
  return { evidence, counts };
}

function aggregateFoodRegionEvidence(regions: Region[], foods: Food[], parasiteById: Map<string, Parasite>): {
  evidence: Map<string, FoodRegionItem[]>;
} {
  const explicit = new Map<string, FoodRegionItem[]>();
  const addItem = (map: Map<string, FoodRegionItem[]>, foodId: string, item: FoodRegionItem): void => {
    const list = map.get(foodId);
    if (!list) {
      map.set(foodId, [item]);
      return;
    }
    const existing = list.find((candidate) => candidate.code === item.code);
    if (!existing) {
      list.push(item);
      return;
    }
    // 同一省份多条证据时保留状态更强者
    if (REGION_STATUS_RANK[item.status] > REGION_STATUS_RANK[existing.status]) {
      existing.status = item.status;
      existing.headline = item.headline;
    }
  };

  for (const region of regions) {
    for (const entry of region.entries) {
      for (const foodId of entry.foodIds ?? []) {
        addItem(explicit, foodId, {
          code: region.code,
          name: region.name,
          status: entry.status,
          headline: entry.headline,
        });
      }
    }
  }

  // 没有显式食物引用的食物：退化为「与相关寄生虫出现在同一省份证据」，
  // 这是派生关联，不改变原始证据含义。
  for (const food of foods) {
    if (explicit.has(food.id)) continue;
    if (!food.parasiteIds.length) continue;
    const parasiteSet = new Set(food.parasiteIds.filter((id) => parasiteById.has(id)));
    if (!parasiteSet.size) continue;
    for (const region of regions) {
      let best: FoodRegionItem | null = null;
      for (const entry of region.entries) {
        if (!entry.parasiteIds.some((id) => parasiteSet.has(id))) continue;
        const item: FoodRegionItem = {
          code: region.code,
          name: region.name,
          status: entry.status,
          headline: entry.headline,
        };
        if (!best || REGION_STATUS_RANK[item.status] > REGION_STATUS_RANK[best.status]) best = item;
      }
      if (best) addItem(explicit, food.id, best);
    }
  }

  for (const list of explicit.values()) {
    list.sort(
      (a, b) => REGION_STATUS_RANK[b.status] - REGION_STATUS_RANK[a.status] || a.code.localeCompare(b.code),
    );
  }
  return { evidence: explicit };
}

function buildNeighbors(
  regions: Region[],
  provinceCenters: ProvinceCenter[],
): Map<string, RegionDetail['neighbors']> {
  const centerByCode = new Map<string, [number, number]>();
  for (const center of provinceCenters) centerByCode.set(center.code, center.center);
  for (const region of regions) {
    if (!centerByCode.has(region.code)) centerByCode.set(region.code, region.center);
  }
  const result = new Map<string, RegionDetail['neighbors']>();
  for (const region of regions) {
    const origin = centerByCode.get(region.code);
    if (!origin) {
      result.set(region.code, []);
      continue;
    }
    const candidates: RegionDetail['neighbors'] = [];
    for (const other of regions) {
      if (other.code === region.code) continue;
      const target = centerByCode.get(other.code);
      if (!target) continue;
      const distanceKm = Math.round(haversineKm(origin, target));
      if (!Number.isFinite(distanceKm)) continue;
      candidates.push({ code: other.code, name: other.name, distanceKm });
    }
    candidates.sort((a, b) => a.distanceKm - b.distanceKm || a.code.localeCompare(b.code));
    result.set(region.code, candidates.slice(0, 4));
  }
  return result;
}

/** 球面距离（Haversine），返回 km */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const earthRadiusKm = 6371;
  const toRad = (degree: number): number => (degree * Math.PI) / 180;
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const clamped = Math.min(1, Math.max(0, h));
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(clamped));
}

/* ========================================================================== */
/* Summary 组装                                                                */
/* ========================================================================== */

export function toParasiteSummary(parasite: Parasite, regionCount: number): ParasiteSummary {
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
    regionCount,
    consequencesSummary: parasite.consequences
      .slice(0, 2)
      .map((item) => item.title)
      .join('；'),
  };
}

export function toFoodSummary(food: Food): FoodSummary {
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

export function toRegionSummary(region: Region, parasiteOrder: Map<string, number>): RegionSummary {
  const ids = new Set<string>();
  for (const entry of region.entries) for (const id of entry.parasiteIds) ids.add(id);
  for (const site of region.studySites) for (const id of site.parasiteIds) ids.add(id);
  for (const note of region.seasonalNotes) for (const id of note.parasiteIds) ids.add(id);
  const parasiteIds = [...ids].sort(
    (a, b) => (parasiteOrder.get(a) ?? 999) - (parasiteOrder.get(b) ?? 999) || a.localeCompare(b),
  );
  return {
    code: region.code,
    shortCode: region.shortCode,
    name: region.name,
    shortName: region.shortName,
    type: region.type,
    center: [...region.center] as [number, number],
    evidenceStatus: region.evidenceStatus,
    tagline: region.tagline,
    intro: region.intro,
    parasiteIds,
    entryCount: region.entries.length,
    evidenceSummary: region.evidenceSummary,
  };
}

/* ========================================================================== */
/* 规则 / 来源聚合                                                             */
/* ========================================================================== */

function groupRules(rules: RiskRule[]): {
  byParasite: Map<string, RiskRule[]>;
  byFood: Map<string, RiskRule[]>;
} {
  const byParasite = new Map<string, RiskRule[]>();
  for (const rule of rules) {
    const list = byParasite.get(rule.parasiteId);
    if (list) list.push(rule);
    else byParasite.set(rule.parasiteId, [rule]);
  }
  for (const list of byParasite.values()) {
    list.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  }

  const byFood = new Map<string, RiskRule[]>();
  // 由 buildDerived 在拿到 foods 后填充（见下方 fillRulesByFood）
  return { byParasite, byFood };
}

function fillRulesByFood(
  rules: RiskRule[],
  foods: Food[],
  parasiteById: Map<string, Parasite>,
): Map<string, RiskRule[]> {
  const byFood = new Map<string, RiskRule[]>();
  for (const food of foods) {
    const matched = rules.filter(
      (rule) =>
        parasiteById.has(rule.parasiteId) &&
        ((rule.when.foodIds ?? []).includes(food.id) ||
          (rule.when.foodCategoryIds ?? []).includes(food.categoryId)),
    );
    matched.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    byFood.set(food.id, matched);
  }
  return byFood;
}

function aggregateSourceCitations(
  sources: Source[],
  parasites: Parasite[],
  foods: Food[],
  regions: Region[],
  rules: RiskRule[],
): Map<string, SourceDetail['citedBy']> {
  const accumulators = new Map<string, CitationAccumulator>();
  for (const source of sources) {
    accumulators.set(source.id, { parasites: new Set(), foods: new Set(), regions: new Set() });
  }
  const touch = (sourceId: string): CitationAccumulator | undefined => accumulators.get(sourceId);

  const collectFor = (entity: unknown, kind: keyof CitationAccumulator, entityId: string): void => {
    for (const sourceId of collectSourceIdsDeep(entity)) {
      touch(sourceId)?.[kind].add(entityId);
    }
  };

  for (const parasite of parasites) collectFor(parasite, 'parasites', parasite.id);
  for (const food of foods) collectFor(food, 'foods', food.id);
  for (const region of regions) collectFor(region, 'regions', region.code);

  // 规则来源 → 关联寄生虫（规则本身不是页面实体，但确实引用了来源）
  for (const rule of rules) {
    for (const sourceId of rule.sourceIds) touch(sourceId)?.parasites.add(rule.parasiteId);
  }
  // 来源自带的 linkedEntityIds 反向索引（数据作者可选填写）
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const parasiteById = new Map(parasites.map((parasite) => [parasite.id, parasite]));
  const regionCodeSet = new Set(regions.map((region) => region.code));
  const regionByShort = new Map(regions.map((region) => [region.shortCode, region.code]));
  for (const source of sources) {
    for (const entityId of source.linkedEntityIds ?? []) {
      if (parasiteById.has(entityId)) touch(source.id)?.parasites.add(entityId);
      else if (foodById.has(entityId)) touch(source.id)?.foods.add(entityId);
      else if (regionCodeSet.has(entityId)) touch(source.id)?.regions.add(entityId);
      else if (regionByShort.has(entityId)) touch(source.id)?.regions.add(regionByShort.get(entityId) as string);
    }
  }

  const parasiteOrder = new Map(parasites.map((parasite) => [parasite.id, parasite.order]));
  const foodOrder = new Map(foods.map((food) => [food.id, food.order]));
  const parasiteName = new Map(parasites.map((parasite) => [parasite.id, parasite.name]));
  const foodName = new Map(foods.map((food) => [food.id, food.name]));
  const regionName = new Map(regions.map((region) => [region.code, region.name]));

  const result = new Map<string, SourceDetail['citedBy']>();
  for (const [sourceId, accumulator] of accumulators) {
    result.set(sourceId, {
      parasites: [...accumulator.parasites]
        .sort((a, b) => (parasiteOrder.get(a) ?? 999) - (parasiteOrder.get(b) ?? 999) || a.localeCompare(b))
        .map((id) => ({ id, name: parasiteName.get(id) ?? id })),
      foods: [...accumulator.foods]
        .sort((a, b) => (foodOrder.get(a) ?? 999) - (foodOrder.get(b) ?? 999) || a.localeCompare(b))
        .map((id) => ({ id, name: foodName.get(id) ?? id })),
      regions: [...accumulator.regions]
        .sort((a, b) => a.localeCompare(b))
        .map((code) => ({ code, name: regionName.get(code) ?? code })),
    });
  }
  return result;
}

/* ========================================================================== */
/* Meta                                                                        */
/* ========================================================================== */

const DISCLAIMER =
  '本网站提供食源性寄生虫知识科普与风险信息参考，不构成医学诊断或治疗建议。食物风险受来源、加工工艺与个体差异影响；如有健康疑问，请及时就医并告知医生相关饮食史。';

const DATA_NOTES = [
  '地图颜色表达文献证据状态（地方性流行、高发区、有病例记载、资料有限等），不表达量化风险分值。',
  '“资料有限 / 文献未见报道”不代表该地区没有风险，不能据此推断绝对安全。',
  '感染率等数字来自原始文献，研究对象与统计口径不同，不能直接比较或加总。',
  '知识库仅收录可追溯来源的公开资料，不提供个人诊断与用药建议。',
];

export function buildMeta(data: LoadedData, now: Date = new Date()): AtlasMeta {
  return {
    version: data.version,
    updatedAt: data.updatedAt,
    builtAt: now.toISOString(),
    counts: {
      parasites: data.parasites.length,
      foods: data.foods.length,
      regions: data.regions.length,
      sources: data.sources.length,
      rules: data.rules.length,
    },
    now: computeShanghaiNow(now),
    disclaimer: DISCLAIMER,
    dataNotes: DATA_NOTES,
  };
}

/* ========================================================================== */
/* 构建全部派生数据                                                            */
/* ========================================================================== */

export function buildDerived(data: LoadedData, now: Date = new Date()): DerivedStoreData {
  const parasiteById = new Map<string, Parasite>();
  for (const parasite of data.parasites) parasiteById.set(parasite.id, parasite);
  const foodById = new Map<string, Food>();
  for (const food of data.foods) foodById.set(food.id, food);
  const regionByCode = new Map<string, Region>();
  const regionByShortCode = new Map<string, Region>();
  for (const region of data.regions) {
    regionByCode.set(region.code, region);
    if (!regionByShortCode.has(region.shortCode)) regionByShortCode.set(region.shortCode, region);
  }
  const sourceById = new Map<string, Source>();
  for (const source of data.sources) sourceById.set(source.id, source);

  const parasiteOrder = new Map<string, number>();
  data.parasites.forEach((parasite, index) => parasiteOrder.set(parasite.id, parasite.order || index + 1));

  const { evidence: parasiteRegionEvidence, counts: regionCountByParasite } =
    aggregateParasiteRegionEvidence(data.regions);
  const { evidence: foodRegionEvidence } = aggregateFoodRegionEvidence(data.regions, data.foods, parasiteById);

  const parasiteSummaries = data.parasites.map((parasite) =>
    toParasiteSummary(parasite, regionCountByParasite.get(parasite.id) ?? 0),
  );
  const foodSummaries = data.foods.map(toFoodSummary);
  const regionSummaries = data.regions.map((region) => toRegionSummary(region, parasiteOrder));

  const parasiteSummaryById = new Map(parasiteSummaries.map((summary) => [summary.id, summary]));
  const foodSummaryById = new Map(foodSummaries.map((summary) => [summary.id, summary]));

  const { byParasite: rulesByParasite } = groupRules(data.rules);
  const rulesByFood = fillRulesByFood(data.rules, data.foods, parasiteById);
  const sourceCitedBy = aggregateSourceCitations(data.sources, data.parasites, data.foods, data.regions, data.rules);
  const neighborsByRegionCode = buildNeighbors(data.regions, data.provinceCenters);

  const derived: DerivedStoreData = {
    data,
    taxonomy: data.taxonomy,
    parasites: data.parasites,
    foods: data.foods,
    regions: data.regions,
    rules: data.rules,
    sources: data.sources,
    provinceCenters: data.provinceCenters,
    cities: data.cities,
    parasiteById,
    foodById,
    regionByCode,
    regionByShortCode,
    sourceById,
    parasiteRegionEvidence,
    regionCountByParasite,
    foodRegionEvidence,
    parasiteSummaries,
    foodSummaries,
    regionSummaries,
    parasiteSummaryById,
    foodSummaryById,
    rulesByParasite,
    rulesByFood,
    sourceCitedBy,
    neighborsByRegionCode,
    meta: buildMeta(data, now),
    knowledgeChunks: [],
    suggestions: [],
  };

  derived.knowledgeChunks = buildKnowledgeChunks(derived);
  derived.suggestions = buildSuggestions(derived);
  return derived;
}

/* ========================================================================== */
/* Detail 组装                                                                 */
/* ========================================================================== */

export function buildParasiteDetail(derived: DerivedStoreData, id: string): ParasiteDetail | null {
  const parasite = derived.parasiteById.get(id);
  if (!parasite) return null;
  const foods: FoodSummary[] = [];
  for (const foodId of parasite.foodIds) {
    const summary = derived.foodSummaryById.get(foodId);
    if (summary) foods.push(summary);
  }
  return {
    ...parasite,
    foods,
    regionEvidence: derived.parasiteRegionEvidence.get(id) ?? [],
    rules: derived.rulesByParasite.get(id) ?? [],
  };
}

export function buildFoodDetail(derived: DerivedStoreData, id: string): FoodDetail | null {
  const food = derived.foodById.get(id);
  if (!food) return null;
  const parasites: ParasiteSummary[] = [];
  const seen = new Set<string>();
  for (const parasiteId of food.parasiteIds) {
    if (seen.has(parasiteId)) continue;
    seen.add(parasiteId);
    const summary = derived.parasiteSummaryById.get(parasiteId);
    if (summary) parasites.push(summary);
  }
  parasites.sort((a, b) => {
    const orderA = derived.parasiteById.get(a.id)?.order ?? 999;
    const orderB = derived.parasiteById.get(b.id)?.order ?? 999;
    return orderA - orderB || a.id.localeCompare(b.id);
  });
  return {
    ...food,
    parasites,
    regions: derived.foodRegionEvidence.get(id) ?? [],
    rules: derived.rulesByFood.get(id) ?? [],
  };
}

export function buildRegionDetail(derived: DerivedStoreData, code: string): RegionDetail | null {
  const region = derived.regionByCode.get(code) ?? derived.regionByShortCode.get(code);
  if (!region) return null;
  const summary = derived.regionSummaries.find((item) => item.code === region.code);
  const parasiteIds = summary?.parasiteIds ?? [];
  const parasites: ParasiteSummary[] = [];
  for (const parasiteId of parasiteIds) {
    const item = derived.parasiteSummaryById.get(parasiteId);
    if (item) parasites.push(item);
  }

  const foodIds = new Set<string>();
  for (const entry of region.entries) for (const foodId of entry.foodIds ?? []) foodIds.add(foodId);
  if (!foodIds.size) {
    // 证据未显式标注食物时，退化为相关寄生虫的关联食物（派生关联）
    for (const parasiteId of parasiteIds) {
      const parasite = derived.parasiteById.get(parasiteId);
      for (const foodId of parasite?.foodIds ?? []) foodIds.add(foodId);
    }
  }
  const foods: FoodSummary[] = [];
  for (const foodId of foodIds) {
    const item = derived.foodSummaryById.get(foodId);
    if (item) foods.push(item);
  }
  foods.sort((a, b) => {
    const orderA = derived.foodById.get(a.id)?.order ?? 999;
    const orderB = derived.foodById.get(b.id)?.order ?? 999;
    return orderA - orderB || a.id.localeCompare(b.id);
  });

  return {
    ...region,
    parasites,
    foods,
    neighbors: derived.neighborsByRegionCode.get(region.code) ?? [],
    totalEvidenceItems: region.entries.length + region.studySites.length + region.seasonalNotes.length,
  };
}

export function buildSourceDetail(derived: DerivedStoreData, id: string): SourceDetail | null {
  const source = derived.sourceById.get(id);
  if (!source) return null;
  return {
    ...source,
    citedBy: derived.sourceCitedBy.get(id) ?? { parasites: [], foods: [], regions: [] },
  };
}

/* ========================================================================== */
/* 知识块（RAG 检索）                                                          */
/* ========================================================================== */

/* 知识块上限：22 种寄生虫 × 多类区块全量约 810 块，上限留有余量 */
const MAX_CHUNKS = 900;
const MAX_CHUNK_TEXT = 480;

interface ChunkInput {
  kind: KnowledgeChunk['kind'];
  entityId: string;
  title: string;
  text: string;
  parasiteIds?: string[];
  foodIds?: string[];
  provinceCodes?: string[];
  months?: number[];
  sourceIds?: string[];
  weight?: number;
}

const clipText = (text: string, max = MAX_CHUNK_TEXT): string =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

const joinParts = (...parts: Array<string | string[] | undefined | false>): string => {
  const flat: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (Array.isArray(part)) {
      for (const item of part) if (item && item.trim()) flat.push(item.trim());
    } else if (part.trim()) {
      flat.push(part.trim());
    }
  }
  return flat.join(' ');
};

const sourceIdsOf = (...groups: Array<{ sourceIds?: string[] } | string[]>): string[] => {
  const set = new Set<string>();
  for (const group of groups) {
    if (Array.isArray(group)) {
      for (const id of group) set.add(id);
    } else {
      for (const id of group.sourceIds ?? []) set.add(id);
    }
  }
  return [...set];
};

export function buildKnowledgeChunks(derived: DerivedStoreData): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  const usedIds = new Set<string>();
  const makeId = (base: string): string => {
    let id = base;
    let counter = 2;
    while (usedIds.has(id)) {
      id = `${base}#${counter}`;
      counter += 1;
    }
    usedIds.add(id);
    return id;
  };
  const add = (idBase: string, input: ChunkInput): void => {
    const text = input.text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const title = input.title.replace(/\s+/g, ' ').trim() || input.entityId;
    chunks.push({
      id: makeId(idBase),
      kind: input.kind,
      entityId: input.entityId,
      title,
      text: clipText(text),
      parasiteIds: [...new Set(input.parasiteIds ?? [])],
      foodIds: [...new Set(input.foodIds ?? [])],
      provinceCodes: [...new Set(input.provinceCodes ?? [])],
      months: [...new Set(input.months ?? [])].sort((a, b) => a - b),
      sourceIds: [...new Set(input.sourceIds ?? [])],
      weight: input.weight ?? 1,
    });
  };

  const parasiteName = (id: string): string => derived.parasiteById.get(id)?.name ?? id;
  const foodName = (id: string): string => derived.foodById.get(id)?.name ?? id;
  const regionName = (code: string): string => derived.regionByCode.get(code)?.name ?? code;

  /* ---- 寄生虫 ---- */
  for (const parasite of derived.parasites) {
    const base = `parasite:${parasite.id}`;
    const allSources = sourceIdsOf(
      parasite.transmission,
      parasite.distribution,
      parasite.seasonality,
      parasite.treatment,
      ...parasite.prevention,
      ...parasite.postExposure,
      ...parasite.consequences,
      ...parasite.riskScenarios,
    );
    add(`${base}:summary`, {
      kind: 'parasite',
      entityId: parasite.id,
      title: `${parasite.name}（${parasite.latinName || parasite.categoryLabel}）概览`,
      text: joinParts(
        parasite.tagline,
        parasite.summary,
        `分类：${parasite.categoryLabel}`,
        `证据等级：${parasite.evidence.level}（${EVIDENCE_LEVEL_LABELS[parasite.evidence.level]}）`,
        parasite.evidence.basis ? `证据说明：${parasite.evidence.basis}` : '',
        parasite.evidence.caveats.length ? `使用注意：${parasite.evidence.caveats.join('；')}` : '',
      ),
      parasiteIds: [parasite.id],
      foodIds: parasite.foodIds,
      provinceCodes: parasite.featuredRegionCodes ?? [],
      months: parasite.seasonality.peakMonths,
      sourceIds: allSources.slice(0, 10),
      weight: 1.3,
    });

    add(`${base}:transmission`, {
      kind: 'parasite',
      entityId: parasite.id,
      title: `${parasite.name}的传播途径与生活史`,
      text: joinParts(
        parasite.transmission.summary,
        parasite.transmission.infectiveStage ? `感染阶段：${parasite.transmission.infectiveStage}` : '',
        parasite.transmission.entryMode ? `侵入方式：${parasite.transmission.entryMode}` : '',
        parasite.transmission.vehicles.length
          ? `可被摄入的载体：${parasite.transmission.vehicles.join('、')}`
          : '',
        parasite.transmission.stages.map((stage) => `${stage.name}（${stage.host}）：${stage.description}`),
        parasite.transmission.hosts.definitive.length
          ? `终宿主：${parasite.transmission.hosts.definitive.join('、')}`
          : '',
        parasite.transmission.hosts.intermediate.length
          ? `中间宿主：${parasite.transmission.hosts.intermediate.join('、')}`
          : '',
      ),
      parasiteIds: [parasite.id],
      foodIds: parasite.foodIds,
      sourceIds: parasite.transmission.sourceIds,
      weight: 1.2,
    });

    for (const scenario of parasite.riskScenarios) {
      add(`${base}:scenario:${scenario.id}`, {
        kind: 'parasite',
        entityId: parasite.id,
        title: `${parasite.name}风险场景：${scenario.title}`,
        text: joinParts(
          scenario.explanation,
          scenario.examples?.length ? `常见吃法/场景：${scenario.examples.join('、')}` : '',
          `风险等级：${RISK_LEVEL_LABELS[scenario.riskLevel]}`,
        ),
        parasiteIds: [parasite.id],
        foodIds: scenario.foodIds,
        months: [],
        sourceIds: scenario.sourceIds,
        weight: 1.35,
      });
    }

    for (const consequence of parasite.consequences) {
      add(`${base}:consequence:${consequence.id}`, {
        kind: 'consequence',
        entityId: parasite.id,
        title: `${parasite.name}的健康后果：${consequence.title}`,
        text: joinParts(
          consequence.description,
          consequence.onset ? `潜伏期/起病：${consequence.onset}` : '',
          `严重程度：${SEVERITY_LABELS[consequence.severity]}`,
        ),
        parasiteIds: [parasite.id],
        foodIds: parasite.foodIds,
        sourceIds: consequence.sourceIds,
        weight: 1.1,
      });
    }

    if (parasite.prevention.length) {
      add(`${base}:prevention`, {
        kind: 'prevention',
        entityId: parasite.id,
        title: `${parasite.name}的预防要点`,
        text: parasite.prevention.map((measure) => `${measure.title}：${measure.detail}`).join(' '),
        parasiteIds: [parasite.id],
        foodIds: parasite.foodIds,
        sourceIds: sourceIdsOf(...parasite.prevention),
        weight: 1.15,
      });
    }

    if (parasite.postExposure.length) {
      add(`${base}:post-exposure`, {
        kind: 'post-exposure',
        entityId: parasite.id,
        title: `${parasite.name}：已食用后的建议`,
        text: parasite.postExposure.map((measure) => `${measure.title}：${measure.detail}`).join(' '),
        parasiteIds: [parasite.id],
        foodIds: parasite.foodIds,
        sourceIds: sourceIdsOf(...parasite.postExposure),
        weight: 1.1,
      });
    }

    add(`${base}:treatment`, {
      kind: 'parasite',
      entityId: parasite.id,
      title: `${parasite.name}的治疗与就医提示`,
      text: joinParts(
        parasite.treatment.summary,
        parasite.treatment.drugs?.length ? `资料中提及的药物：${parasite.treatment.drugs.join('、')}` : '',
        `重要提醒：${parasite.treatment.note}`,
      ),
      parasiteIds: [parasite.id],
      sourceIds: parasite.treatment.sourceIds,
      weight: 0.8,
    });

    add(`${base}:distribution`, {
      kind: 'parasite',
      entityId: parasite.id,
      title: `${parasite.name}的全国分布`,
      text: joinParts(
        parasite.distribution.summary,
        `全国证据状态：${REGION_STATUS_LABELS[parasite.distribution.status]}`,
        parasite.distribution.stats?.map((stat) => `${stat.label}：${stat.value}${stat.note ? `（${stat.note}）` : ''}`),
      ),
      parasiteIds: [parasite.id],
      foodIds: parasite.foodIds,
      provinceCodes: parasite.featuredRegionCodes ?? [],
      sourceIds: parasite.distribution.sourceIds,
      weight: 0.95,
    });

    add(`${base}:season`, {
      kind: 'season',
      entityId: parasite.id,
      title: `${parasite.name}的季节性`,
      text: joinParts(
        parasite.seasonality.pattern,
        parasite.seasonality.evidenceNote,
        parasite.seasonality.contextNote ? `情境提示：${parasite.seasonality.contextNote}` : '',
      ),
      parasiteIds: [parasite.id],
      foodIds: parasite.foodIds,
      months: parasite.seasonality.peakMonths,
      sourceIds: parasite.seasonality.sourceIds,
      weight: 1,
    });
  }

  /* ---- 食物 ---- */
  for (const food of derived.foods) {
    const base = `food:${food.id}`;
    add(`${base}:summary`, {
      kind: 'food',
      entityId: food.id,
      title: `${food.name}与食源性寄生虫`,
      text: joinParts(
        food.tagline,
        food.summary,
        food.parasiteIds.length
          ? `相关寄生虫：${food.parasiteIds.map(parasiteName).join('、')}`
          : '文献未明确列出与本食物直接关联的寄生虫（资料边界请以原文为准）',
      ),
      parasiteIds: food.parasiteIds,
      foodIds: [food.id],
      sourceIds: food.sourceIds,
      weight: 1.25,
    });

    const riskWeight: Record<string, number> = {
      high: 1.35,
      moderate: 1.15,
      contextual: 0.95,
      low: 0.6,
      unknown: 0.5,
    };
    for (const preparation of food.preparations) {
      add(`${base}:prep:${preparation.tag}`, {
        kind: 'food',
        entityId: food.id,
        title: `${food.name} · ${preparation.label || PREPARATION_LABELS[preparation.tag]}`,
        text: joinParts(
          preparation.explanation,
          `该处理方式的风险倾向：${RISK_LEVEL_LABELS[preparation.risk]}`,
          preparation.parasiteIds.length
            ? `相关寄生虫：${preparation.parasiteIds.map(parasiteName).join('、')}`
            : '',
          preparation.saferAlternative ? `更安全的替代做法：${preparation.saferAlternative}` : '',
        ),
        parasiteIds: preparation.parasiteIds,
        foodIds: [food.id],
        sourceIds: preparation.sourceIds,
        weight: riskWeight[preparation.risk] ?? 0.8,
      });
    }

    // 常见吃法按食物合并为一块，保留全部菜名与风险提示，同时控制知识块总量
    if (food.exampleDishes.length) {
      const dishParasites = new Set<string>();
      for (const dish of food.exampleDishes) for (const id of dish.parasiteIds) dishParasites.add(id);
      add(`${base}:dishes`, {
        kind: 'food',
        entityId: food.id,
        title: `${food.name}的常见吃法与风险`,
        text: food.exampleDishes
          .map(
            (dish) =>
              `${dish.name}${dish.context ? `（${dish.context}）` : ''}：${dish.riskNote}${
                dish.parasiteIds.length ? `（相关寄生虫：${dish.parasiteIds.map(parasiteName).join('、')}）` : ''
              }`,
          )
          .join(' '),
        parasiteIds: [...dishParasites],
        foodIds: [food.id],
        sourceIds: sourceIdsOf(...food.exampleDishes.map((dish) => dish.sourceIds ?? food.sourceIds)),
        weight: 1.05,
      });
    }

    if (food.tips.length) {
      add(`${base}:tips`, {
        kind: 'prevention',
        entityId: food.id,
        title: `${food.name}的选购与处理要点`,
        text: food.tips.map((tip) => `${tip.title}：${tip.detail}`).join(' '),
        parasiteIds: food.parasiteIds,
        foodIds: [food.id],
        sourceIds: sourceIdsOf(...food.tips, food.sourceIds),
        weight: 0.9,
      });
    }

    add(`${base}:season`, {
      kind: 'season',
      entityId: food.id,
      title: `${food.name}的季节与饮食情境`,
      text: food.seasonNote,
      parasiteIds: food.parasiteIds,
      foodIds: [food.id],
      sourceIds: food.sourceIds,
      weight: 0.7,
    });
  }

  /* ---- 地区 ---- */
  for (const region of derived.regions) {
    const base = `region:${region.code}`;
    const regionParasites = new Set<string>();
    for (const entry of region.entries) for (const id of entry.parasiteIds) regionParasites.add(id);
    add(`${base}:overview`, {
      kind: 'region',
      entityId: region.code,
      title: `${region.name}的食源性寄生虫证据概览`,
      text: joinParts(
        region.intro,
        `汇总证据状态：${REGION_STATUS_LABELS[region.evidenceStatus]}`,
        region.evidenceSummary,
        region.foodCulture.length ? `饮食特点：${region.foodCulture.join('；')}` : '',
      ),
      parasiteIds: [...regionParasites],
      provinceCodes: [region.code],
      sourceIds: region.sourceIds,
      weight: 1.05,
    });

    for (const entry of region.entries) {
      const context = entry.studyContext;
      const contextText = context
        ? [
            context.population ? `研究人群：${context.population}` : '',
            context.sample ? `样本：${context.sample}` : '',
            context.period ? `时间：${context.period}` : '',
            context.statistic ? `统计口径/结果：${context.statistic}` : '',
            context.location ? `地点：${context.location}` : '',
          ]
            .filter(Boolean)
            .join('；')
        : '';
      add(`${base}:entry:${entry.id}`, {
        kind: 'region',
        entityId: region.code,
        title: `${region.name}：${entry.headline}`,
        text: joinParts(
          entry.detail,
          contextText ? `研究语境：${contextText}` : '',
          `证据状态：${REGION_STATUS_LABELS[entry.status]}`,
          `证据等级：${entry.evidenceLevel}（${EVIDENCE_LEVEL_LABELS[entry.evidenceLevel]}）`,
        ),
        parasiteIds: entry.parasiteIds,
        foodIds: entry.foodIds ?? [],
        provinceCodes: [region.code],
        sourceIds: entry.sourceIds,
        weight: 1 + REGION_STATUS_RANK[entry.status] * 0.03 + EVIDENCE_RANK[entry.evidenceLevel] * 0.03,
      });
    }

    // 研究地点按省份合并为一块，控制知识块总量（原文信息全部保留在 text 中）
    if (region.studySites.length) {
      const siteParasites = new Set<string>();
      for (const site of region.studySites) for (const id of site.parasiteIds) siteParasites.add(id);
      add(`${base}:sites`, {
        kind: 'region',
        entityId: region.code,
        title: `${region.name}的研究地点`,
        text: region.studySites.map((site) => `${site.name}：${site.note}`).join(' '),
        parasiteIds: [...siteParasites],
        provinceCodes: [region.code],
        sourceIds: sourceIdsOf(...region.studySites.map((site) => site.sourceIds)),
        weight: 0.75,
      });
    }

    for (const note of region.seasonalNotes) {
      const kindLabel = note.basis === 'infection-evidence' ? '季节证据' : '季节饮食情境（非流行病学结论）';
      add(`${base}:season:${note.months.join('-')}:${note.parasiteIds.join('-')}`, {
        kind: 'season',
        entityId: region.code,
        title: `${region.name}${kindLabel}`,
        text: note.note,
        parasiteIds: note.parasiteIds,
        provinceCodes: [region.code],
        months: note.months,
        sourceIds: note.sourceIds,
        weight: note.basis === 'infection-evidence' ? 1.05 : 0.7,
      });
    }
  }

  /* ---- 风险规则 ---- */
  for (const rule of derived.rules) {
    const parasite = derived.parasiteById.get(rule.parasiteId);
    if (!parasite) continue;
    const foodIds =
      rule.when.foodIds ??
      derived.foods
        .filter((food) => (rule.when.foodCategoryIds ?? []).includes(food.categoryId))
        .map((food) => food.id)
        .slice(0, 8);
    add(`rule:${rule.id}`, {
      kind: 'rule',
      entityId: rule.id,
      title: `风险规则：${parasite.name} × ${foodIds.map(foodName).join('、') || '相关食物'}`,
      text: joinParts(
        rule.rationale,
        `风险等级：${RISK_LEVEL_LABELS[rule.riskLevel]}`,
        rule.when.preparationTags?.length
          ? `处理方式：${rule.when.preparationTags.map((tag) => PREPARATION_LABELS[tag]).join('、')}`
          : '',
        rule.conditions?.length ? `适用条件：${rule.conditions.join('；')}` : '',
      ),
      parasiteIds: [parasite.id],
      foodIds,
      provinceCodes: rule.when.provinceCodes ?? [],
      months: rule.when.months ?? [],
      sourceIds: rule.sourceIds,
      weight: 1.1 + Math.min(rule.priority, 100) / 500,
    });
  }

  if (chunks.length > MAX_CHUNKS) {
    console.warn(`[data] knowledgeChunks 共 ${chunks.length} 块，超过上限 ${MAX_CHUNKS}，按权重截断`);
    chunks.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    chunks.length = MAX_CHUNKS;
    chunks.sort((a, b) => a.id.localeCompare(b.id));
  }
  return chunks;
}

/* ========================================================================== */
/* 对话建议问题                                                                */
/* ========================================================================== */

const FALLBACK_SUGGESTIONS = [
  '生吃淡水鱼有感染肝吸虫的风险吗？',
  '涮羊肉没涮熟安全吗？',
  '吃了生腌之后很担心，应该怎么办？',
  '哪些地区是食源性寄生虫的重点流行区？',
  '怎么处理和烹饪才能降低寄生虫风险？',
  '当前季节需要格外当心哪些吃法？',
];

/** 生成建议问题时优先挑选更贴近公众高频疑问的食材 */
const RAW_RISK_FOOD_PRIORITY = [
  'freshwater-fish',
  'marine-fish',
  'snail',
  'crab',
  'crayfish',
  'shrimp',
  'pork',
  'beef',
  'mutton',
  'frog',
  'snake',
  'aquatic-plant',
  'vegetable',
];
const UNDERCOOKED_FOOD_PRIORITY = [
  'mutton',
  'pork',
  'beef',
  'freshwater-fish',
  'crab',
  'crayfish',
  'snail',
  'aquatic-plant',
];

function pickFood(derived: DerivedStoreData, priority: string[], fallbackFoods: Food[]): Food | undefined {
  for (const foodId of priority) {
    const food = derived.foodById.get(foodId);
    if (food) return food;
  }
  return fallbackFoods[0];
}

export function buildSuggestions(derived: DerivedStoreData): string[] {
  const suggestions: string[] = [];
  const push = (value: string | undefined): void => {
    const text = value?.trim();
    if (text && !suggestions.includes(text)) suggestions.push(text);
  };

  const featuredFoods = derived.foods.filter((food) => food.featured);
  const featuredParasites = derived.parasites.filter((parasite) => parasite.featured);
  const rawFood =
    pickFood(derived, RAW_RISK_FOOD_PRIORITY, derived.foods) ??
    featuredFoods.find((food) => food.preparations.some((prep) => prep.tag === 'raw'));
  const underFood =
    pickFood(
      derived,
      UNDERCOOKED_FOOD_PRIORITY.filter((id) => id !== rawFood?.id),
      derived.foods,
    ) ?? featuredFoods.find((food) => food.id !== rawFood?.id);
  const parasite = featuredParasites[0] ?? derived.parasites[0];

  // 地区建议优先选“重点寄生虫明确标注的相关省份”，其次选证据状态最强者
  const featuredRegionCodes = featuredParasites.flatMap((item) => item.featuredRegionCodes ?? []);
  const regionFromFeatured = featuredRegionCodes
    .map((code) => derived.regionByCode.get(code))
    .find((item): item is Region => Boolean(item));
  const region =
    regionFromFeatured ??
    derived.regions.find((item) => item.evidenceStatus === 'endemic') ??
    derived.regions.find((item) => item.entries.length > 0) ??
    derived.regions[0];

  if (rawFood) push(`生吃${rawFood.name}有寄生虫风险吗？`);
  if (underFood) push(`${underFood.name}没熟透能吃吗？`);
  if (parasite) push(`${parasite.name}是怎么感染人的？`);
  if (region) push(`去${region.shortName}吃东西需要注意什么寄生虫风险？`);
  push(`现在是${derived.meta.now.seasonLabel}，哪些吃法要格外当心？`);
  push('吃了生腌或没熟透的肉，应该怎么办？');

  for (const fallback of FALLBACK_SUGGESTIONS) {
    if (suggestions.length >= 6) break;
    if (suggestions.length < 4) push(fallback);
  }
  // 数据极少时仍保证 4–6 条
  for (const fallback of FALLBACK_SUGGESTIONS) {
    if (suggestions.length >= 4) break;
    push(fallback);
  }
  return suggestions.slice(0, 6);
}
