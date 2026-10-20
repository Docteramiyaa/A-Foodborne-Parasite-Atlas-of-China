/**
 * RAG 知识层适配
 * ------------------------------------------------------------
 * 把 backend-core 的 `KnowledgeStore`（按 docs/BACKEND_CONTRACT.md 契约）以
 * **结构化鸭子类型**的方式适配给 NLU / 检索 / 组装使用，并在数据不完整时提供
 * 降级能力：
 *   - 缺少 taxonomy / 实体数组时使用空数据继续工作；
 *   - `knowledgeChunks` 为空时，内部根据结构化实体生成兜底文本块（不修改 store）；
 *   - `data/geo/cities.json` 缺失时使用内置主要城市词典兜底。
 *
 * 本文件不 import `server/data/store.ts`，避免并行开发期的编译顺序依赖。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AtlasMeta,
  Food,
  Parasite,
  PreparationTag,
  Region,
  RiskRule,
  Source,
  Taxonomy,
} from '../../shared/types.js';
import { buildTokenSet, type TextTokenSet, uniq } from './text.js';

/* ========================================================================== */
/* 类型                                                                        */
/* ========================================================================== */

/** 与 BACKEND_CONTRACT 的 KnowledgeChunk 结构一致的本地镜像 */
export interface RagChunk {
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
  weight: number;
}

/** 城市 → 省份映射条目（data/geo/cities.json 的 items） */
export interface CityEntry {
  name: string;
  provinceCode: string;
  aliases?: string[];
  level?: string;
}

/**
 * RAG 所需的知识视图。
 * backend-core 的 KnowledgeStore 结构上满足本接口（字段只多不少）。
 * 所有字段都允许缺省，以便数据层未完成时降级。
 */
export interface RagKnowledge {
  meta?: AtlasMeta;
  taxonomy?: Taxonomy;
  parasites?: Parasite[];
  foods?: Food[];
  regions?: Region[];
  rules?: RiskRule[];
  sources?: Source[];
  cities?: CityEntry[];
  suggestions?: string[];
  knowledgeChunks?: RagChunk[];
}

/** 规范化 + 索引后的知识视图（检索热路径使用，避免重复排序/建表） */
export interface RagIndex {
  knowledge: RagKnowledge;
  taxonomy: Taxonomy;
  parasites: Parasite[];
  foods: Food[];
  regions: Region[];
  rules: RiskRule[];
  sources: Source[];
  cities: CityEntry[];
  chunks: RagChunk[];
  parasiteById: Map<string, Parasite>;
  foodById: Map<string, Food>;
  regionByCode: Map<string, Region>;
  sourceById: Map<string, Source>;
  chunkTokens: Map<string, TextTokenSet>;
}

/* ========================================================================== */
/* 省份静态表（34 个省级行政区，来自 DATA_CONTRACT）                            */
/* ========================================================================== */

export interface ProvinceInfo {
  code: string;
  shortCode: string;
  name: string;
  shortName: string;
  aliases: string[];
}

/**
 * 省级行政区静态表。
 * 用途：数据层 `regions/*.json` 尚未齐备时仍能识别“广东/粤/成都→四川”等表达。
 * 数据层存在同 code 的地区时，以数据层的 name/shortName/aliases 为准（本表仍补充常用别名）。
 * 注意：单字别名只保留不易误伤的（如 粤/川/蜀/桂/闽/湘…），含义过宽的（如 新/宁/藏/青）不收录。
 */
export const PROVINCES: ProvinceInfo[] = [
  { code: '110000', shortCode: '11', name: '北京市', shortName: '北京', aliases: ['北京', '北京市', '京', '首都'] },
  { code: '120000', shortCode: '12', name: '天津市', shortName: '天津', aliases: ['天津', '天津市', '津', '津门'] },
  { code: '130000', shortCode: '13', name: '河北省', shortName: '河北', aliases: ['河北', '河北省', '冀', '燕赵'] },
  { code: '140000', shortCode: '14', name: '山西省', shortName: '山西', aliases: ['山西', '山西省', '晋', '三晋'] },
  { code: '150000', shortCode: '15', name: '内蒙古自治区', shortName: '内蒙古', aliases: ['内蒙古', '内蒙古自治区', '内蒙'] },
  { code: '210000', shortCode: '21', name: '辽宁省', shortName: '辽宁', aliases: ['辽宁', '辽宁省', '辽', '辽沈'] },
  { code: '220000', shortCode: '22', name: '吉林省', shortName: '吉林', aliases: ['吉林', '吉林省', '吉'] },
  { code: '230000', shortCode: '23', name: '黑龙江省', shortName: '黑龙江', aliases: ['黑龙江', '黑龙江省', '龙江'] },
  { code: '310000', shortCode: '31', name: '上海市', shortName: '上海', aliases: ['上海', '上海市', '沪', '申城'] },
  { code: '320000', shortCode: '32', name: '江苏省', shortName: '江苏', aliases: ['江苏', '江苏省', '苏'] },
  { code: '330000', shortCode: '33', name: '浙江省', shortName: '浙江', aliases: ['浙江', '浙江省', '浙', '之江'] },
  { code: '340000', shortCode: '34', name: '安徽省', shortName: '安徽', aliases: ['安徽', '安徽省', '皖', '江淮'] },
  { code: '350000', shortCode: '35', name: '福建省', shortName: '福建', aliases: ['福建', '福建省', '闽', '八闽'] },
  { code: '360000', shortCode: '36', name: '江西省', shortName: '江西', aliases: ['江西', '江西省', '赣', '赣鄱'] },
  { code: '370000', shortCode: '37', name: '山东省', shortName: '山东', aliases: ['山东', '山东省', '鲁', '齐鲁'] },
  { code: '410000', shortCode: '41', name: '河南省', shortName: '河南', aliases: ['河南', '河南省', '豫', '中原'] },
  { code: '420000', shortCode: '42', name: '湖北省', shortName: '湖北', aliases: ['湖北', '湖北省', '鄂', '荆楚'] },
  { code: '430000', shortCode: '43', name: '湖南省', shortName: '湖南', aliases: ['湖南', '湖南省', '湘', '潇湘'] },
  { code: '440000', shortCode: '44', name: '广东省', shortName: '广东', aliases: ['广东', '广东省', '粤', '南粤', '岭南'] },
  { code: '450000', shortCode: '45', name: '广西壮族自治区', shortName: '广西', aliases: ['广西', '广西壮族自治区', '桂', '八桂'] },
  { code: '460000', shortCode: '46', name: '海南省', shortName: '海南', aliases: ['海南', '海南省', '琼', '椰岛'] },
  { code: '500000', shortCode: '50', name: '重庆市', shortName: '重庆', aliases: ['重庆', '重庆市', '渝', '山城'] },
  { code: '510000', shortCode: '51', name: '四川省', shortName: '四川', aliases: ['四川', '四川省', '川', '蜀', '巴蜀'] },
  { code: '520000', shortCode: '52', name: '贵州省', shortName: '贵州', aliases: ['贵州', '贵州省', '黔'] },
  { code: '530000', shortCode: '53', name: '云南省', shortName: '云南', aliases: ['云南', '云南省', '滇'] },
  { code: '540000', shortCode: '54', name: '西藏自治区', shortName: '西藏', aliases: ['西藏', '西藏自治区', '雪域高原'] },
  { code: '610000', shortCode: '61', name: '陕西省', shortName: '陕西', aliases: ['陕西', '陕西省', '陕', '秦', '三秦'] },
  { code: '620000', shortCode: '62', name: '甘肃省', shortName: '甘肃', aliases: ['甘肃', '甘肃省', '陇'] },
  { code: '630000', shortCode: '63', name: '青海省', shortName: '青海', aliases: ['青海', '青海省'] },
  { code: '640000', shortCode: '64', name: '宁夏回族自治区', shortName: '宁夏', aliases: ['宁夏', '宁夏回族自治区'] },
  { code: '650000', shortCode: '65', name: '新疆维吾尔自治区', shortName: '新疆', aliases: ['新疆', '新疆维吾尔自治区'] },
  { code: '710000', shortCode: '71', name: '台湾省', shortName: '台湾', aliases: ['台湾', '台湾省'] },
  { code: '810000', shortCode: '81', name: '香港特别行政区', shortName: '香港', aliases: ['香港', '香港特别行政区'] },
  { code: '820000', shortCode: '82', name: '澳门特别行政区', shortName: '澳门', aliases: ['澳门', '澳门特别行政区'] },
];

const PROVINCE_BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));

/** 按 adcode 取省份静态信息（找不到返回 undefined） */
export function provinceInfo(code: string): ProvinceInfo | undefined {
  return PROVINCE_BY_CODE.get(code);
}

/** 省份展示名（优先静态表简称，如 440000 → 广东） */
export function provinceDisplayName(code: string): string {
  return PROVINCE_BY_CODE.get(code)?.shortName ?? code;
}

/** 处理方式的中文名兜底（taxonomy 缺失时使用） */
export const PREPARATION_LABELS: Record<PreparationTag, string> = {
  raw: '生食',
  undercooked: '半生 / 欠火候',
  'cured-smoked': '腌制 / 烟熏 / 风干',
  grilled: '烧烤',
  'fully-cooked': '充分加热',
  'boiled-water': '煮沸饮用水',
  'unwashed-produce': '未洗净生食蔬果',
  unknown: '处理方式未知',
};

/** 取处理方式中文名（taxonomy 优先，兜底静态表） */
export function preparationLabel(tag: PreparationTag, taxonomy?: Taxonomy): string {
  return taxonomy?.preparations.find((p) => p.id === tag)?.name ?? PREPARATION_LABELS[tag] ?? tag;
}

/* ========================================================================== */
/* 城市兜底词典                                                                */
/* ========================================================================== */

/** 内置主要城市/研究地点 → 省份（cities.json 缺失时兜底；数据层存在时以其为准） */
export const FALLBACK_CITIES: CityEntry[] = [
  { name: '成都', provinceCode: '510000', aliases: ['蓉城', '锦官城'] },
  { name: '绵阳', provinceCode: '510000' },
  { name: '重庆', provinceCode: '500000', aliases: ['山城'] },
  { name: '广州', provinceCode: '440000', aliases: ['羊城', '穗'] },
  { name: '深圳', provinceCode: '440000', aliases: ['鹏城'] },
  { name: '佛山', provinceCode: '440000', aliases: ['禅城'] },
  { name: '顺德', provinceCode: '440000' },
  { name: '东莞', provinceCode: '440000' },
  { name: '汕头', provinceCode: '440000' },
  { name: '南宁', provinceCode: '450000', aliases: ['绿城'] },
  { name: '桂林', provinceCode: '450000' },
  { name: '柳州', provinceCode: '450000' },
  { name: '扶绥', provinceCode: '450000' },
  { name: '福州', provinceCode: '350000', aliases: ['榕城'] },
  { name: '厦门', provinceCode: '350000', aliases: ['鹭岛'] },
  { name: '建宁', provinceCode: '350000' },
  { name: '昆明', provinceCode: '530000', aliases: ['春城'] },
  { name: '大理', provinceCode: '530000' },
  { name: '贵阳', provinceCode: '520000' },
  { name: '长沙', provinceCode: '430000' },
  { name: '武汉', provinceCode: '420000', aliases: ['江城'] },
  { name: '郑州', provinceCode: '410000' },
  { name: '西安', provinceCode: '610000', aliases: ['长安'] },
  { name: '兰州', provinceCode: '620000' },
  { name: '西宁', provinceCode: '630000' },
  { name: '银川', provinceCode: '640000' },
  { name: '乌鲁木齐', provinceCode: '650000' },
  { name: '拉萨', provinceCode: '540000' },
  { name: '呼和浩特', provinceCode: '150000' },
  { name: '太原', provinceCode: '140000' },
  { name: '石家庄', provinceCode: '130000' },
  { name: '沈阳', provinceCode: '210000', aliases: ['盛京'] },
  { name: '大连', provinceCode: '210000' },
  { name: '长春', provinceCode: '220000' },
  { name: '哈尔滨', provinceCode: '230000', aliases: ['冰城'] },
  { name: '南京', provinceCode: '320000', aliases: ['金陵'] },
  { name: '苏州', provinceCode: '320000', aliases: ['姑苏'] },
  { name: '无锡', provinceCode: '320000' },
  { name: '洪泽湖', provinceCode: '320000' },
  { name: '杭州', provinceCode: '330000' },
  { name: '宁波', provinceCode: '330000' },
  { name: '温州', provinceCode: '330000' },
  { name: '合肥', provinceCode: '340000' },
  { name: '南昌', provinceCode: '360000' },
  { name: '济南', provinceCode: '370000', aliases: ['泉城'] },
  { name: '青岛', provinceCode: '370000', aliases: ['岛城'] },
  { name: '北京', provinceCode: '110000' },
  { name: '天津', provinceCode: '120000' },
  { name: '上海', provinceCode: '310000' },
  { name: '海口', provinceCode: '460000', aliases: ['椰城'] },
  { name: '三亚', provinceCode: '460000' },
  { name: '崖州', provinceCode: '460000' },
  { name: '台北', provinceCode: '710000' },
  { name: '高雄', provinceCode: '710000' },
  { name: '香港', provinceCode: '810000' },
  { name: '澳门', provinceCode: '820000' },
];

let citiesCache: CityEntry[] | null = null;

/** 读取 data/geo/cities.json 并与内置城市合并（只读、失败降级，进程内缓存） */
export function loadCitiesFromData(): CityEntry[] {
  if (citiesCache) return citiesCache;
  const collected: CityEntry[] = [];
  const seen = new Set<string>();
  const push = (entry: CityEntry) => {
    if (!entry?.name || !entry.provinceCode) return;
    if (seen.has(entry.name)) return;
    seen.add(entry.name);
    collected.push(entry);
  };
  try {
    const path = join(process.cwd(), 'data', 'geo', 'cities.json');
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { items?: CityEntry[] };
      for (const item of parsed.items ?? []) push(item);
    }
  } catch {
    /* 数据缺失/损坏时静默降级到内置词典 */
  }
  for (const item of FALLBACK_CITIES) push(item);
  citiesCache = collected;
  return collected;
}

/** 测试用：清空城市缓存 */
export function resetCityCache(): void {
  citiesCache = null;
}

/**
 * 把给定城市列表与内置兜底词典合并（给定列表优先，内置补齐缺失项）。
 * 用于数据层的 cities 尚未覆盖常见地名（如研究地点）时的兜底。
 */
export function mergeFallbackCities(primary: readonly CityEntry[]): CityEntry[] {
  const merged: CityEntry[] = [];
  const seen = new Set<string>();
  const push = (entry: CityEntry) => {
    if (!entry?.name || !entry.provinceCode || seen.has(entry.name)) return;
    seen.add(entry.name);
    merged.push(entry);
  };
  for (const entry of primary) push(entry);
  for (const entry of FALLBACK_CITIES) push(entry);
  return merged;
}

/* ========================================================================== */
/* 空 taxonomy 兜底                                                            */
/* ========================================================================== */

const EMPTY_TAXONOMY: Taxonomy = {
  foodCategories: [],
  preparations: [],
  parasiteCategories: [],
  regionStatuses: [],
  evidenceLevels: [],
};

/* ========================================================================== */
/* 索引构建                                                                    */
/* ========================================================================== */

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 把知识视图规范化并建立索引。
 * 纯函数：不修改传入对象（只读取并浅拷贝数组）。
 */
export function buildIndex(knowledge: RagKnowledge): RagIndex {
  const taxonomy = knowledge.taxonomy ?? EMPTY_TAXONOMY;
  const parasites = sortByOrder(knowledge.parasites ?? []);
  const foods = sortByOrder(knowledge.foods ?? []);
  const regions = [...(knowledge.regions ?? [])].sort((a, b) => a.code.localeCompare(b.code));
  const rules = [...(knowledge.rules ?? [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const sources = knowledge.sources ?? [];
  const cities = mergeFallbackCities(knowledge.cities?.length ? knowledge.cities : loadCitiesFromData());

  const parasiteById = new Map(parasites.map((p) => [p.id, p]));
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const regionByCode = new Map(regions.map((r) => [r.code, r]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const providedChunks = knowledge.knowledgeChunks ?? [];
  const chunks = providedChunks.length > 0 ? providedChunks : buildFallbackChunks(knowledge);

  const chunkTokens = new Map<string, TextTokenSet>();
  for (const chunk of chunks) {
    chunkTokens.set(chunk.id, buildTokenSet(`${chunk.title} ${chunk.text}`));
  }

  return {
    knowledge,
    taxonomy,
    parasites,
    foods,
    regions,
    rules,
    sources,
    cities,
    chunks,
    parasiteById,
    foodById,
    regionByCode,
    sourceById,
    chunkTokens,
  };
}

/* ========================================================================== */
/* 兜底知识块构建（backend-core 的 knowledgeChunks 为空时使用）                 */
/* ========================================================================== */

const EVIDENCE_WEIGHT: Record<string, number> = { A: 1.4, B: 1.25, C: 1.0, D: 0.85 };

/**
 * 从结构化实体生成文本块。
 * 仅在 store.knowledgeChunks 为空时使用；若数据层正常提供 chunks，则直接使用其产物。
 * 每条块都带 entityId / sourceIds / 关联实体，保证可追溯。
 */
export function buildFallbackChunks(knowledge: RagKnowledge): RagChunk[] {
  const chunks: RagChunk[] = [];
  const seen = new Set<string>();
  const push = (chunk: RagChunk) => {
    if (seen.has(chunk.id)) return;
    seen.add(chunk.id);
    chunks.push(chunk);
  };
  const parasiteName = (id: string) =>
    knowledge.parasites?.find((p) => p.id === id)?.name ?? id;

  for (const p of knowledge.parasites ?? []) {
    const baseSources = uniq([...(p.transmission?.sourceIds ?? []), ...(p.distribution?.sourceIds ?? [])]);
    push({
      id: `parasite:${p.id}:summary`,
      kind: 'parasite',
      entityId: p.id,
      title: `${p.name} · 概述`,
      text: `${p.tagline ?? ''} ${p.summary ?? ''}`.trim(),
      parasiteIds: [p.id],
      foodIds: p.foodIds ?? [],
      provinceCodes: p.featuredRegionCodes ?? [],
      months: p.seasonality?.peakMonths ?? [],
      sourceIds: baseSources,
      weight: 1.2,
    });
    if (p.transmission) {
      const t = p.transmission;
      push({
        id: `parasite:${p.id}:transmission`,
        kind: 'parasite',
        entityId: p.id,
        title: `${p.name} · 传播途径`,
        text: `${t.summary} 感染阶段：${t.infectiveStage}。侵入方式：${t.entryMode}。相关载体：${(t.vehicles ?? []).join('、')}。`,
        parasiteIds: [p.id],
        foodIds: p.foodIds ?? [],
        provinceCodes: [],
        months: [],
        sourceIds: t.sourceIds ?? [],
        weight: 1.15,
      });
    }
    for (const s of p.riskScenarios ?? []) {
      push({
        id: `parasite:${p.id}:scenario:${s.id}`,
        kind: 'rule',
        entityId: p.id,
        title: s.title,
        text: `${s.explanation}${s.examples?.length ? ` 相关吃法：${s.examples.join('、')}。` : ''}`,
        parasiteIds: [p.id],
        foodIds: s.foodIds ?? [],
        provinceCodes: [],
        months: [],
        sourceIds: s.sourceIds ?? [],
        weight: 1.35,
      });
    }
    for (const c of p.consequences ?? []) {
      push({
        id: `parasite:${p.id}:consequence:${c.id}`,
        kind: 'consequence',
        entityId: p.id,
        title: c.title,
        text: `${c.description}${c.onset ? ` 潜伏期/起病时间：${c.onset}。` : ''}`,
        parasiteIds: [p.id],
        foodIds: [],
        provinceCodes: [],
        months: [],
        sourceIds: c.sourceIds ?? [],
        weight: 1.1,
      });
    }
    for (const [index, m] of (p.prevention ?? []).entries()) {
      push({
        id: `parasite:${p.id}:prevention:${index}`,
        kind: 'prevention',
        entityId: p.id,
        title: m.title,
        text: `${m.title}：${m.detail}`,
        parasiteIds: [p.id],
        foodIds: [],
        provinceCodes: [],
        months: [],
        sourceIds: m.sourceIds ?? p.transmission?.sourceIds ?? [],
        weight: 1,
      });
    }
    for (const [index, m] of (p.postExposure ?? []).entries()) {
      push({
        id: `parasite:${p.id}:post:${index}`,
        kind: 'post-exposure',
        entityId: p.id,
        title: m.title,
        text: `${m.title}：${m.detail}`,
        parasiteIds: [p.id],
        foodIds: [],
        provinceCodes: [],
        months: [],
        sourceIds: m.sourceIds ?? [],
        weight: 1,
      });
    }
    if (p.treatment) {
      push({
        id: `parasite:${p.id}:treatment`,
        kind: 'post-exposure',
        entityId: p.id,
        title: `${p.name} · 治疗与就医`,
        text: `${p.treatment.summary} ${p.treatment.note}`,
        parasiteIds: [p.id],
        foodIds: [],
        provinceCodes: [],
        months: [],
        sourceIds: p.treatment.sourceIds ?? [],
        weight: 0.95,
      });
    }
    if (p.seasonality) {
      push({
        id: `parasite:${p.id}:season`,
        kind: 'season',
        entityId: p.id,
        title: `${p.name} · 季节特征`,
        text: `${p.seasonality.pattern}。${p.seasonality.evidenceNote}${p.seasonality.contextNote ? ` 饮食情境提示：${p.seasonality.contextNote}` : ''}`,
        parasiteIds: [p.id],
        foodIds: [],
        provinceCodes: [],
        months: p.seasonality.peakMonths ?? [],
        sourceIds: p.seasonality.sourceIds ?? [],
        weight: 1.05,
      });
    }
    if (p.distribution) {
      const stats = (p.distribution.stats ?? [])
        .map((s) => `${s.label}：${s.value}${s.note ? `（${s.note}）` : ''}`)
        .join('；');
      push({
        id: `parasite:${p.id}:distribution`,
        kind: 'parasite',
        entityId: p.id,
        title: `${p.name} · 全国分布`,
        text: `${p.distribution.summary}${stats ? ` 关键数据：${stats}。` : ''}`,
        parasiteIds: [p.id],
        foodIds: [],
        provinceCodes: [],
        months: [],
        sourceIds: p.distribution.sourceIds ?? [],
        weight: 1.05,
      });
    }
  }

  for (const f of knowledge.foods ?? []) {
    push({
      id: `food:${f.id}:summary`,
      kind: 'food',
      entityId: f.id,
      title: `${f.name} · 概述`,
      text: `${f.tagline ?? ''} ${f.summary ?? ''}`.trim(),
      parasiteIds: f.parasiteIds ?? [],
      foodIds: [f.id],
      provinceCodes: [],
      months: [],
      sourceIds: f.sourceIds ?? [],
      weight: 1.15,
    });
    for (const prep of f.preparations ?? []) {
      push({
        id: `food:${f.id}:prep:${prep.tag}`,
        kind: 'rule',
        entityId: f.id,
        title: `${f.name} · ${prep.label}`,
        text: `${prep.explanation}${prep.saferAlternative ? ` 更安全的替代做法：${prep.saferAlternative}` : ''}`,
        parasiteIds: prep.parasiteIds ?? [],
        foodIds: [f.id],
        provinceCodes: [],
        months: [],
        sourceIds: prep.sourceIds ?? [],
        weight: 1.3,
      });
    }
    for (const dish of f.exampleDishes ?? []) {
      push({
        id: `food:${f.id}:dish:${dish.name}`,
        kind: 'rule',
        entityId: f.id,
        title: dish.name,
        text: `${dish.context ? `${dish.context}。` : ''}${dish.riskNote}`,
        parasiteIds: dish.parasiteIds ?? [],
        foodIds: [f.id],
        provinceCodes: [],
        months: [],
        sourceIds: dish.sourceIds ?? f.sourceIds ?? [],
        weight: 1.15,
      });
    }
    for (const [index, tip] of (f.tips ?? []).entries()) {
      push({
        id: `food:${f.id}:tip:${index}`,
        kind: 'prevention',
        entityId: f.id,
        title: tip.title,
        text: `${tip.title}：${tip.detail}`,
        parasiteIds: [],
        foodIds: [f.id],
        provinceCodes: [],
        months: [],
        sourceIds: tip.sourceIds ?? f.sourceIds ?? [],
        weight: 0.95,
      });
    }
    if (f.seasonNote) {
      push({
        id: `food:${f.id}:season`,
        kind: 'season',
        entityId: f.id,
        title: `${f.name} · 季节与饮食情境`,
        text: f.seasonNote,
        parasiteIds: f.parasiteIds ?? [],
        foodIds: [f.id],
        provinceCodes: [],
        months: [],
        sourceIds: f.sourceIds ?? [],
        weight: 0.95,
      });
    }
  }

  for (const r of knowledge.regions ?? []) {
    push({
      id: `region:${r.code}:intro`,
      kind: 'region',
      entityId: r.code,
      title: `${r.name} · 概述`,
      text: `${r.intro}${r.foodCulture?.length ? ` 饮食特点：${r.foodCulture.join('；')}。` : ''}`,
      parasiteIds: uniq(r.entries?.flatMap((e) => e.parasiteIds ?? []) ?? []),
      foodIds: uniq(r.entries?.flatMap((e) => e.foodIds ?? []) ?? []),
      provinceCodes: [r.code],
      months: [],
      sourceIds: r.sourceIds ?? [],
      weight: 1,
    });
    for (const entry of r.entries ?? []) {
      const ctx = entry.studyContext;
      const ctxText = ctx
        ? ` 研究口径：${[ctx.population, ctx.sample, ctx.period, ctx.statistic, ctx.location]
            .filter(Boolean)
            .join('；')}。`
        : '';
      push({
        id: `region:${r.code}:entry:${entry.id}`,
        kind: 'region',
        entityId: r.code,
        title: `${r.name} · ${entry.headline}`,
        text: `${entry.headline}。${entry.detail}${ctxText}`,
        parasiteIds: entry.parasiteIds ?? [],
        foodIds: entry.foodIds ?? [],
        provinceCodes: [r.code],
        months: [],
        sourceIds: entry.sourceIds ?? [],
        weight: EVIDENCE_WEIGHT[entry.evidenceLevel] ?? 1,
      });
    }
    for (const note of r.seasonalNotes ?? []) {
      push({
        id: `region:${r.code}:season:${note.months.join('-')}`,
        kind: 'season',
        entityId: r.code,
        title: `${r.name} · 季节资料`,
        text: `${note.note}（${note.basis === 'infection-evidence' ? '文献季节证据' : '饮食情境提示，非流行病学结论'}）`,
        parasiteIds: note.parasiteIds ?? [],
        foodIds: [],
        provinceCodes: [r.code],
        months: note.months ?? [],
        sourceIds: note.sourceIds ?? [],
        weight: 1.05,
      });
    }
  }

  for (const rule of knowledge.rules ?? []) {
    push({
      id: `rule:${rule.id}`,
      kind: 'rule',
      entityId: rule.parasiteId,
      title: `风险组合 · ${parasiteName(rule.parasiteId)}`,
      text: `${rule.rationale}${rule.conditions?.length ? ` 附加条件：${rule.conditions.join('；')}。` : ''}`,
      parasiteIds: [rule.parasiteId],
      foodIds: rule.when?.foodIds ?? [],
      provinceCodes: rule.when?.provinceCodes ?? [],
      months: rule.when?.months ?? [],
      sourceIds: rule.sourceIds ?? [],
      weight: 1.3,
    });
  }

  return chunks;
}
