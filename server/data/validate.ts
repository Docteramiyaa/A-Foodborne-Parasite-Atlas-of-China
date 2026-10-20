/**
 * 启动时轻量结构检查（只读，不修改数据，不阻断启动）。
 *
 * 与 scripts/validate-data.ts 的区别：
 * - 本文件面向「已加载进内存的 store」，检查加载器聚合后的结果是否自洽；
 * - 只做轻量检查，避免启动变慢；数据完整性缺口（如还有 30 个地区未写完）
 *   只记 warning，用于启动日志和测试断言 errors.length === 0。
 */
import type { KnowledgeStore } from './store.js';
import { collectSourceIdsDeep } from './loader.js';

/** 数据契约（相关约定）中锁定的实体清单 */
const EXPECTED = {
  parasites: [
    'taenia-solium',
    'taenia-saginata',
    'trichinella-spiralis',
    'toxoplasma-gondii',
    'echinococcus-granulosus',
    'echinococcus-multilocularis',
    'linguatula-serrata',
    'clonorchis-sinensis',
    'anisakis',
    'gnathostoma-spinigerum',
    'spirometra-mansoni',
    'angiostrongylus-cantonensis',
    'paragonimus-westermani',
    'fasciolopsis-buski',
    'fasciola-gigantica',
    'cryptosporidium',
    'entamoeba-histolytica',
    'ascaris-lumbricoides',
    'diphyllobothrium-latum',
    'giardia-lamblia',
    'echinostoma',
    'sarcocystis',
  ],
  foods: [
    'pork',
    'beef',
    'mutton',
    'game-meat',
    'offal',
    'freshwater-fish',
    'marine-fish',
    'shrimp',
    'crab',
    'crayfish',
    'snail',
    'frog',
    'snake',
    'aquatic-plant',
    'vegetable',
    'fruit',
    'drinking-water',
    'raw-milk',
    'other-aquatic',
  ],
  regions: [
    '110000', '120000', '130000', '140000', '150000', '210000', '220000', '230000',
    '310000', '320000', '330000', '340000', '350000', '360000', '370000', '410000',
    '420000', '430000', '440000', '450000', '460000', '500000', '510000', '520000',
    '530000', '540000', '610000', '620000', '630000', '640000', '650000', '710000',
    '810000', '820000',
  ],
  sourcesCount: 66,
  minRules: 30,
} as const;

export interface DataValidation {
  ok: boolean;
  counts: {
    parasites: number;
    foods: number;
    regions: number;
    sources: number;
    rules: number;
    evidenceEntries: number;
    knowledgeChunks: number;
    cities: number;
  };
  missing: string[];
  warnings: string[];
  errors: string[];
}

type ValidatableStore = Pick<
  KnowledgeStore,
  'parasites' | 'foods' | 'regions' | 'sources' | 'rules' | 'taxonomy' | 'knowledgeChunks' | 'meta' | 'cities'
>;

export function validateStore(store: ValidatableStore): DataValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missing: string[] = [];

  const parasiteIds = new Set(store.parasites.map((parasite) => parasite.id));
  const foodIds = new Set(store.foods.map((food) => food.id));
  const regionCodes = new Set(store.regions.map((region) => region.code));
  const sourceIds = new Set(store.sources.map((source) => source.id));

  /* ---- 重复 id ---- */
  const checkDuplicates = (ids: string[], label: string): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label}存在重复 id：${id}`);
      seen.add(id);
    }
  };
  checkDuplicates(store.parasites.map((item) => item.id), '寄生虫');
  checkDuplicates(store.foods.map((item) => item.id), '食物');
  checkDuplicates(store.regions.map((item) => item.code), '地区');
  checkDuplicates(store.sources.map((item) => item.id), '来源');
  checkDuplicates(store.rules.map((item) => item.id), '风险规则');

  /* ---- meta.counts 与实际一致 ---- */
  const counts = {
    parasites: store.parasites.length,
    foods: store.foods.length,
    regions: store.regions.length,
    sources: store.sources.length,
    rules: store.rules.length,
    evidenceEntries: store.regions.reduce((sum, region) => sum + region.entries.length, 0),
    knowledgeChunks: store.knowledgeChunks.length,
    cities: store.cities.length,
  };
  const metaCounts = store.meta.counts;
  if (
    metaCounts.parasites !== counts.parasites ||
    metaCounts.foods !== counts.foods ||
    metaCounts.regions !== counts.regions ||
    metaCounts.sources !== counts.sources ||
    metaCounts.rules !== counts.rules
  ) {
    errors.push(
      `meta.counts 与实际数量不一致：meta=${JSON.stringify(metaCounts)} actual=${JSON.stringify({
        parasites: counts.parasites,
        foods: counts.foods,
        regions: counts.regions,
        sources: counts.sources,
        rules: counts.rules,
      })}`,
    );
  }

  /* ---- 引用完整性 ---- */
  const checkIds = (label: string, ids: string[] | undefined, valid: Set<string>, kind: string): void => {
    for (const id of ids ?? []) {
      if (!valid.has(id)) errors.push(`${label} 引用了不存在的${kind}：${id}`);
    }
  };
  for (const parasite of store.parasites) {
    checkIds(`寄生虫 ${parasite.id}.foodIds`, parasite.foodIds, foodIds, '食物');
    checkIds(`寄生虫 ${parasite.id}.relatedParasiteIds`, parasite.relatedParasiteIds, parasiteIds, '寄生虫');
    checkIds(`寄生虫 ${parasite.id}.featuredRegionCodes`, parasite.featuredRegionCodes, regionCodes, '地区');
    for (const scenario of parasite.riskScenarios) {
      checkIds(`寄生虫 ${parasite.id} riskScenario ${scenario.id}`, scenario.foodIds, foodIds, '食物');
    }
  }
  for (const food of store.foods) {
    checkIds(`食物 ${food.id}.parasiteIds`, food.parasiteIds, parasiteIds, '寄生虫');
  }
  for (const region of store.regions) {
    for (const entry of region.entries) {
      checkIds(`地区 ${region.code} 证据 ${entry.id}.parasiteIds`, entry.parasiteIds, parasiteIds, '寄生虫');
      checkIds(`地区 ${region.code} 证据 ${entry.id}.foodIds`, entry.foodIds, foodIds, '食物');
    }
    for (const site of region.studySites) {
      checkIds(`地区 ${region.code} 研究地点 ${site.id}`, site.parasiteIds, parasiteIds, '寄生虫');
    }
    for (const note of region.seasonalNotes) {
      checkIds(`地区 ${region.code} 季节说明`, note.parasiteIds, parasiteIds, '寄生虫');
    }
  }
  for (const rule of store.rules) {
    if (!parasiteIds.has(rule.parasiteId)) errors.push(`风险规则 ${rule.id} 的 parasiteId 不存在：${rule.parasiteId}`);
    checkIds(`风险规则 ${rule.id}.when.foodIds`, rule.when.foodIds, foodIds, '食物');
    checkIds(`风险规则 ${rule.id}.when.provinceCodes`, rule.when.provinceCodes, regionCodes, '地区');
    if (!rule.when.foodIds?.length && !rule.when.foodCategoryIds?.length) {
      errors.push(`风险规则 ${rule.id} 缺少食物条件`);
    }
  }

  /* ---- 来源引用 ---- */
  if (store.sources.length) {
    const checkSourceRefs = (label: string, entity: unknown): void => {
      for (const id of collectSourceIdsDeep(entity)) {
        if (!sourceIds.has(id)) errors.push(`${label} 引用了不存在的来源：${id}`);
      }
    };
    for (const parasite of store.parasites) checkSourceRefs(`寄生虫 ${parasite.id}`, parasite);
    for (const food of store.foods) checkSourceRefs(`食物 ${food.id}`, food);
    for (const region of store.regions) checkSourceRefs(`地区 ${region.code}`, region);
    for (const rule of store.rules) checkSourceRefs(`风险规则 ${rule.id}`, rule);
  } else if (counts.parasites + counts.foods + counts.regions > 0) {
    warnings.push('来源数据为空：实体 sourceIds 无法校验（等待 data/sources.json）');
  }

  /* ---- 分类体系 ---- */
  if (!store.taxonomy.preparations.length) warnings.push('taxonomy.preparations 为空（前端筛选与标签将退化为原始 id）');
  if (!store.taxonomy.foodCategories.length) warnings.push('taxonomy.foodCategories 为空');
  if (!store.taxonomy.parasiteCategories.length) warnings.push('taxonomy.parasiteCategories 为空');
  if (!store.taxonomy.regionStatuses.length) warnings.push('taxonomy.regionStatuses 为空');
  if (!store.taxonomy.evidenceLevels.length) warnings.push('taxonomy.evidenceLevels 为空');

  /* ---- 数据契约规模缺口（并行开发期只警告） ---- */
  const missingParasites = EXPECTED.parasites.filter((id) => !parasiteIds.has(id));
  const missingFoods = EXPECTED.foods.filter((id) => !foodIds.has(id));
  const missingRegions = EXPECTED.regions.filter((code) => !regionCodes.has(code));
  if (missingParasites.length) missing.push(`寄生虫 ${missingParasites.join(',')}`);
  if (missingFoods.length) missing.push(`食物 ${missingFoods.join(',')}`);
  if (missingRegions.length) missing.push(`地区 ${missingRegions.join(',')}`);
  if (store.sources.length !== EXPECTED.sourcesCount) {
    missing.push(`来源 ${store.sources.length}/${EXPECTED.sourcesCount}`);
  }
  if (store.rules.length < EXPECTED.minRules) {
    missing.push(`风险规则 ${store.rules.length}/${EXPECTED.minRules}`);
  }
  if (missing.length) warnings.push(`数据尚未齐全（预期清单缺口 ${missing.length} 项）`);

  /* ---- 知识块数量（数据基本齐全时才要求 300–900） ---- */
  const nearlyComplete =
    counts.parasites >= 15 && counts.foods >= 15 && counts.regions >= 25 && counts.sources >= 50;
  if (nearlyComplete) {
    if (counts.knowledgeChunks < 300) {
      warnings.push(`knowledgeChunks 仅 ${counts.knowledgeChunks} 块（目标 300–900）`);
    } else if (counts.knowledgeChunks > 900) {
      warnings.push(`knowledgeChunks 达 ${counts.knowledgeChunks} 块（目标上限 900）`);
    }
  } else if (counts.knowledgeChunks === 0 && counts.parasites + counts.foods + counts.regions > 0) {
    warnings.push('knowledgeChunks 为空：RAG 检索将无法命中文本块');
  }

  /* ---- 城市词典 ---- */
  if (!counts.cities) warnings.push('data/geo/cities.json 为空：resolveProvinces 仅支持省名/别名');

  /* ---- 规则覆盖度 ---- */
  const uncovered = store.parasites.filter(
    (parasite) => !store.rules.some((rule) => rule.parasiteId === parasite.id),
  );
  if (uncovered.length) {
    warnings.push(`有 ${uncovered.length} 种寄生虫没有风险规则：${uncovered.map((item) => item.id).join(',')}`);
  }

  return {
    ok: errors.length === 0,
    counts,
    missing,
    warnings,
    errors,
  };
}

export default validateStore;

