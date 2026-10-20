import type {
  EvidenceLevel,
  FoodCategoryId,
  ParasiteCategory,
  PreparationTag,
  RegionStatus,
  RiskLevel,
  Severity,
} from '@shared/types';

/* ------------------------------------------------------------------ */
/* 风险等级                                                             */
/* ------------------------------------------------------------------ */

export interface RiskMeta {
  label: string;
  short: string;
  description: string;
  tone: 'danger' | 'warning' | 'safe' | 'neutral' | 'muted';
  className: string;
  dotClass: string;
  fill: string;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
  high: {
    label: '存在明确风险',
    short: '高风险',
    description: '文献明确记载这种食物和处理方式可能造成感染。',
    tone: 'danger',
    className: 'border-terracotta-300 bg-terracotta-100/80 text-terracotta-800',
    dotClass: 'bg-terracotta-600',
    fill: '#B85C3F',
  },
  moderate: {
    label: '存在一定风险',
    short: '中等风险',
    description: '存在感染风险，风险高低受来源、工艺、地区等条件影响。',
    tone: 'warning',
    className: 'border-ochre-300 bg-ochre-100 text-ochre-700',
    dotClass: 'bg-ochre-500',
    fill: '#C98A3D',
  },
  low: {
    label: '风险较低',
    short: '较低',
    description: '该处理方式能够有效降低已知寄生虫风险，仍需注意交叉污染。',
    tone: 'safe',
    className: 'border-jade-200 bg-jade-50 text-jade-800',
    dotClass: 'bg-jade-500',
    fill: '#3F8970',
  },
  contextual: {
    label: '取决于具体条件',
    short: '视条件',
    description: '风险取决于产地、来源、工艺与个人情况，无法一概而论。',
    tone: 'neutral',
    className: 'border-line bg-paper-deep/70 text-ink-soft',
    dotClass: 'bg-ink-faint',
    fill: '#9C9A86',
  },
  unknown: {
    label: '资料不足',
    short: '未知',
    description: '现有资料不足以判断，请按一般食品安全原则处理。',
    tone: 'muted',
    className: 'border-line-soft bg-paper text-ink-muted',
    dotClass: 'bg-line-strong',
    fill: '#C9C2B2',
  },
};

export function riskMeta(level: RiskLevel | undefined | null): RiskMeta {
  return RISK_META[level ?? 'unknown'] ?? RISK_META.unknown;
}

/* ------------------------------------------------------------------ */
/* 证据等级                                                             */
/* ------------------------------------------------------------------ */

export const EVIDENCE_META: Record<EvidenceLevel, { label: string; short: string; description: string; className: string }> = {
  A: {
    label: 'A 级 · 权威指南或国家级监测',
    short: 'A 级',
    description: '来自国家级指南、监测报告或权威机构（CDC、WHO 等）。',
    className: 'border-jade-700/30 bg-jade-800 text-paper',
  },
  B: {
    label: 'B 级 · 同行评议研究或系统综述',
    short: 'B 级',
    description: '来自同行评议研究、系统综述或期刊综述，需注意样本与适用范围。',
    className: 'border-jade-300 bg-jade-100 text-jade-900',
  },
  C: {
    label: 'C 级 · 科普或二手资料',
    short: 'C 级',
    description: '来自百科、健康门户或科普媒体的二手资料，需交叉核对。',
    className: 'border-ochre-300 bg-ochre-100 text-ochre-700',
  },
  D: {
    label: 'D 级 · 情境推断',
    short: 'D 级',
    description: '依据饮食情境与一般原则所作的推断，不作为流行病学结论。',
    className: 'border-line bg-paper-deep text-ink-muted',
  },
};

/* ------------------------------------------------------------------ */
/* 地区证据状态                                                         */
/* ------------------------------------------------------------------ */

export const REGION_STATUS_FALLBACK: Record<RegionStatus, { name: string; tone: RegionStatusTone; description: string }> = {
  endemic: {
    name: '地方性流行 / 高流行',
    tone: 'strong',
    description: '文献明确将该省（或省内特定地区）列为地方性流行区或高流行区。',
  },
  'high-burden': {
    name: '高发区 / 主要流行区',
    tone: 'medium',
    description: '文献将该省列入高发区、主要流行区或重点流行地区集群。',
  },
  reported: {
    name: '有省级病例或调查记载',
    tone: 'light',
    description: '文献记载该省有病例、调查或监测记录。',
  },
  'national-context': {
    name: '仅有全国性资料',
    tone: 'neutral',
    description: '现有资料只提供全国性数据，未单列该省情况。',
  },
  limited: {
    name: '资料有限',
    tone: 'muted',
    description: '本知识库尚未收录该省针对该问题的专门资料。',
  },
  'not-reported': {
    name: '文献未见报道',
    tone: 'unknown',
    description: '所引文献明确表示该省未见报道；阴性记录不等于绝对无风险。',
  },
  unknown: {
    name: '未知',
    tone: 'unknown',
    description: '现有资料无法判断。',
  },
};

export type RegionStatusTone = 'strong' | 'medium' | 'light' | 'neutral' | 'muted' | 'unknown';

export const STATUS_TONE_BADGE: Record<RegionStatusTone, string> = {
  strong: 'border-terracotta-300 bg-terracotta-600 text-paper',
  medium: 'border-ochre-400 bg-ochre-500 text-ink',
  light: 'border-jade-300 bg-jade-300 text-jade-950',
  neutral: 'border-jade-200 bg-jade-100 text-jade-800',
  muted: 'border-line bg-paper-deep text-ink-muted',
  unknown: 'border-line-soft bg-paper text-ink-muted',
};

/**
 * 地图省份填色：表达“文献证据的可追溯程度”，不表达量化风险。
 * 使用浅蓝到冷灰的色阶；深蓝留给选中，避免与普通资料填色混淆。
 */
export const MAP_STATUS_COLORS: Record<RegionStatus, string> = {
  endemic: '#99C7F6',
  'high-burden': '#AED3FA',
  reported: '#99C7F6',
  'national-context': '#C3E0FF',
  limited: '#E2EBF5',
  'not-reported': '#EAF0F7',
  unknown: '#F4F6FA',
};

/** 悬停沿用蓝色交互体系。 */
export const MAP_STATUS_HOVER: Record<RegionStatus, string> = {
  endemic: '#65A7EE',
  'high-burden': '#65A7EE',
  reported: '#99C7F6',
  'national-context': '#99C7F6',
  limited: '#C3E0FF',
  'not-reported': '#C3E0FF',
  unknown: '#C3E0FF',
};

/** 当前色阶整体偏浅；地图文字统一使用深 ink，确保可读。 */
export function isDarkMapStatus(_status: RegionStatus): boolean {
  return false;
}

export const MAP_LABEL_COLOR = '#182C46';
export const MAP_LABEL_LIGHT = '#FFFFFF';

/* ------------------------------------------------------------------ */
/* 严重程度                                                             */
/* ------------------------------------------------------------------ */

export const SEVERITY_META: Record<Severity, { label: string; className: string; rank: number }> = {
  mild: { label: '轻微', className: 'text-jade-700 bg-jade-50 border-jade-200', rank: 1 },
  moderate: { label: '中等', className: 'text-ochre-700 bg-ochre-100 border-ochre-300', rank: 2 },
  severe: { label: '严重', className: 'text-terracotta-800 bg-terracotta-100 border-terracotta-300', rank: 3 },
  'life-threatening': { label: '可能危及生命', className: 'text-paper bg-terracotta-700 border-terracotta-700', rank: 4 },
  variable: { label: '差异较大', className: 'text-ink-soft bg-paper-deep border-line', rank: 2 },
};

/* ------------------------------------------------------------------ */
/* 分类标签                                                             */
/* ------------------------------------------------------------------ */

export const PARASITE_CATEGORY_LABEL: Record<ParasiteCategory, string> = {
  trematode: '吸虫',
  cestode: '绦虫',
  nematode: '线虫',
  protozoan: '原虫',
  arthropod: '其他',
  other: '其他',
};

export const PARASITE_CATEGORY_DOT: Record<ParasiteCategory, string> = {
  trematode: 'bg-jade-500',
  cestode: 'bg-ochre-500',
  nematode: 'bg-terracotta-500',
  protozoan: 'bg-ink-faint',
  arthropod: 'bg-jade-700',
  other: 'bg-ink-faint',
};

export const FOOD_CATEGORY_LABEL: Record<FoodCategoryId, string> = {
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
  water: '饮用水',
};

/* ------------------------------------------------------------------ */
/* 月份与季节                                                           */
/* ------------------------------------------------------------------ */

export const MONTH_LABELS = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];

export const SEASONS = [
  { id: 'spring', label: '春季', months: [3, 4, 5], en: 'SPRING' },
  { id: 'summer', label: '夏季', months: [6, 7, 8], en: 'SUMMER' },
  { id: 'autumn', label: '秋季', months: [9, 10, 11], en: 'AUTUMN' },
  { id: 'winter', label: '冬季', months: [12, 1, 2], en: 'WINTER' },
] as const;

export function seasonOfMonth(month: number): (typeof SEASONS)[number] {
  return SEASONS.find((s) => (s.months as readonly number[]).includes(month)) ?? SEASONS[0];
}

/** 例如 [1,2,12] → “1、2、12 月”；[9,10,11] → “9–11 月” */
export function formatMonths(months: number[] | undefined | null): string {
  if (!months || months.length === 0) return '文献未给出明确季节';
  const sorted = Array.from(new Set(months)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const cur = sorted[i];
    if (cur !== undefined && cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    if (cur !== undefined) {
      start = cur;
      prev = cur;
    }
  }
  return `${ranges.join('、')} 月`;
}

/** 当前季节的提示（用于首页） */
export function seasonalContext(month: number): { season: string; months: number[]; note: string } {
  const s = seasonOfMonth(month);
  return {
    season: s.label,
    months: [...s.months],
    note: ['春季潮湿，食材保存与生食风险需留意', '夏季生腌、冷食与夜市消费增多', '秋季水生植物与蟹类上市，聚餐增多', '冬季火锅、涮肉与腌腊消费增加'][s.id === 'spring' ? 0 : s.id === 'summer' ? 1 : s.id === 'autumn' ? 2 : 3],
  };
}

/* ------------------------------------------------------------------ */
/* 路径                                                                 */
/* ------------------------------------------------------------------ */

export const paths = {
  home: '/',
  /** 旧地图链接别名；地图内容已并入 /explore 工作台 */
  map: '/explore',
  explore: '/explore',
  atlas: '/atlas',
  parasites: '/parasites',
  parasite: (id: string) => `/parasites/${id}`,
  foods: '/foods',
  food: (id: string) => `/foods/${id}`,
  regions: '/regions',
  region: (code: string) => `/regions/${code}`,
  sources: '/sources',
  chat: '/chat',
};

/* ------------------------------------------------------------------ */
/* 处理方式                                                             */
/* ------------------------------------------------------------------ */

export const PREPARATION_FALLBACK: Record<PreparationTag, { name: string; description: string }> = {
  raw: { name: '生食', description: '未加热直接食用：刺身、生腌、醉制、凉拌生食。' },
  undercooked: { name: '半生 / 欠火候', description: '涮、烫、快炒、短时煎烤或七分熟。' },
  'cured-smoked': { name: '腌制 / 烟熏 / 风干', description: '腌腊、咸制、烟熏等工艺，是否灭活取决于工艺。' },
  grilled: { name: '烧烤', description: '明火或炭火烧烤，中心温度可能不足。' },
  'fully-cooked': { name: '充分加热', description: '煮熟、炖透、蒸透，中心温度达标。' },
  'boiled-water': { name: '煮沸饮用水', description: '将水煮沸后饮用。' },
  'unwashed-produce': { name: '未洗净生食蔬果', description: '蔬菜瓜果未经充分清洗或去皮即生食。' },
  unknown: { name: '处理方式未知', description: '尚未说明烹饪或处理方式。' },
};

export function preparationLabel(id: PreparationTag, taxonomyNames?: Map<string, string>): string {
  return taxonomyNames?.get(id) ?? PREPARATION_FALLBACK[id]?.name ?? id;
}

