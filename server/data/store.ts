/**
 * 知识库单例（KnowledgeStore）。
 *
 * 这是 backend-core 与 backend-rag 的共享接口，字段与 docs/BACKEND_CONTRACT.md 一致。
 * 构建过程：loadData() → buildDerived()（派生摘要 / 详情 / 知识块 / 建议）→ 冻结为只读单例。
 *
 * 数据不完整时 store 仍然可用（数组可能为空）；只有 data/ 目录本身不存在时 getStore() 抛错。
 */
import type {
  AtlasMeta,
  ExploreQuery,
  ExploreResult,
  Food,
  FoodDetail,
  FoodSummary,
  Parasite,
  ParasiteDetail,
  ParasiteSummary,
  Region,
  RegionDetail,
  RegionSummary,
  RiskRule,
  SearchResponse,
  Source,
  SourceDetail,
  Taxonomy,
} from '../../shared/types.js';
import { loadData } from './loader.js';
import type { CityEntry, LoadedData } from './loader.js';
import {
  buildDerived,
  buildFoodDetail,
  buildParasiteDetail,
  buildRegionDetail,
  buildSourceDetail,
} from '../services/summary.js';
import type { DerivedStoreData } from '../services/summary.js';
import { searchKnowledge } from '../services/search.js';
import { runExplore } from '../services/explore.js';

/* ========================================================================== */
/* 契约：知识块                                                                */
/* ========================================================================== */

export interface KnowledgeChunk {
  /** 稳定 id，如 "parasite:clonorchis-sinensis:summary" */
  id: string;
  kind: 'parasite' | 'food' | 'region' | 'rule' | 'prevention' | 'consequence' | 'season' | 'post-exposure';
  entityId: string;
  title: string;
  text: string;
  parasiteIds: string[];
  foodIds: string[];
  provinceCodes: string[];
  months: number[];
  sourceIds: string[];
  /** 检索权重 */
  weight: number;
}

/* ========================================================================== */
/* 契约：KnowledgeStore                                                        */
/* ========================================================================== */

export interface KnowledgeStore {
  meta: AtlasMeta;
  taxonomy: Taxonomy;
  parasites: Parasite[];
  foods: Food[];
  regions: Region[];
  rules: RiskRule[];
  sources: Source[];
  parasiteById: ReadonlyMap<string, Parasite>;
  foodById: ReadonlyMap<string, Food>;
  regionByCode: ReadonlyMap<string, Region>;
  sourceById: ReadonlyMap<string, Source>;
  /** 派生/聚合 */
  parasiteSummaries: ParasiteSummary[];
  foodSummaries: FoodSummary[];
  regionSummaries: RegionSummary[];
  getParasiteDetail(id: string): ParasiteDetail | null;
  getFoodDetail(id: string): FoodDetail | null;
  getRegionDetail(code: string): RegionDetail | null;
  getSourceDetail(id: string): SourceDetail | null;
  search(q: string): SearchResponse;
  explore(query: ExploreQuery): ExploreResult;
  /** 地区相关辅助：省份名解析（含简称、别名、城市名） */
  resolveProvinces(input: string): { codes: string[]; matched: string[] };
  /** 供对话/检索使用的文本块索引（由核心构建一次） */
  knowledgeChunks: KnowledgeChunk[];
  suggestions: string[];
  /**
   * 扩展字段（非契约必需，向后兼容）：data/geo/cities.json 的城市词典，
   * 供 RAG/NLU 解析城市名。数据未生成时为空数组。
   */
  cities: CityEntry[];
}

/* ========================================================================== */
/* 省份名解析                                                                  */
/* ========================================================================== */

interface ProvinceAlias {
  needle: string;
  code: string;
  label: string;
  /** 越大越优先（省名 > 简称 > 别名 > 城市） */
  rank: number;
}

interface AliasHit extends ProvinceAlias {
  index: number;
}

function buildProvinceAliases(derived: DerivedStoreData): ProvinceAlias[] {
  const aliases: ProvinceAlias[] = [];
  const seen = new Set<string>();
  const push = (needle: string, code: string, label: string, rank: number): void => {
    const trimmed = needle.trim();
    if (!trimmed) return;
    const key = `${trimmed}::${code}`;
    if (seen.has(key)) return;
    seen.add(key);
    aliases.push({ needle: trimmed, code, label, rank });
  };
  for (const region of derived.regions) {
    push(region.name, region.code, region.name, 4);
    if (region.shortName !== region.name) push(region.shortName, region.code, region.shortName, 3);
    for (const alias of region.aliases) push(alias, region.code, alias, 2);
  }
  for (const city of derived.cities) {
    if (!derived.regionByCode.has(city.provinceCode)) continue;
    push(city.name, city.provinceCode, city.name, 1);
    for (const alias of city.aliases ?? []) push(alias, city.provinceCode, alias, 1);
  }
  // 长词优先，避免"北京"抢在"北京市"之前
  aliases.sort((a, b) => b.needle.length - a.needle.length || b.rank - a.rank);
  return aliases;
}

function resolveProvinces(derived: DerivedStoreData, input: string): { codes: string[]; matched: string[] } {
  const raw = (input ?? '').trim();
  if (!raw) return { codes: [], matched: [] };
  const codes: string[] = [];
  const matched: string[] = [];
  const seenCodes = new Set<string>();
  const addRegion = (code: string, label: string): void => {
    if (seenCodes.has(code)) return;
    seenCodes.add(code);
    codes.push(code);
    matched.push(label);
  };

  // 1) 整串就是 6 位 adcode 或 2 位短码
  if (/^\d{6}$/.test(raw)) {
    const region = derived.regionByCode.get(raw);
    if (region) return { codes: [region.code], matched: [region.name] };
    return { codes: [], matched: [] };
  }
  if (/^\d{2}$/.test(raw)) {
    const region = derived.regionByShortCode.get(raw);
    if (region) return { codes: [region.code], matched: [region.name] };
    return { codes: [], matched: [] };
  }

  const lower = raw.toLowerCase();
  const hits: AliasHit[] = [];
  for (const alias of buildProvinceAliases(derived)) {
    const needle = alias.needle.toLowerCase();
    let fromIndex = lower.indexOf(needle);
    while (fromIndex >= 0) {
      hits.push({ ...alias, index: fromIndex });
      fromIndex = lower.indexOf(needle, fromIndex + 1);
    }
  }

  // 2) 文本中出现的 6 位 adcode 也直接识别
  const adcodePattern = /\b\d{6}\b/g;
  let adcodeMatch: RegExpExecArray | null = adcodePattern.exec(raw);
  while (adcodeMatch) {
    const region = derived.regionByCode.get(adcodeMatch[0]);
    if (region) hits.push({ needle: adcodeMatch[0], code: region.code, label: region.name, rank: 5, index: adcodeMatch.index });
    adcodeMatch = adcodePattern.exec(raw);
  }

  // 3) 逗号分隔的 2 位短码
  for (const segment of raw.split(/[,，、;；\s]+/)) {
    const token = segment.trim();
    if (!/^\d{2}$/.test(token)) continue;
    const region = derived.regionByShortCode.get(token);
    if (region) {
      const index = raw.indexOf(token);
      hits.push({ needle: token, code: region.code, label: region.name, rank: 5, index });
    }
  }

  hits.sort(
    (a, b) =>
      a.index - b.index ||
      b.needle.length - a.needle.length ||
      b.rank - a.rank ||
      a.code.localeCompare(b.code),
  );

  const takenRanges: Array<[number, number]> = [];
  const overlapping = (start: number, end: number): boolean =>
    takenRanges.some(([takenStart, takenEnd]) => start < takenEnd && end > takenStart);
  for (const hit of hits) {
    const start = hit.index;
    const end = hit.index + hit.needle.length;
    if (overlapping(start, end)) continue;
    if (!derived.regionByCode.has(hit.code)) continue;
    takenRanges.push([start, end]);
    addRegion(hit.code, hit.label);
  }
  return { codes, matched };
}

/* ========================================================================== */
/* 构建                                                                        */
/* ========================================================================== */

function buildStore(derived: DerivedStoreData): KnowledgeStore {
  const store: KnowledgeStore = {
    meta: derived.meta,
    taxonomy: derived.taxonomy,
    parasites: derived.parasites,
    foods: derived.foods,
    regions: derived.regions,
    rules: derived.rules,
    sources: derived.sources,
    parasiteById: derived.parasiteById,
    foodById: derived.foodById,
    regionByCode: derived.regionByCode,
    sourceById: derived.sourceById,
    parasiteSummaries: derived.parasiteSummaries,
    foodSummaries: derived.foodSummaries,
    regionSummaries: derived.regionSummaries,
    getParasiteDetail: (id: string) => buildParasiteDetail(derived, id),
    getFoodDetail: (id: string) => buildFoodDetail(derived, id),
    getRegionDetail: (code: string) => buildRegionDetail(derived, code),
    getSourceDetail: (id: string) => buildSourceDetail(derived, id),
    search: (q: string) => searchKnowledge(store, q),
    explore: (query: ExploreQuery) => runExplore(store, query),
    resolveProvinces: (input: string) => resolveProvinces(derived, input),
    knowledgeChunks: derived.knowledgeChunks,
    suggestions: derived.suggestions,
    cities: derived.cities,
  };
  return store;
}

/** 从已加载数据构建 store（测试 / reloadStore 使用） */
export function createStoreFromLoadedData(loaded: LoadedData): KnowledgeStore {
  return buildStore(buildDerived(loaded));
}

let cachedStore: KnowledgeStore | null = null;

/** 单例；data/ 目录缺失时抛错（数据不完整但目录存在时只降级，不抛错） */
export function getStore(): KnowledgeStore {
  if (!cachedStore) cachedStore = buildStore(buildDerived(loadData()));
  return cachedStore;
}

/** 重新加载数据并替换单例（测试用；开发期修改 data 后也可调用） */
export function reloadStore(): KnowledgeStore {
  cachedStore = buildStore(buildDerived(loadData()));
  return cachedStore;
}
