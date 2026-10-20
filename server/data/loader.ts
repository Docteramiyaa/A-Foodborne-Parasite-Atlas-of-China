/**
 * 数据加载与容错归一化。
 *
 * 职责：
 * 1. 读取 data/ 目录（寄生虫/食物/地区单文件 + 规则/来源/分类/地理数据）；
 * 2. 对每一条记录做「宽容归一化」：缺失的可选字段补默认值，非法枚举回落默认值并记 warning；
 * 3. 修剪悬空引用（食物/寄生虫/地区/来源/规则之间），保证 store 组装阶段不需要再防御 null；
 * 4. 文件缺失、JSON 损坏、空文件都只记 warning 并跳过，绝不抛错（数据目录本身不存在时才抛错）。
 *
 * 数据在并行开发期可能暂时不完整，因此这里不校验「必须 18 种寄生虫」这类规模要求。
 * 规模与完整性检查放到 server/data/validate.ts（启动日志/测试使用，只警告不阻断）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { config } from '../config.js';
import type {
  Consequence,
  EvidenceLevel,
  Food,
  FoodCategoryId,
  FoodPreparation,
  ExampleDish,
  Measure,
  Parasite,
  ParasiteCategory,
  PreparationTag,
  Region,
  RegionEvidenceEntry,
  RegionStatus,
  RiskLevel,
  RiskRule,
  RiskScenario,
  SeasonalNote,
  Seasonality,
  Severity,
  Source,
  SourceReliability,
  SourceType,
  StudySite,
  Taxonomy,
  Transmission,
} from '../../shared/types.js';

/* ========================================================================== */
/* 枚举常量（同时供路由校验、展示标签、回退 taxonomy 使用）                     */
/* ========================================================================== */

export const PARASITE_CATEGORIES = ['cestode', 'nematode', 'trematode', 'protozoan', 'arthropod', 'other'] as const;
export const FOOD_CATEGORY_IDS = [
  'livestock',
  'game',
  'offal',
  'freshwater-fish',
  'marine-fish',
  'shellfish',
  'crustacean',
  'amphibian-reptile',
  'aquatic-plant',
  'produce',
  'water',
] as const;
export const PREPARATION_TAGS = [
  'raw',
  'undercooked',
  'cured-smoked',
  'grilled',
  'fully-cooked',
  'boiled-water',
  'unwashed-produce',
  'unknown',
] as const;
export const RISK_LEVELS = ['high', 'moderate', 'low', 'contextual', 'unknown'] as const;
export const REGION_STATUSES = [
  'endemic',
  'high-burden',
  'reported',
  'national-context',
  'limited',
  'not-reported',
  'unknown',
] as const;
export const EVIDENCE_LEVELS = ['A', 'B', 'C', 'D'] as const;
export const SEVERITIES = ['mild', 'moderate', 'severe', 'life-threatening', 'variable'] as const;
export const SOURCE_TYPES = [
  'guideline',
  'surveillance',
  'study',
  'review',
  'institution',
  'encyclopedia',
  'media',
  'reference',
] as const;
export const SOURCE_RELIABILITIES = ['high', 'medium', 'reference'] as const;
export const REGION_TYPES = ['province', 'municipality', 'autonomous-region', 'sar', 'special'] as const;

export const PARASITE_CATEGORY_LABELS: Record<ParasiteCategory, string> = {
  cestode: '绦虫',
  nematode: '线虫',
  trematode: '吸虫',
  protozoan: '原虫',
  arthropod: '节肢动物',
  other: '其他',
};

export const FOOD_CATEGORY_LABELS: Record<FoodCategoryId, string> = {
  livestock: '畜肉与禽肉',
  game: '其他动物肉类',
  offal: '内脏与脏器',
  'freshwater-fish': '淡水鱼',
  'marine-fish': '海鱼与洄游鱼',
  shellfish: '螺贝类',
  crustacean: '甲壳类',
  'amphibian-reptile': '两栖与爬行动物',
  'aquatic-plant': '水生植物',
  produce: '蔬果与生食蔬菜',
  water: '饮用水与水产品生饮',
};

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

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  high: '高风险',
  moderate: '中等风险',
  low: '低风险',
  contextual: '视条件而定',
  unknown: '资料不足',
};

export const REGION_STATUS_LABELS: Record<RegionStatus, string> = {
  endemic: '地方性流行 / 高流行',
  'high-burden': '高发区 / 主要流行区',
  reported: '有省级病例或调查记载',
  'national-context': '仅有全国性资料',
  limited: '资料有限',
  'not-reported': '文献未见报道',
  unknown: '未知',
};

export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  A: 'A · 权威指南 / 国家级监测',
  B: 'B · 同行评议研究 / 系统综述',
  C: 'C · 科普 / 二手资料',
  D: 'D · 情境推断',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  guideline: '指南 / 标准',
  surveillance: '监测 / 调查报告',
  study: '同行评议研究',
  review: '综述',
  institution: '权威机构资料',
  encyclopedia: '百科',
  media: '媒体 / 科普',
  reference: '参考教材 / 工具书',
};

export const SOURCE_RELIABILITY_LABELS: Record<SourceReliability, string> = {
  high: '高可靠性',
  medium: '中等可靠性',
  reference: '参考资料',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  mild: '轻微',
  moderate: '中等',
  severe: '严重',
  'life-threatening': '可能危及生命',
  variable: '因人而异',
};

export const REGION_STATUS_RANK: Record<RegionStatus, number> = {
  endemic: 7,
  'high-burden': 6,
  reported: 5,
  'national-context': 4,
  limited: 3,
  'not-reported': 2,
  unknown: 1,
};

export const EVIDENCE_RANK: Record<EvidenceLevel, number> = { A: 4, B: 3, C: 2, D: 1 };

/* ========================================================================== */
/* 基础工具                                                                    */
/* ========================================================================== */

type Warn = (message: string) => void;

export interface ProvinceCenter {
  code: string;
  name: string;
  center: [number, number];
}

export interface CityEntry {
  name: string;
  provinceCode: string;
  aliases?: string[];
  level?: string;
}

export interface LoadedData {
  /** data/manifest.json 的 version，缺失时回退 "0.0.0" */
  version: string;
  /** data/manifest.json 的 updatedAt，缺失时为空字符串 */
  updatedAt: string;
  taxonomy: Taxonomy;
  parasites: Parasite[];
  foods: Food[];
  regions: Region[];
  rules: RiskRule[];
  sources: Source[];
  provinceCenters: ProvinceCenter[];
  cities: CityEntry[];
  /** 加载期发现的问题（已去重、与 console.warn 内容一致） */
  warnings: string[];
  /** 实际读取到的文件数（便于启动日志） */
  fileCounts: {
    parasites: number;
    foods: number;
    regions: number;
    rules: number;
    sources: number;
  };
}

export interface LoadDataOptions {
  /** 覆盖数据目录（测试用），默认 config.dataDir */
  dataDir?: string;
  /** true 时不打印 console.warn，只收集 warnings（测试用） */
  quiet?: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const strTrim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const bool = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);

const strArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const uniq = <T>(values: readonly T[]): T[] => [...new Set(values)];

const enumOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const monthArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? uniq(
        value.filter(
          (item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 12,
        ),
      )
    : [];

const validCenter = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const lng = value[0];
  const lat = value[1];
  if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
};

/** 文件在日志中的简短标识：父目录/文件名 */
const fileLabel = (file: string): string => {
  const parent = basename(dirname(file));
  const name = basename(file);
  if (parent === '.' || parent === '' || parent === basename(config.rootDir)) return name;
  return `${parent}/${name}`;
};

function createWarnCollector(quiet: boolean): { warn: Warn; warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set<string>();
  let printed = 0;
  const warn: Warn = (message) => {
    if (seen.has(message)) return;
    seen.add(message);
    warnings.push(message);
    if (quiet) return;
    if (printed < 80) {
      console.warn(`[data] ${message}`);
      printed += 1;
      if (printed === 80) console.warn('[data] 警告过多，其余警告已省略（可在 /api/meta 与启动日志查看计数）');
    }
  };
  return { warn, warnings };
}

function readJson(file: string, warn: Warn): unknown | null {
  try {
    const raw = readFileSync(file, 'utf8');
    if (!raw.trim()) {
      warn(`空文件，已跳过：${fileLabel(file)}`);
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || parsed === undefined) {
      warn(`文件内容为 null，已跳过：${fileLabel(file)}`);
      return null;
    }
    return parsed;
  } catch (error) {
    warn(`JSON 读取或解析失败，已跳过：${fileLabel(file)}（${(error as Error).message}）`);
    return null;
  }
}

function listDirFiles(dir: string, warn: Warn): string[] {
  if (!existsSync(dir)) {
    warn(`目录不存在，已跳过：${fileLabel(dir)}`);
    return [];
  }
  try {
    return readdirSync(dir)
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .sort()
      .map((file) => join(dir, file));
  } catch (error) {
    warn(`目录读取失败，已跳过：${fileLabel(dir)}（${(error as Error).message}）`);
    return [];
  }
}

/** 把单个实体文件拆成实体数组：兼容单对象 / {items:[]} / 数组三种写法 */
const unwrapEntities = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  if (Array.isArray(record.items)) return record.items;
  return [raw];
};

/* ========================================================================== */
/* 归一化：来源                                                                */
/* ========================================================================== */

function normalizeYear(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value.trim();
  return '';
}

/**
 * DOI 归一化：
 * - 接受 "10.xxxx/yyy"、"doi:10.xxxx/yyy"、"https://doi.org/10.xxxx/yyy" 等常见写法；
 * - 去掉 doi.org / doi: 前缀与末尾标点，只保留 DOI 本体；
 * - 无法识别为 DOI 时返回 undefined（不把非 DOI 字符串当成链接）。
 */
function normalizeDoi(value: unknown): string | undefined {
  let doi = strTrim(value);
  if (!doi) return undefined;
  doi = doi.replace(/^https?:\/\/(?:dx\.|www\.)?doi\.org\//i, '');
  doi = doi.replace(/^doi:\s*/i, '').trim();
  doi = doi.replace(/[.,;，；。\s]+$/g, '').trim();
  if (!doi) return undefined;
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : undefined;
}

function normalizeSource(raw: unknown, warn: Warn, index: number): Source | null {
  const record = asRecord(raw);
  const id = strTrim(record.id);
  if (!id) {
    warn(`来源第 ${index + 1} 条缺少 id，已跳过`);
    return null;
  }
  const url = strTrim(record.url);
  const doiRaw = strTrim(record.doi);
  const doi = normalizeDoi(doiRaw);
  if (doiRaw && !doi) warn(`来源 ${id} 的 doi 格式无法识别，已忽略：「${doiRaw.slice(0, 60)}」`);
  return {
    id,
    title: strTrim(record.title) || `来源 ${id}`,
    ...(strTrim(record.authors) ? { authors: strTrim(record.authors) } : {}),
    ...(strTrim(record.venue) ? { venue: strTrim(record.venue) } : {}),
    year: normalizeYear(record.year),
    type: enumOf(record.type, SOURCE_TYPES, 'reference'),
    reliability: enumOf(record.reliability, SOURCE_RELIABILITIES, 'reference'),
    ...(url ? { url } : {}),
    ...(doi ? { doi } : {}),
    ...(strTrim(record.citation) ? { citation: strTrim(record.citation) } : {}),
    ...(strTrim(record.usage) ? { usage: strTrim(record.usage) } : {}),
    ...(strArray(record.caveats).length ? { caveats: strArray(record.caveats) } : {}),
    ...(strArray(record.linkedEntityIds).length ? { linkedEntityIds: strArray(record.linkedEntityIds) } : {}),
  };
}

/* ========================================================================== */
/* 归一化：分类体系                                                            */
/* ========================================================================== */

function normalizeTaxonomyRecord(raw: unknown): Taxonomy {
  const record = asRecord(raw);
  const taxonomy = asRecord(record.taxonomy ?? record);
  const foodCategories = Array.isArray(taxonomy.foodCategories)
    ? taxonomy.foodCategories
        .map((item) => {
          const row = asRecord(item);
          const id = enumOf(row.id, FOOD_CATEGORY_IDS, '' as FoodCategoryId);
          if (!id) return null;
          return {
            id,
            name: strTrim(row.name) || FOOD_CATEGORY_LABELS[id],
            description: strTrim(row.description),
            order: num(row.order, FOOD_CATEGORY_IDS.indexOf(id) + 1),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const preparations = Array.isArray(taxonomy.preparations)
    ? taxonomy.preparations
        .map((item) => {
          const row = asRecord(item);
          const id = enumOf(row.id, PREPARATION_TAGS, '' as PreparationTag);
          if (!id) return null;
          return {
            id,
            name: strTrim(row.name) || PREPARATION_LABELS[id],
            description: strTrim(row.description),
            riskTendency: enumOf(row.riskTendency, RISK_LEVELS, 'unknown'),
            aliases: strArray(row.aliases),
            order: num(row.order, PREPARATION_TAGS.indexOf(id) + 1),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const parasiteCategories = Array.isArray(taxonomy.parasiteCategories)
    ? taxonomy.parasiteCategories
        .map((item) => {
          const row = asRecord(item);
          const id = enumOf(row.id, PARASITE_CATEGORIES, '' as ParasiteCategory);
          if (!id) return null;
          return {
            id,
            name: strTrim(row.name) || PARASITE_CATEGORY_LABELS[id],
            description: strTrim(row.description),
            order: num(row.order, PARASITE_CATEGORIES.indexOf(id) + 1),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const regionStatuses = Array.isArray(taxonomy.regionStatuses)
    ? taxonomy.regionStatuses
        .map((item) => {
          const row = asRecord(item);
          const id = enumOf(row.id, REGION_STATUSES, '' as RegionStatus);
          if (!id) return null;
          return {
            id,
            name: strTrim(row.name) || REGION_STATUS_LABELS[id],
            description: strTrim(row.description),
            tone: enumOf(row.tone, ['strong', 'medium', 'light', 'neutral', 'muted', 'unknown'] as const, 'unknown'),
            order: num(row.order, REGION_STATUSES.indexOf(id) + 1),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const evidenceLevels = Array.isArray(taxonomy.evidenceLevels)
    ? taxonomy.evidenceLevels
        .map((item) => {
          const row = asRecord(item);
          const id = enumOf(row.id, EVIDENCE_LEVELS, '' as EvidenceLevel);
          if (!id) return null;
          return {
            id,
            name: strTrim(row.name) || EVIDENCE_LEVEL_LABELS[id],
            description: strTrim(row.description),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  const byOrder = <T extends { order: number }>(a: T, b: T): number => a.order - b.order;
  foodCategories.sort(byOrder);
  preparations.sort(byOrder);
  parasiteCategories.sort(byOrder);
  regionStatuses.sort(byOrder);
  return { foodCategories, preparations, parasiteCategories, regionStatuses, evidenceLevels };
}

const REGION_STATUS_TONES: Record<RegionStatus, 'strong' | 'medium' | 'light' | 'neutral' | 'muted' | 'unknown'> = {
  endemic: 'strong',
  'high-burden': 'medium',
  reported: 'light',
  'national-context': 'neutral',
  limited: 'muted',
  'not-reported': 'unknown',
  unknown: 'unknown',
};

/** taxonomy.json 损坏或缺失时，根据实体内容生成可用的回退分类体系 */
function buildFallbackTaxonomy(parasites: Parasite[], foods: Food[]): Taxonomy {
  const foodCategories = FOOD_CATEGORY_IDS.map((id, index) => {
    const sample = foods.find((food) => food.categoryId === id);
    return {
      id,
      name: sample?.categoryLabel || FOOD_CATEGORY_LABELS[id],
      description: '',
      order: index + 1,
    };
  });
  const preparations = PREPARATION_TAGS.map((id, index) => ({
    id,
    name: PREPARATION_LABELS[id],
    description: '',
    riskTendency: 'unknown' as RiskLevel,
    aliases: [],
    order: index + 1,
  }));
  const parasiteCategories = PARASITE_CATEGORIES.map((id, index) => {
    const sample = parasites.find((parasite) => parasite.category === id);
    return {
      id,
      name: sample?.categoryLabel || PARASITE_CATEGORY_LABELS[id],
      description: '',
      order: index + 1,
    };
  });
  const regionStatuses = REGION_STATUSES.map((id, index) => ({
    id,
    name: REGION_STATUS_LABELS[id],
    description: '',
    tone: REGION_STATUS_TONES[id],
    order: index + 1,
  }));
  const evidenceLevels = EVIDENCE_LEVELS.map((id) => ({
    id,
    name: EVIDENCE_LEVEL_LABELS[id],
    description: '',
  }));
  return { foodCategories, preparations, parasiteCategories, regionStatuses, evidenceLevels };
}

/** taxonomy 存在但部分数组为空时补齐，避免前端分类筛选抽屉出现空白 */
function completeTaxonomy(taxonomy: Taxonomy, parasites: Parasite[], foods: Food[]): Taxonomy {
  const fallback = buildFallbackTaxonomy(parasites, foods);
  return {
    foodCategories: taxonomy.foodCategories.length ? taxonomy.foodCategories : fallback.foodCategories,
    preparations: taxonomy.preparations.length ? taxonomy.preparations : fallback.preparations,
    parasiteCategories: taxonomy.parasiteCategories.length
      ? taxonomy.parasiteCategories
      : fallback.parasiteCategories,
    regionStatuses: taxonomy.regionStatuses.length ? taxonomy.regionStatuses : fallback.regionStatuses,
    evidenceLevels: taxonomy.evidenceLevels.length ? taxonomy.evidenceLevels : fallback.evidenceLevels,
  };
}

/* ========================================================================== */
/* 归一化：寄生虫                                                              */
/* ========================================================================== */

function normalizeStages(value: unknown): Transmission['stages'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const name = strTrim(row.name);
      const description = strTrim(row.description);
      if (!name && !description) return null;
      return { name: name || '未命名阶段', host: strTrim(row.host), description };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeRiskScenarios(value: unknown): RiskScenario[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = asRecord(item);
      const title = strTrim(row.title);
      const explanation = strTrim(row.explanation);
      if (!title && !explanation) return null;
      const examples = strArray(row.examples);
      return {
        id: strTrim(row.id) || `scenario-${index + 1}`,
        title: title || explanation.slice(0, 24),
        foodIds: strArray(row.foodIds),
        preparationTags: uniq(
          (Array.isArray(row.preparationTags) ? row.preparationTags : []).filter(
            (tag): tag is PreparationTag =>
              typeof tag === 'string' && (PREPARATION_TAGS as readonly string[]).includes(tag),
          ),
        ),
        ...(examples.length ? { examples } : {}),
        riskLevel: enumOf(row.riskLevel, RISK_LEVELS, 'unknown'),
        explanation,
        sourceIds: strArray(row.sourceIds),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeConsequences(value: unknown): Consequence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = asRecord(item);
      const title = strTrim(row.title);
      const description = strTrim(row.description);
      if (!title && !description) return null;
      const onset = strTrim(row.onset);
      return {
        id: strTrim(row.id) || `consequence-${index + 1}`,
        title: title || description.slice(0, 24),
        description,
        severity: enumOf(row.severity, SEVERITIES, 'variable'),
        ...(onset ? { onset } : {}),
        sourceIds: strArray(row.sourceIds),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeMeasures(value: unknown): Measure[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const title = strTrim(row.title);
      const detail = strTrim(row.detail);
      if (!title && !detail) return null;
      const sourceIds = strArray(row.sourceIds);
      return {
        title: title || detail.slice(0, 20),
        detail,
        ...(typeof row.key === 'boolean' ? { key: row.key } : {}),
        ...(sourceIds.length ? { sourceIds } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeSeasonality(value: unknown): Seasonality {
  const row = asRecord(value);
  const contextNote = strTrim(row.contextNote);
  return {
    peakMonths: monthArray(row.peakMonths),
    pattern: strTrim(row.pattern),
    evidenceNote: strTrim(row.evidenceNote),
    ...(contextNote ? { contextNote } : {}),
    sourceIds: strArray(row.sourceIds),
  };
}

function normalizeParasite(raw: unknown, warn: Warn, file: string, fallbackId: string): Parasite | null {
  const row = asRecord(raw);
  const explicitId = strTrim(row.id);
  const name = strTrim(row.name);
  if (!explicitId && !name) {
    warn(`寄生虫文件缺少 id/name，已跳过：${fileLabel(file)}`);
    return null;
  }
  const id = explicitId || fallbackId;
  if (!id) {
    warn(`寄生虫文件无法确定 id，已跳过：${fileLabel(file)}`);
    return null;
  }
  const safeName = name || id;
  const category = enumOf(row.category, PARASITE_CATEGORIES, 'other');
  if (row.category !== category) warn(`寄生虫 ${id} 的 category 非法（${String(row.category)}），已回退为 other`);

  const transmissionRaw = asRecord(row.transmission);
  const hostsRaw = asRecord(transmissionRaw.hosts);
  const treatmentRaw = asRecord(row.treatment);
  const distributionRaw = asRecord(row.distribution);
  const evidenceRaw = asRecord(row.evidence);

  const transmission: Transmission = {
    summary: strTrim(transmissionRaw.summary),
    infectiveStage: strTrim(transmissionRaw.infectiveStage),
    entryMode: strTrim(transmissionRaw.entryMode),
    vehicles: strArray(transmissionRaw.vehicles),
    stages: normalizeStages(transmissionRaw.stages),
    hosts: {
      definitive: strArray(hostsRaw.definitive),
      intermediate: strArray(hostsRaw.intermediate),
      ...(strArray(hostsRaw.paratenic).length ? { paratenic: strArray(hostsRaw.paratenic) } : {}),
      ...(strArray(hostsRaw.accidental).length ? { accidental: strArray(hostsRaw.accidental) } : {}),
    },
    sourceIds: strArray(transmissionRaw.sourceIds),
  };

  const stats = Array.isArray(distributionRaw.stats)
    ? distributionRaw.stats
        .map((item) => {
          const stat = asRecord(item);
          const label = strTrim(stat.label);
          const value = strTrim(stat.value);
          if (!label && !value) return null;
          const note = strTrim(stat.note);
          return {
            label: label || value,
            value: value || label,
            ...(note ? { note } : {}),
            sourceIds: strArray(stat.sourceIds),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  const externalLinks = Array.isArray(row.externalLinks)
    ? row.externalLinks
        .map((item) => {
          const link = asRecord(item);
          const label = strTrim(link.label);
          const url = strTrim(link.url);
          return label && url ? { label, url } : null;
        })
        .filter((item): item is { label: string; url: string } => item !== null)
    : [];

  const featuredRegionCodes = strArray(row.featuredRegionCodes);

  const parasite: Parasite = {
    id,
    name: safeName,
    latinName: strTrim(row.latinName),
    aliases: uniq(strArray(row.aliases)),
    category,
    categoryLabel: strTrim(row.categoryLabel) || PARASITE_CATEGORY_LABELS[category],
    tagline: strTrim(row.tagline),
    summary: strTrim(row.summary),
    foodIds: uniq(strArray(row.foodIds)),
    foodCategoryIds: uniq(
      (Array.isArray(row.foodCategoryIds) ? row.foodCategoryIds : []).filter(
        (categoryId): categoryId is FoodCategoryId =>
          typeof categoryId === 'string' && (FOOD_CATEGORY_IDS as readonly string[]).includes(categoryId),
      ),
    ),
    transmission,
    riskScenarios: normalizeRiskScenarios(row.riskScenarios),
    consequences: normalizeConsequences(row.consequences),
    prevention: normalizeMeasures(row.prevention),
    postExposure: normalizeMeasures(row.postExposure),
    treatment: {
      summary: strTrim(treatmentRaw.summary),
      ...(strArray(treatmentRaw.drugs).length ? { drugs: strArray(treatmentRaw.drugs) } : {}),
      note: strTrim(treatmentRaw.note),
      sourceIds: strArray(treatmentRaw.sourceIds),
    },
    seasonality: normalizeSeasonality(row.seasonality),
    distribution: {
      summary: strTrim(distributionRaw.summary),
      status: enumOf(distributionRaw.status, REGION_STATUSES, 'unknown'),
      ...(stats.length ? { stats } : {}),
      sourceIds: strArray(distributionRaw.sourceIds),
    },
    evidence: {
      level: enumOf(evidenceRaw.level, EVIDENCE_LEVELS, 'C'),
      basis: strTrim(evidenceRaw.basis),
      caveats: strArray(evidenceRaw.caveats),
    },
    ...(externalLinks.length ? { externalLinks } : {}),
    ...(featuredRegionCodes.length ? { featuredRegionCodes } : {}),
    featured: bool(row.featured),
    order: num(row.order, 999),
    relatedParasiteIds: uniq(strArray(row.relatedParasiteIds)),
  };
  if (!parasite.summary) warn(`寄生虫 ${id} 缺少 summary（前端将显示空简介）`);
  return parasite;
}

/* ========================================================================== */
/* 归一化：食物                                                                */
/* ========================================================================== */

function normalizePreparations(value: unknown): FoodPreparation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const tag = enumOf(row.tag, PREPARATION_TAGS, 'unknown');
      const explanation = strTrim(row.explanation);
      const label = strTrim(row.label) || PREPARATION_LABELS[tag];
      if (!label && !explanation) return null;
      const saferAlternative = strTrim(row.saferAlternative);
      return {
        tag,
        label,
        risk: enumOf(row.risk, RISK_LEVELS, 'unknown'),
        parasiteIds: uniq(strArray(row.parasiteIds)),
        explanation,
        ...(saferAlternative ? { saferAlternative } : {}),
        sourceIds: strArray(row.sourceIds),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeDishes(value: unknown): ExampleDish[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const name = strTrim(row.name);
      if (!name) return null;
      const context = strTrim(row.context);
      const sourceIds = strArray(row.sourceIds);
      return {
        name,
        ...(context ? { context } : {}),
        preparationTags: uniq(
          (Array.isArray(row.preparationTags) ? row.preparationTags : []).filter(
            (tag): tag is PreparationTag =>
              typeof tag === 'string' && (PREPARATION_TAGS as readonly string[]).includes(tag),
          ),
        ),
        riskNote: strTrim(row.riskNote),
        parasiteIds: strArray(row.parasiteIds),
        ...(sourceIds.length ? { sourceIds } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeFood(raw: unknown, warn: Warn, file: string, fallbackId: string): Food | null {
  const row = asRecord(raw);
  const explicitId = strTrim(row.id);
  const name = strTrim(row.name);
  if (!explicitId && !name) {
    warn(`食物文件缺少 id/name，已跳过：${fileLabel(file)}`);
    return null;
  }
  const id = explicitId || fallbackId;
  if (!id) {
    warn(`食物文件无法确定 id，已跳过：${fileLabel(file)}`);
    return null;
  }
  const safeName = name || id;
  const categoryId = enumOf(row.categoryId, FOOD_CATEGORY_IDS, 'other' as FoodCategoryId);
  if (!(FOOD_CATEGORY_IDS as readonly string[]).includes(String(row.categoryId ?? ''))) {
    warn(`食物 ${id} 的 categoryId 非法（${String(row.categoryId)}），已回退为 livestock`);
  }
  const safeCategoryId = (FOOD_CATEGORY_IDS as readonly string[]).includes(String(row.categoryId ?? ''))
    ? categoryId
    : 'livestock';
  return {
    id,
    name: safeName,
    aliases: uniq(strArray(row.aliases)),
    categoryId: safeCategoryId,
    categoryLabel: strTrim(row.categoryLabel) || FOOD_CATEGORY_LABELS[safeCategoryId],
    tagline: strTrim(row.tagline),
    summary: strTrim(row.summary),
    exampleDishes: normalizeDishes(row.exampleDishes),
    preparations: normalizePreparations(row.preparations),
    parasiteIds: uniq(strArray(row.parasiteIds)),
    tips: normalizeMeasures(row.tips),
    seasonNote: strTrim(row.seasonNote),
    sourceIds: strArray(row.sourceIds),
    featured: bool(row.featured),
    order: num(row.order, 999),
  };
}

/* ========================================================================== */
/* 归一化：地区                                                                */
/* ========================================================================== */

function normalizeStudyContext(value: unknown): RegionEvidenceEntry['studyContext'] | undefined {
  const row = asRecord(value);
  const context: NonNullable<RegionEvidenceEntry['studyContext']> = {};
  const population = strTrim(row.population);
  const sample = strTrim(row.sample);
  const period = strTrim(row.period);
  const statistic = strTrim(row.statistic);
  const location = strTrim(row.location);
  if (population) context.population = population;
  if (sample) context.sample = sample;
  if (period) context.period = period;
  if (statistic) context.statistic = statistic;
  if (location) context.location = location;
  return Object.keys(context).length ? context : undefined;
}

function normalizeEntries(value: unknown, code: string): RegionEvidenceEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = asRecord(item);
      const headline = strTrim(row.headline);
      const detail = strTrim(row.detail);
      if (!headline && !detail) return null;
      const studyContext = normalizeStudyContext(row.studyContext);
      return {
        id: strTrim(row.id) || `${code}-entry-${index + 1}`,
        parasiteIds: strArray(row.parasiteIds),
        ...(strArray(row.foodIds).length ? { foodIds: strArray(row.foodIds) } : {}),
        status: enumOf(row.status, REGION_STATUSES, 'unknown'),
        headline: headline || detail.slice(0, 26),
        detail,
        ...(studyContext ? { studyContext } : {}),
        evidenceLevel: enumOf(row.evidenceLevel, EVIDENCE_LEVELS, 'C'),
        sourceIds: strArray(row.sourceIds),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeStudySites(value: unknown, code: string): StudySite[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = asRecord(item);
      const name = strTrim(row.name);
      if (!name) return null;
      const geo = validCenter(row.geo) ?? undefined;
      return {
        id: strTrim(row.id) || `${code}-site-${index + 1}`,
        name,
        ...(geo ? { geo } : {}),
        provinceCode: strTrim(row.provinceCode) || code,
        parasiteIds: strArray(row.parasiteIds),
        note: strTrim(row.note),
        sourceIds: strArray(row.sourceIds),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeSeasonalNotes(value: unknown): SeasonalNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const note = strTrim(row.note);
      if (!note) return null;
      return {
        months: monthArray(row.months),
        note,
        parasiteIds: strArray(row.parasiteIds),
        basis: enumOf(row.basis, ['infection-evidence', 'dietary-context'] as const, 'dietary-context'),
        sourceIds: strArray(row.sourceIds),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function bestRegionStatus(entries: RegionEvidenceEntry[]): RegionStatus {
  let best: RegionStatus = 'unknown';
  for (const entry of entries) {
    if (REGION_STATUS_RANK[entry.status] > REGION_STATUS_RANK[best]) best = entry.status;
  }
  return best;
}

function normalizeRegion(
  raw: unknown,
  warn: Warn,
  file: string,
  fallbackCode: string,
  centerByCode: Map<string, ProvinceCenter>,
): Region | null {
  const row = asRecord(raw);
  const explicitCode = strTrim(row.code) || strTrim(row.adcode);
  const explicitName = strTrim(row.name);
  if (!explicitCode && !explicitName) {
    warn(`地区文件缺少 code/name，已跳过：${fileLabel(file)}`);
    return null;
  }
  const code = explicitCode || fallbackCode;
  if (!code) {
    warn(`地区文件无法确定 code，已跳过：${fileLabel(file)}`);
    return null;
  }
  const name = explicitName || centerByCode.get(code)?.name || code;
  const entries = normalizeEntries(row.entries, code);
  const evidenceStatusRaw = enumOf(row.status ?? row.evidenceStatus, REGION_STATUSES, 'unknown' as RegionStatus);
  const evidenceStatus =
    evidenceStatusRaw !== 'unknown' || !entries.length ? evidenceStatusRaw : bestRegionStatus(entries);
  const centerRaw = validCenter(row.center);
  const center = centerRaw ?? centerByCode.get(code)?.center ?? [104, 35];
  if (!centerRaw && !centerByCode.get(code)) {
    warn(`地区 ${code} 缺少有效 center，已回退到全国中心点 [104, 35]，邻近省份计算可能不准确`);
  }
  const type = enumOf(row.type, REGION_TYPES, 'province');
  const shortCode = strTrim(row.shortCode) || code.slice(0, 2);
  return {
    code,
    shortCode,
    name,
    shortName: strTrim(row.shortName) || name,
    aliases: uniq(strArray(row.aliases)),
    type,
    center,
    tagline: strTrim(row.tagline),
    intro: strTrim(row.intro),
    foodCulture: strArray(row.foodCulture),
    evidenceStatus,
    evidenceSummary: strTrim(row.evidenceSummary),
    entries,
    studySites: normalizeStudySites(row.studySites, code),
    seasonalNotes: normalizeSeasonalNotes(row.seasonalNotes),
    sourceIds: strArray(row.sourceIds),
  };
}

/* ========================================================================== */
/* 归一化：风险规则                                                            */
/* ========================================================================== */

function normalizeRiskRules(raw: unknown): RiskRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = asRecord(item);
      const condition = asRecord(row.when);
      const parasiteId = strTrim(row.parasiteId);
      if (!parasiteId) return null;
      const when: RiskRule['when'] = {};
      const foodIds = strArray(condition.foodIds);
      if (foodIds.length) when.foodIds = foodIds;
      const foodCategoryIds = (Array.isArray(condition.foodCategoryIds) ? condition.foodCategoryIds : []).filter(
        (id): id is FoodCategoryId => typeof id === 'string' && (FOOD_CATEGORY_IDS as readonly string[]).includes(id),
      );
      if (foodCategoryIds.length) when.foodCategoryIds = uniq(foodCategoryIds);
      const preparationTags = (Array.isArray(condition.preparationTags) ? condition.preparationTags : []).filter(
        (tag): tag is PreparationTag =>
          typeof tag === 'string' && (PREPARATION_TAGS as readonly string[]).includes(tag),
      );
      if (preparationTags.length) when.preparationTags = uniq(preparationTags);
      const provinceCodes = strArray(condition.provinceCodes);
      if (provinceCodes.length) when.provinceCodes = provinceCodes;
      const months = monthArray(condition.months);
      if (months.length) when.months = months;
      const conditions = strArray(row.conditions);
      return {
        id: strTrim(row.id) || `rule-${index + 1}`,
        parasiteId,
        when,
        riskLevel: enumOf(row.riskLevel, RISK_LEVELS, 'unknown'),
        rationale: strTrim(row.rationale),
        ...(conditions.length ? { conditions } : {}),
        sourceIds: strArray(row.sourceIds),
        priority: num(row.priority, 0),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/* ========================================================================== */
/* 引用完整性：修剪悬空引用（只警告，不抛错）                                   */
/* ========================================================================== */

/** 收集实体树中所有 sourceIds（summary.ts 聚合 source.citedBy 时使用） */
export function collectSourceIdsDeep(node: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) collectSourceIdsDeep(item, out);
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'sourceIds' && Array.isArray(value)) {
      for (const id of value) if (typeof id === 'string') out.add(id);
      continue;
    }
    collectSourceIdsDeep(value, out);
  }
  return out;
}

function pruneSourceIdsDeep(node: unknown, valid: ReadonlySet<string>): number {
  let removed = 0;
  if (Array.isArray(node)) {
    for (const item of node) removed += pruneSourceIdsDeep(item, valid);
    return removed;
  }
  if (node === null || typeof node !== 'object') return removed;
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'sourceIds' && Array.isArray(value)) {
      const kept = value.filter((id): id is string => typeof id === 'string' && valid.has(id));
      removed += value.length - kept.length;
      record[key] = kept;
      continue;
    }
    removed += pruneSourceIdsDeep(value, valid);
  }
  return removed;
}

function dedupeById<T>(items: T[], getId: (item: T) => string, label: string, warn: Warn): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = getId(item);
    if (!id) {
      warn(`${label}存在缺少 id 的条目，已跳过`);
      continue;
    }
    if (seen.has(id)) {
      warn(`${label}存在重复 id：${id}，已跳过后出现的条目`);
      continue;
    }
    seen.add(id);
    out.push(item);
  }
  return out;
}

/* ========================================================================== */
/* 主流程                                                                      */
/* ========================================================================== */

export function loadData(options: LoadDataOptions = {}): LoadedData {
  const dataDir = options.dataDir ?? config.dataDir;
  if (!existsSync(dataDir)) {
    throw new Error(`数据目录不存在：${dataDir}（无法启动知识库；请确认 data/ 完整）`);
  }
  const { warn, warnings } = createWarnCollector(Boolean(options.quiet));

  /* ---- manifest ---- */
  const manifestRaw = readJson(join(dataDir, 'manifest.json'), warn);
  const manifest = asRecord(manifestRaw);
  const version = strTrim(manifest.version) || '0.0.0';
  const updatedAt = strTrim(manifest.updatedAt);

  /* ---- geo：省级中心点、城市词典（先读，地区 center 缺失时回退） ---- */
  const centersRaw = readJson(join(dataDir, 'geo', 'province-centers.json'), warn);
  const centerListRaw = Array.isArray(asRecord(centersRaw).items)
    ? (asRecord(centersRaw).items as unknown[])
    : unwrapEntities(centersRaw ?? []);
  const provinceCenters: ProvinceCenter[] = [];
  for (const item of centerListRaw) {
    const row = asRecord(item);
    const code = strTrim(row.code) || strTrim(row.adcode);
    const center = validCenter(row.center);
    if (!code || !center) {
      warn(`省级中心点数据格式异常，已跳过：${JSON.stringify(item).slice(0, 80)}`);
      continue;
    }
    provinceCenters.push({ code, name: strTrim(row.name) || code, center });
  }
  const centerByCode = new Map(provinceCenters.map((center) => [center.code, center]));

  let citiesRaw: unknown = null;
  const citiesPath = join(dataDir, 'geo', 'cities.json');
  const legacyCitiesPath = join(dataDir, 'geography', 'cities.json');
  if (existsSync(citiesPath)) {
    citiesRaw = readJson(citiesPath, warn);
  } else if (existsSync(legacyCitiesPath)) {
    citiesRaw = readJson(legacyCitiesPath, warn);
  } else {
    warn('data/geo/cities.json 尚未生成：省级名称解析暂只支持省名/简称/别名，城市名待数据补齐');
  }
  const cities: CityEntry[] = [];
  const cityItems: unknown[] = Array.isArray(citiesRaw)
    ? citiesRaw
    : Array.isArray(asRecord(citiesRaw).items)
      ? (asRecord(citiesRaw).items as unknown[])
      : [];
  for (const item of cityItems) {
    const row = asRecord(item);
    const name = strTrim(row.name);
    const provinceCode = strTrim(row.provinceCode);
    if (!name || !provinceCode) {
      warn(`城市条目缺少 name/provinceCode，已跳过：${JSON.stringify(item).slice(0, 80)}`);
      continue;
    }
    const aliases = strArray(row.aliases);
    const level = strTrim(row.level);
    cities.push({ name, provinceCode, ...(aliases.length ? { aliases } : {}), ...(level ? { level } : {}) });
  }

  /* ---- 来源 ---- */
  const sourcesRawFile = readJson(join(dataDir, 'sources.json'), warn);
  const sourcesRaw = Array.isArray(asRecord(sourcesRawFile).items)
    ? (asRecord(sourcesRawFile).items as unknown[])
    : unwrapEntities(sourcesRawFile ?? []);
  const sources = dedupeById(
    sourcesRaw.map((item, index) => normalizeSource(item, warn, index)).filter((s): s is Source => s !== null),
    (source) => source.id,
    '来源',
    warn,
  );
  const sourceIdSet = new Set(sources.map((source) => source.id));

  /* ---- 分类体系（先归一化，规则校验要用；实体加载后再补全回退） ---- */
  const taxonomyRawFile = readJson(join(dataDir, 'taxonomy.json'), warn);
  const taxonomyLoaded = taxonomyRawFile !== null;
  let taxonomy = taxonomyLoaded ? normalizeTaxonomyRecord(taxonomyRawFile) : ({} as Taxonomy);
  const allowedPrepTags: ReadonlySet<string> = new Set(
    taxonomyLoaded && taxonomy.preparations.length
      ? taxonomy.preparations.map((item) => item.id)
      : PREPARATION_TAGS,
  );
  const allowedFoodCategories: ReadonlySet<string> = new Set(
    taxonomyLoaded && taxonomy.foodCategories.length
      ? taxonomy.foodCategories.map((item) => item.id)
      : FOOD_CATEGORY_IDS,
  );

  /* ---- 寄生虫 ---- */
  const parasiteFiles = listDirFiles(join(dataDir, 'parasites'), warn);
  const parasitesRaw: Parasite[] = [];
  for (const file of parasiteFiles) {
    const raw = readJson(file, warn);
    if (raw === null) continue;
    for (const entity of unwrapEntities(raw)) {
      const parasite = normalizeParasite(entity, warn, file, basename(file, '.json'));
      if (parasite) parasitesRaw.push(parasite);
    }
  }
  const parasiteById0 = new Map<string, Parasite>();
  const parasites = dedupeById(parasitesRaw, (parasite) => parasite.id, '寄生虫', warn);
  for (const parasite of parasites) parasiteById0.set(parasite.id, parasite);

  /* ---- 食物 ---- */
  const foodFiles = listDirFiles(join(dataDir, 'foods'), warn);
  const foodsRaw: Food[] = [];
  for (const file of foodFiles) {
    const raw = readJson(file, warn);
    if (raw === null) continue;
    for (const entity of unwrapEntities(raw)) {
      const food = normalizeFood(entity, warn, file, basename(file, '.json'));
      if (food) foodsRaw.push(food);
    }
  }
  const foods = dedupeById(foodsRaw, (food) => food.id, '食物', warn);
  const foodById0 = new Map<string, Food>();
  for (const food of foods) foodById0.set(food.id, food);

  /* ---- 地区 ---- */
  const regionFiles = listDirFiles(join(dataDir, 'regions'), warn);
  const regionsRaw: Region[] = [];
  for (const file of regionFiles) {
    const raw = readJson(file, warn);
    if (raw === null) continue;
    for (const entity of unwrapEntities(raw)) {
      const region = normalizeRegion(entity, warn, file, basename(file, '.json'), centerByCode);
      if (region) regionsRaw.push(region);
    }
  }
  const regions = dedupeById(regionsRaw, (region) => region.code, '地区', warn);
  const regionByCode0 = new Map<string, Region>();
  for (const region of regions) regionByCode0.set(region.code, region);

  /* ---- 风险规则 ---- */
  const rulesFile = readJson(join(dataDir, 'risk-rules.json'), warn);
  const rulesRaw = Array.isArray(asRecord(rulesFile).items)
    ? (asRecord(rulesFile).items as unknown[])
    : unwrapEntities(rulesFile ?? []);
  const parsedRules = normalizeRiskRules(rulesRaw);

  /* ==================================================================== */
  /* 修剪悬空引用                                                          */
  /* ==================================================================== */

  // 来源引用（所有实体树内递归处理）
  const pruneSources = (entity: unknown, label: string): void => {
    if (!sourceIdSet.size) {
      // 来源文件完全缺失时：保留原 sourceIds（避免把「数据未加载」误当成「没有来源」），只警告一次
      return;
    }
    const removed = pruneSourceIdsDeep(entity, sourceIdSet);
    if (removed > 0) warn(`${label} 引用了 ${removed} 个不存在的 sourceId，已移除这些引用`);
  };
  if (!sources.length && (parasites.length || foods.length || regions.length)) {
    warn('来源数据为空：实体 sourceIds 暂不修剪，前端将无法展示来源详情（等待 data/sources.json 修复）');
  }

  // 寄生虫
  for (const parasite of parasites) {
    const before = {
      foods: parasite.foodIds.length,
      related: parasite.relatedParasiteIds.length,
      categories: parasite.foodCategoryIds.length,
    };
    parasite.foodIds = uniq(parasite.foodIds.filter((id) => foodById0.has(id)));
    parasite.foodCategoryIds = uniq(parasite.foodCategoryIds.filter((id) => allowedFoodCategories.has(id)));
    parasite.relatedParasiteIds = uniq(
      parasite.relatedParasiteIds.filter((id) => parasiteById0.has(id) && id !== parasite.id),
    );
    if (parasite.featuredRegionCodes) {
      parasite.featuredRegionCodes = uniq(parasite.featuredRegionCodes.filter((code) => regionByCode0.has(code)));
      if (!parasite.featuredRegionCodes.length) delete parasite.featuredRegionCodes;
    }
    for (const scenario of parasite.riskScenarios) {
      scenario.foodIds = scenario.foodIds.filter((id) => foodById0.has(id) || !foodById0.size);
      scenario.preparationTags = scenario.preparationTags.filter((tag) => allowedPrepTags.has(tag));
    }
    // 双向一致性：食物存在但未反向引用时补上（数据仍在并行编写，补链接比丢链接更有用）
    for (const foodId of parasite.foodIds) {
      const food = foodById0.get(foodId);
      if (food && !food.parasiteIds.includes(parasite.id)) {
        food.parasiteIds = uniq([...food.parasiteIds, parasite.id]);
        warn(`关系补全：${parasite.id}.foodIds 含 ${foodId}，但 ${foodId}.parasiteIds 未含该寄生虫，已补链接`);
      }
    }
    if (
      before.foods !== parasite.foodIds.length ||
      before.related !== parasite.relatedParasiteIds.length ||
      before.categories !== parasite.foodCategoryIds.length
    ) {
      warn(`寄生虫 ${parasite.id} 的引用已修剪（foodIds/relatedParasiteIds/foodCategoryIds 存在悬空引用）`);
    }
    pruneSources(parasite, `寄生虫 ${parasite.id}`);
  }

  // 食物
  for (const food of foods) {
    const beforeParasites = food.parasiteIds.length;
    food.parasiteIds = uniq(food.parasiteIds.filter((id) => parasiteById0.has(id)));
    if (food.parasiteIds.length !== beforeParasites) {
      warn(`食物 ${food.id} 引用了不存在的寄生虫，已移除 ${beforeParasites - food.parasiteIds.length} 个悬空引用`);
    }
    for (const preparation of food.preparations) {
      const filtered = uniq(preparation.parasiteIds.filter((id) => parasiteById0.has(id)));
      if (filtered.length !== preparation.parasiteIds.length) {
        warn(`食物 ${food.id} 的处理方式 ${preparation.tag} 含悬空寄生虫引用，已修剪`);
        preparation.parasiteIds = filtered;
      }
      if (!allowedPrepTags.has(preparation.tag)) {
        warn(`食物 ${food.id} 含未知处理方式标签 ${preparation.tag}`);
      }
    }
    for (const dish of food.exampleDishes) {
      dish.parasiteIds = uniq(dish.parasiteIds.filter((id) => parasiteById0.has(id)));
    }
    for (const parasiteId of food.parasiteIds) {
      const parasite = parasiteById0.get(parasiteId);
      if (parasite && !parasite.foodIds.includes(food.id)) {
        parasite.foodIds = uniq([...parasite.foodIds, food.id]);
        warn(`关系补全：${food.id}.parasiteIds 含 ${parasiteId}，但 ${parasiteId}.foodIds 未含该食物，已补链接`);
      }
    }
    pruneSources(food, `食物 ${food.id}`);
  }

  // 地区
  for (const region of regions) {
    const keptEntries: RegionEvidenceEntry[] = [];
    for (const entry of region.entries) {
      entry.parasiteIds = uniq(entry.parasiteIds.filter((id) => parasiteById0.has(id)));
      entry.foodIds = uniq((entry.foodIds ?? []).filter((id) => foodById0.has(id)));
      if (!entry.foodIds.length) delete entry.foodIds;
      if (!entry.parasiteIds.length) {
        warn(`地区 ${region.code} 的证据 ${entry.id} 引用的寄生虫均不存在，已跳过该证据`);
        continue;
      }
      keptEntries.push(entry);
    }
    region.entries = keptEntries;
    region.studySites = region.studySites.filter((site) => {
      site.parasiteIds = uniq(site.parasiteIds.filter((id) => parasiteById0.has(id)));
      if (site.provinceCode !== region.code) {
        warn(`地区 ${region.code} 的研究地点 ${site.id} 的 provinceCode=${site.provinceCode} 与地区不符，已修正`);
        site.provinceCode = region.code;
      }
      if (!site.parasiteIds.length) {
        warn(`地区 ${region.code} 的研究地点 ${site.id} 无明显寄生虫关联，已跳过`);
        return false;
      }
      return true;
    });
    region.seasonalNotes = region.seasonalNotes.filter((note) => {
      note.parasiteIds = uniq(note.parasiteIds.filter((id) => parasiteById0.has(id)));
      if (!note.parasiteIds.length) {
        warn(`地区 ${region.code} 的季节说明缺乏有效寄生虫关联，已跳过`);
        return false;
      }
      return true;
    });
    if (!(REGION_STATUSES as readonly string[]).includes(region.evidenceStatus)) {
      region.evidenceStatus = bestRegionStatus(region.entries);
    }
    pruneSources(region, `地区 ${region.code}`);
  }
  // 补全反向链接：地区证据里出现、但寄生虫 foodIds 未包含的食物（可选，帮助食物详情页聚合）

  // 规则
  const rules: RiskRule[] = [];
  for (const rule of parsedRules) {
    if (!parasiteById0.has(rule.parasiteId)) {
      warn(`风险规则 ${rule.id} 引用的寄生虫 ${rule.parasiteId} 不存在，已跳过该规则`);
      continue;
    }
    const when = rule.when;
    if (when.foodIds) {
      when.foodIds = uniq(when.foodIds.filter((id) => foodById0.has(id)));
      if (!when.foodIds.length) delete when.foodIds;
    }
    if (when.foodCategoryIds) {
      when.foodCategoryIds = uniq(when.foodCategoryIds.filter((id) => allowedFoodCategories.has(id)));
      if (!when.foodCategoryIds.length) delete when.foodCategoryIds;
    }
    if (when.preparationTags) {
      when.preparationTags = uniq(when.preparationTags.filter((tag) => allowedPrepTags.has(tag)));
      if (!when.preparationTags.length) delete when.preparationTags;
    }
    if (when.provinceCodes) {
      when.provinceCodes = uniq(when.provinceCodes.filter((code) => regionByCode0.has(code)));
      if (!when.provinceCodes.length) delete when.provinceCodes;
    }
    if (when.months) {
      when.months = monthArray(when.months);
      if (!when.months.length) delete when.months;
    }
    if (!when.foodIds?.length && !when.foodCategoryIds?.length) {
      warn(`风险规则 ${rule.id} 缺少有效的食物条件，已跳过该规则`);
      continue;
    }
    const filteredSources = rule.sourceIds.filter((id) => !sourceIdSet.size || sourceIdSet.has(id));
    if (filteredSources.length !== rule.sourceIds.length) {
      warn(`风险规则 ${rule.id} 引用了不存在的 sourceId，已修剪`);
    }
    rule.sourceIds = filteredSources;
    rules.push(rule);
  }
  const dedupedRules = dedupeById(rules, (rule) => rule.id, '风险规则', warn);

  /* ---- 分类体系补全 ---- */
  if (!taxonomyLoaded) {
    warn('taxonomy.json 缺失或不可读，已根据实体内容生成回退分类体系');
    taxonomy = buildFallbackTaxonomy(parasites, foods);
  } else {
    taxonomy = completeTaxonomy(taxonomy, parasites, foods);
  }

  /* ---- 省级中心点兜底：从地区 center 生成 ---- */
  let finalCenters = provinceCenters;
  if (!finalCenters.length && regions.length) {
    finalCenters = regions.map((region) => ({
      code: region.code,
      name: region.name,
      center: region.center,
    }));
  }

  /* ---- 排序 ---- */
  parasites.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  foods.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  regions.sort((a, b) => a.code.localeCompare(b.code));
  dedupedRules.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  sources.sort((a, b) => a.id.localeCompare(b.id));
  finalCenters.sort((a, b) => a.code.localeCompare(b.code));
  cities.sort((a, b) => a.provinceCode.localeCompare(b.provinceCode) || a.name.localeCompare(b.name));

  return {
    version,
    updatedAt,
    taxonomy,
    parasites,
    foods,
    regions,
    rules: dedupedRules,
    sources,
    provinceCenters: finalCenters,
    cities,
    warnings,
    fileCounts: {
      parasites: parasiteFiles.length,
      foods: foodFiles.length,
      regions: regionFiles.length,
      rules: dedupedRules.length,
      sources: sources.length,
    },
  };
}

export default loadData;
