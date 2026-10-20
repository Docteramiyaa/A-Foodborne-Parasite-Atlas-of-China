/**
 * 食源虫谱 · 共享领域类型
 * ------------------------------------------------------------
 * 该文件是前端、后端、数据构建脚本之间的唯一契约（single source of truth）。
 * 修改字段时必须同步：
 *   - server/data/schemas.ts（运行时校验）
 *   - 相关约定（数据模型说明）
 *   - 受影响的数据文件
 *
 * 设计原则（来自 相关约定）：
 *   1. 通用传播机制 与 地区/季节证据 分开保存；
 *   2. 每条事实尽量挂 sourceIds，来源可追溯；
 *   3. 资料不足保留为未知（insufficient / not-reported），不得解释为“无风险”；
 *   4. 地图颜色表达“文献证据状态”，不表达量化风险分值。
 */

/* ========================================================================== */
/* 基础枚举                                                                    */
/* ========================================================================== */

/** 寄生虫大类 */
export type ParasiteCategory =
  | 'cestode' // 绦虫
  | 'nematode' // 线虫
  | 'trematode' // 吸虫
  | 'protozoan' // 原虫
  | 'arthropod' // 节肢动物（舌形虫旧称，暂列）
  | 'other';

/** 食物大类 */
export type FoodCategoryId =
  | 'livestock'
  | 'game'
  | 'offal'
  | 'freshwater-fish'
  | 'marine-fish'
  | 'shellfish'
  | 'crustacean'
  | 'amphibian-reptile'
  | 'aquatic-plant'
  | 'produce'
  | 'water';

/** 处理方式标签（查询与风控的核心维度之一） */
export type PreparationTag =
  | 'raw' // 生食：刺身、生腌、醉制、凉拌生食
  | 'undercooked' // 半生：涮、烫、快炒、七分熟、短时烧烤、溏心
  | 'cured-smoked' // 腌腊、烟熏、风干（是否灭活因工艺而异）
  | 'grilled' // 明火烧烤（中心温度常不足）
  | 'fully-cooked' // 充分加热：煮熟、炖透、蒸透
  | 'boiled-water' // 煮沸饮用水
  | 'unwashed-produce' // 未洗净生食蔬果
  | 'unknown';

/** 风险等级：定性表达，不是概率或评分 */
export type RiskLevel =
  | 'high' // 存在明确的病原-暴露组合，且文献记载该风险
  | 'moderate' // 存在风险，但受来源、工艺、地区等因素影响
  | 'low' // 该处理方式能够有效降低已知风险（仍需注意交叉污染）
  | 'contextual' // 取决于产地、来源、工艺等条件
  | 'unknown'; // 现有资料不足

/** 省份证据状态（用于地图着色与地区页徽标） */
export type RegionStatus =
  | 'endemic' // 文献明确的地方性流行区 / 高流行区
  | 'high-burden' // 文献列为高发区 / 主要流行区（区域集群）
  | 'reported' // 有病例、调查或监测记录的省级记载
  | 'national-context' // 仅有全国性资料，未单列本省
  | 'limited' // 资料有限
  | 'not-reported' // 文献明确“未见报道”（不等于无风险）
  | 'unknown'; // 未知

/** 证据等级（描述资料可靠性，不描述风险大小） */
export type EvidenceLevel =
  | 'A' // 指南 / 国家标准 / 国家级监测或权威机构
  | 'B' // 同行评议研究、系统综述、期刊综述
  | 'C' // 科普、百科、新闻报道等二手资料
  | 'D'; // 仅情境推断 / 专家意见（需明确标注）

/** 来源类型 */
export type SourceType =
  | 'guideline'
  | 'surveillance'
  | 'study'
  | 'review'
  | 'institution'
  | 'encyclopedia'
  | 'media'
  | 'reference';

/** 来源可靠性分级 */
export type SourceReliability = 'high' | 'medium' | 'reference';

/** 严重程度（健康后果） */
export type Severity = 'mild' | 'moderate' | 'severe' | 'life-threatening' | 'variable';

/** 对话意图 */
export type ChatIntent =
  | 'risk-assessment' // 食前风险评估
  | 'post-exposure' // 已食用 / 食后担忧
  | 'prevention' // 预防方法
  | 'symptoms' // 症状与后果
  | 'treatment' // 治疗与就医
  | 'knowledge' // 知识查询（是什么 / 生活史 / 宿主）
  | 'region' // 地区查询
  | 'season' // 季节查询
  | 'comparison' // 对比
  | 'follow-up' // 追加条件 / 改变条件
  | 'clarification-answer' // 回答追问
  | 'greeting'
  | 'out-of-scope';

/* ========================================================================== */
/* 来源                                                                        */
/* ========================================================================== */

export interface Source {
  /** 形如 "S01"，稳定主键 */
  id: string;
  /** 原始题名（保留原文） */
  title: string;
  /** 作者，顿号分隔 */
  authors?: string;
  /** 期刊 / 机构 / 出版社 */
  venue?: string;
  year: number | string;
  type: SourceType;
  reliability: SourceReliability;
  /** 可访问链接（仅收录已知真实链接） */
  url?: string;
  /** DOI（有则填写；优先直达摘要/原文） */
  doi?: string;
  /** 卷期页码 */
  citation?: string;
  /** 该来源被本项目使用的方式与范围 */
  usage?: string;
  /** 使用时的注意事项（如：二手资料、样本局限） */
  caveats?: string[];
  /** 关联实体，用于来源页反向索引；由构建脚本可校验 */
  linkedEntityIds?: string[];
}

/* ========================================================================== */
/* 寄生虫                                                                      */
/* ========================================================================== */

export interface LifecycleStage {
  /** 阶段名，如“虫卵”“囊尾蚴”“成虫” */
  name: string;
  /** 宿主 / 环境 */
  host: string;
  description: string;
}

export interface HostRelation {
  definitive: string[];
  intermediate: string[];
  paratenic?: string[];
  accidental?: string[];
}

export interface Transmission {
  /** 一句话概括感染途径 */
  summary: string;
  /** 感染性阶段 */
  infectiveStage: string;
  /** 侵入方式 */
  entryMode: string;
  /** 可被机体摄入的载体（食物/水/接触） */
  vehicles: string[];
  /** 生活史链条，用于前端示意图 */
  stages: LifecycleStage[];
  hosts: HostRelation;
  sourceIds: string[];
}

export interface RiskScenario {
  id: string;
  title: string;
  /** 关联食物 id */
  foodIds: string[];
  /** 关联处理方式标签 */
  preparationTags: PreparationTag[];
  /** 关联菜名/饮食场景 */
  examples?: string[];
  riskLevel: RiskLevel;
  explanation: string;
  sourceIds: string[];
}

export interface Consequence {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  /** 潜伏期 / 起病时间（有据可依时才填） */
  onset?: string;
  sourceIds: string[];
}

export interface Measure {
  title: string;
  detail: string;
  /** 是否为最关键的防护措施（前端可置顶强调） */
  key?: boolean;
  sourceIds?: string[];
}

export interface Seasonality {
  /** 文献记载的风险高峰月份；空数组表示资料未给出明确季节 */
  peakMonths: number[];
  /** 概括，如“冬春季”“全年” */
  pattern: string;
  /** 该结论的证据说明与适用范围 */
  evidenceNote: string;
  /** 与饮食情境相关、但非流行病学结论的季节提示（必须标注） */
  contextNote?: string;
  sourceIds: string[];
}

export interface NationalDistribution {
  summary: string;
  /** 全国层面的证据状态（汇总表达，不用于省级着色） */
  status: RegionStatus;
  /** 关键数字，用于详情页信息卡 */
  stats?: Stat[];
  sourceIds: string[];
}

export interface Stat {
  label: string;
  value: string;
  note?: string;
  sourceIds: string[];
}

export interface Parasite {
  /** slug，如 "clonorchis-sinensis" */
  id: string;
  name: string;
  latinName: string;
  aliases: string[];
  category: ParasiteCategory;
  /** 如“吸虫” */
  categoryLabel: string;
  /** 一句话定位 */
  tagline: string;
  /** 2–4 句概述 */
  summary: string;
  /** 关联食物 id */
  foodIds: string[];
  /** 关联食物大类 */
  foodCategoryIds: FoodCategoryId[];
  transmission: Transmission;
  riskScenarios: RiskScenario[];
  consequences: Consequence[];
  prevention: Measure[];
  /** 已食用后的建议（与食前预防严格分开） */
  postExposure: Measure[];
  treatment: {
    summary: string;
    /** 药物名称仅作资料转述，前端须配免责声明 */
    drugs?: string[];
    /** 重要提醒，如“须由医生评估” */
    note: string;
    sourceIds: string[];
  };
  seasonality: Seasonality;
  distribution: NationalDistribution;
  /** 证据评级与使用注意 */
  evidence: {
    level: EvidenceLevel;
    basis: string;
    caveats: string[];
  };
  /** 外部权威知识入口 */
  externalLinks?: { label: string; url: string }[];
  /** 知识库中与该寄生虫明确相关的地区（省份 adcode，来自 regions.json 聚合校验） */
  featuredRegionCodes?: string[];
  featured: boolean;
  /** 展示顺序（小者优先） */
  order: number;
  relatedParasiteIds: string[];
}

/* ========================================================================== */
/* 食物                                                                        */
/* ========================================================================== */

export interface FoodPreparation {
  tag: PreparationTag;
  /** 面向用户的处理方式名称，如“生食 / 刺身” */
  label: string;
  risk: RiskLevel;
  /** 该处理方式下的主要风险寄生虫 */
  parasiteIds: string[];
  explanation: string;
  /** 更安全的替代做法 */
  saferAlternative?: string;
  sourceIds: string[];
}

export interface ExampleDish {
  name: string;
  /** 常见地区或语境 */
  context?: string;
  preparationTags: PreparationTag[];
  riskNote: string;
  parasiteIds: string[];
  sourceIds?: string[];
}

export interface Food {
  id: string;
  name: string;
  aliases: string[];
  categoryId: FoodCategoryId;
  categoryLabel: string;
  tagline: string;
  summary: string;
  /** 常见菜名、叫法与饮食场景 */
  exampleDishes: ExampleDish[];
  /** 处理方式风险矩阵 */
  preparations: FoodPreparation[];
  parasiteIds: string[];
  /** 选购与处理的一般原则 */
  tips: Measure[];
  /** 季节与饮食情境说明（须区分证据与情境） */
  seasonNote: string;
  sourceIds: string[];
  featured: boolean;
  order: number;
}

/* ========================================================================== */
/* 地区                                                                        */
/* ========================================================================== */

export interface RegionEvidenceEntry {
  id: string;
  parasiteIds: string[];
  foodIds?: string[];
  status: RegionStatus;
  /** 一句话结论 */
  headline: string;
  /** 详细说明（保留研究对象/口径/时间范围） */
  detail: string;
  /** 研究语境：人群、样本、时间、统计口径等，避免口径混用 */
  studyContext?: {
    population?: string;
    sample?: string;
    period?: string;
    statistic?: string;
    location?: string;
  };
  evidenceLevel: EvidenceLevel;
  sourceIds: string[];
}

export interface StudySite {
  id: string;
  name: string;
  /** [经度, 纬度] */
  geo?: [number, number];
  provinceCode: string;
  parasiteIds: string[];
  note: string;
  sourceIds: string[];
}

export interface SeasonalNote {
  months: number[];
  note: string;
  parasiteIds: string[];
  /** infection-evidence（文献季节证据） / dietary-context（饮食情境提示） */
  basis: 'infection-evidence' | 'dietary-context';
  sourceIds: string[];
}

export interface Region {
  /** 6 位 adcode，如 "110000" */
  code: string;
  /** 2 位简称代码，如 "11" */
  shortCode: string;
  name: string;
  shortName: string;
  aliases: string[];
  type: 'province' | 'municipality' | 'autonomous-region' | 'sar' | 'special';
  /** [经度, 纬度]，来自地理数据 */
  center: [number, number];
  tagline: string;
  /** 2–4 句地区与食源性寄生虫关系的概述 */
  intro: string;
  /** 有文献依据的饮食特点 */
  foodCulture: string[];
  /** 汇总证据状态（地图着色依据） */
  evidenceStatus: RegionStatus;
  /** 汇总说明 */
  evidenceSummary: string;
  entries: RegionEvidenceEntry[];
  studySites: StudySite[];
  seasonalNotes: SeasonalNote[];
  /** 本省整体说明所依据的来源 */
  sourceIds: string[];
}

/* ========================================================================== */
/* 类别与处理方式（taxonomy）                                                  */
/* ========================================================================== */

export interface FoodCategory {
  id: FoodCategoryId;
  name: string;
  description: string;
  order: number;
}

export interface PreparationMeta {
  id: PreparationTag;
  name: string;
  description: string;
  /** 该处理方式通常的风险倾向（用于 UI 提示） */
  riskTendency: RiskLevel;
  /** 自然语言识别别名，服务端 NLU 使用 */
  aliases: string[];
  order: number;
}

export interface ParasiteCategoryMeta {
  id: ParasiteCategory;
  name: string;
  description: string;
  order: number;
}

export interface RegionStatusMeta {
  id: RegionStatus;
  name: string;
  description: string;
  /** 地图色阶语义键（不代表量化风险） */
  tone: 'strong' | 'medium' | 'light' | 'neutral' | 'muted' | 'unknown';
  order: number;
}

export interface EvidenceLevelMeta {
  id: EvidenceLevel;
  name: string;
  description: string;
}

export interface Taxonomy {
  foodCategories: FoodCategory[];
  preparations: PreparationMeta[];
  parasiteCategories: ParasiteCategoryMeta[];
  regionStatuses: RegionStatusMeta[];
  evidenceLevels: EvidenceLevelMeta[];
}

/* ========================================================================== */
/* 风险规则（确定性推理）                                                      */
/* ========================================================================== */

export interface RiskCondition {
  /** 需要同时满足的食物（任一命中即可） */
  foodIds?: string[];
  foodCategoryIds?: FoodCategoryId[];
  /** 需要同时满足的处理方式（任一命中） */
  preparationTags?: PreparationTag[];
  /** 仅在这些省份成立（可选） */
  provinceCodes?: string[];
  /** 仅在这些月份成立（可选） */
  months?: number[];
}

export interface RiskRule {
  id: string;
  /** 规则面向的寄生虫 */
  parasiteId: string;
  /** 条件（全部满足时命中） */
  when: RiskCondition;
  riskLevel: RiskLevel;
  /** 面向用户的判断理由 */
  rationale: string;
  /** 附加条件说明（如“取决于鱼种与产地”） */
  conditions?: string[];
  sourceIds: string[];
  /** 规则优先级，大者优先 */
  priority: number;
}

/* ========================================================================== */
/* 数据文件封装                                                                */
/* ========================================================================== */

export interface Dataset<T> {
  version: string;
  updatedAt: string;
  items: T[];
}

export interface SourcesFile extends Dataset<Source> {}
export interface ParasitesFile extends Dataset<Parasite> {}
export interface FoodsFile extends Dataset<Food> {}
export interface RegionsFile extends Dataset<Region> {}
export interface RiskRulesFile extends Dataset<RiskRule> {}
export interface TaxonomyFile {
  version: string;
  updatedAt: string;
  taxonomy: Taxonomy;
}

/* ========================================================================== */
/* 派生模型 / API 响应                                                         */
/* ========================================================================== */

/** 寄生虫摘要（列表、搜索结果、地图侧栏） */
export interface ParasiteSummary {
  id: string;
  name: string;
  latinName: string;
  category: ParasiteCategory;
  categoryLabel: string;
  tagline: string;
  foodIds: string[];
  foodCategoryIds: FoodCategoryId[];
  featured: boolean;
  evidenceLevel: EvidenceLevel;
  seasonPeakMonths: number[];
  regionCount: number;
  consequencesSummary: string;
}

export interface FoodSummary {
  id: string;
  name: string;
  categoryId: FoodCategoryId;
  categoryLabel: string;
  tagline: string;
  parasiteIds: string[];
  featured: boolean;
}

export interface RegionSummary {
  code: string;
  shortCode: string;
  name: string;
  shortName: string;
  type: Region['type'];
  center: [number, number];
  evidenceStatus: RegionStatus;
  /** 一句话地区定位（用于地区目录，不表达证据/风险） */
  tagline?: string;
  /** 2–4 句地区介绍 */
  intro?: string;
  /** 文献记载涉及的寄生虫（去重） */
  parasiteIds: string[];
  /** 文献条目数（证据密度，用于地图辅助信息，不作风险分值） */
  entryCount: number;
  /** 一句话摘要 */
  evidenceSummary: string;
}

/** 地区详情响应：地区 + 关联实体 */
export interface RegionDetail extends Region {
  parasites: ParasiteSummary[];
  foods: FoodSummary[];
  neighbors: { code: string; name: string; distanceKm: number }[];
  totalEvidenceItems: number;
}

export interface ParasiteDetail extends Parasite {
  foods: FoodSummary[];
  /** 从 regions.json 聚合出的省级证据 */
  regionEvidence: {
    code: string;
    name: string;
    status: RegionStatus;
    headline: string;
    level: EvidenceLevel;
    sourceIds: string[];
  }[];
  /** 与食物处理方式联动的规则 */
  rules: RiskRule[];
}

export interface FoodDetail extends Food {
  parasites: ParasiteSummary[];
  /** 该食物在哪些省份的文献中出现 */
  regions: { code: string; name: string; status: RegionStatus; headline: string }[];
  rules: RiskRule[];
}

export interface SourceDetail extends Source {
  citedBy: {
    parasites: { id: string; name: string }[];
    foods: { id: string; name: string }[];
    regions: { code: string; name: string }[];
  };
}

/* ---------------- 图集轻量载荷（客户端缓存） ---------------- */

export interface AtlasPayload {
  meta: AtlasMeta;
  taxonomy: Taxonomy;
  parasites: ParasiteSummary[];
  foods: FoodSummary[];
  regions: RegionSummary[];
  sources: Source[];
}

export interface AtlasMeta {
  /** 数据版本 */
  version: string;
  updatedAt: string;
  /** 构建时间 */
  builtAt: string;
  counts: {
    parasites: number;
    foods: number;
    regions: number;
    sources: number;
    rules: number;
  };
  /** 服务端当前季节上下文，用于首页“当前季节”提示 */
  now: {
    iso: string;
    year: number;
    month: number;
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    seasonLabel: string;
  };
  disclaimer: string;
  dataNotes: string[];
}

/* ---------------- 查询 / 探索 ---------------- */

export interface ExploreQuery {
  provinceCodes?: string[];
  months?: number[];
  foodIds?: string[];
  preparationTags?: PreparationTag[];
  parasiteIds?: string[];
  q?: string;
}

/** 风险组合命中的单省证据（必须绑定具体寄生虫，不能用省级汇总状态代替） */
export interface ExploreRiskRegionEvidence {
  code: string;
  name: string;
  status: RegionStatus;
  headline: string;
  level: EvidenceLevel;
  sourceIds: string[];
}

export interface ExploreRiskHit {
  ruleId: string;
  parasite: ParasiteSummary;
  riskLevel: RiskLevel;
  rationale: string;
  conditions?: string[];
  matchedFoodIds: string[];
  matchedPreparationTags: PreparationTag[];
  matchedRegionCodes: string[];
  /** 与“该寄生虫 × 该地区”匹配的条目级证据；没有专门记载时为空数组 */
  regionEvidence: ExploreRiskRegionEvidence[];
  sourceIds: string[];
  score: number;
}

export interface ExploreResult {
  query: ExploreQuery;
  /** 命中的风险组合 */
  risks: ExploreRiskHit[];
  /** 相关寄生虫 */
  parasites: ParasiteSummary[];
  /** 相关食物 */
  foods: FoodSummary[];
  /** 相关地区证据 */
  regions: {
    code: string;
    name: string;
    status: RegionStatus;
    headline: string;
    parasiteIds: string[];
    level: EvidenceLevel;
    sourceIds: string[];
  }[];
  /** 相关症状/后果条目 */
  consequences: {
    id: string;
    parasiteId: string;
    parasiteName: string;
    title: string;
    description: string;
    severity: Severity;
    sourceIds: string[];
  }[];
  /** 预防要点 */
  prevention: {
    parasiteId: string;
    parasiteName: string;
    title: string;
    detail: string;
    key: boolean;
  }[];
  /** 命中的季节证据 */
  seasonalNotes: {
    provinceCode: string;
    provinceName: string;
    months: number[];
    note: string;
    basis: SeasonalNote['basis'];
    parasiteIds: string[];
    sourceIds: string[];
  }[];
  /** 命中的全局搜索块 */
  textMatches: {
    kind: 'parasite' | 'food' | 'region';
    id: string;
    title: string;
    excerpt: string;
  }[];
  total: number;
  /** 查询理解说明 */
  interpretation: {
    provinceLabels: string[];
    monthLabels: string[];
    foodLabels: string[];
    preparationLabels: string[];
    parasiteLabels: string[];
  };
}

/* ---------------- 探索（面向普通用户的单一结果） ---------------- */

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * 季节与结果的关系：
 * - peak：文献报告高峰落在所选季节；
 * - all-year：全年均可发生/全年相关；
 * - off-peak：存在季节资料，但所选季节不在报告高峰；不等于不可能发生；
 * - not-recorded：本知识库未收录该季节资料；不等于不匹配；
 * - unknown：资料无法判断。
 */
export type SeasonRelation = 'peak' | 'all-year' | 'off-peak' | 'not-recorded' | 'unknown';

export interface ExploreBriefingQuery {
  provinceCodes?: string[];
  seasons?: SeasonId[];
  foodIds?: string[];
  preparationTags?: PreparationTag[];
  parasiteIds?: string[];
}

export interface SourceBrief {
  id: string;
  title: string;
  authors?: string;
  venue?: string;
  year: number | string;
  url?: string;
  doi?: string;
}

export interface ExplorePreparationOption {
  tag: PreparationTag;
  label: string;
  risk: RiskLevel;
  parasiteIds: string[];
  explanation: string;
  saferAlternative?: string;
  sourceIds: string[];
}

export interface ExploreRiskItem {
  parasite: ParasiteSummary;
  riskLevel: RiskLevel;
  explanation: string;
  conditions?: string[];
  seasonRelation: SeasonRelation;
  seasonNote?: string;
  regionNote?: string;
  consequences: {
    id: string;
    title: string;
    description: string;
    severity: Severity;
  }[];
  prevention: {
    title: string;
    detail: string;
    key: boolean;
  }[];
  sourceIds: string[];
}

export interface ExploreProtection {
  title: string;
  detail: string;
  parasiteNames: string[];
  sourceIds: string[];
}

export interface ExploreRelatedParasite {
  parasite: ParasiteSummary;
  reason: string;
}

export interface ExploreSeasonGroup {
  relation: SeasonRelation;
  label: string;
  parasites: { id: string; name: string; note?: string }[];
}

export interface ExploreRegionKnowledge {
  code: string;
  name: string;
  intro: string;
  foodCulture: string[];
  entries: {
    id: string;
    headline: string;
    detail: string;
    parasiteIds: string[];
    sourceIds: string[];
  }[];
  sourceIds: string[];
}

export type ExploreSituation = 'empty' | 'context' | 'incomplete' | 'risk' | 'effective' | 'uncertain';

/**
 * 探索结果只有一份“当前情况”的连贯叙述。
 * 页面顺序固定为：当前情况 → 当前风险/处理效果 → 原因与后果 → 可采取的做法 → 本地资料/季节背景 → 来源。
 */
export interface ExploreBriefing {
  query: ExploreBriefingQuery;
  situation: ExploreSituation;
  headline: string;
  summary: string;
  selection: {
    province: { code: string; name: string; hasLocalKnowledge: boolean } | null;
    season: { id: SeasonId; label: string; months: number[] } | null;
    foods: FoodSummary[];
    preparation: ExplorePreparationOption | null;
    parasites: ParasiteSummary[];
  };
  currentRisks: ExploreRiskItem[];
  effectiveProtections: ExploreProtection[];
  relatedParasites: ExploreRelatedParasite[];
  seasonGroups: ExploreSeasonGroup[];
  regionKnowledge: ExploreRegionKnowledge | null;
  /** 当前食物可用的做法；用于让做法控件只展示真正适用的选项 */
  preparationOptions: ExplorePreparationOption[];
  /** 只保留与本次结果直接相关的一两句缺口说明，不重复免责声明 */
  notices: string[];
  sources: SourceBrief[];
}



export interface ChatContext {
  provinceCodes: string[];
  months: number[];
  foodIds: string[];
  preparationTags: PreparationTag[];
  parasiteIds: string[];
  /** 用户是否已食用；null 表示未知 */
  exposure: 'before' | 'after' | 'unknown';
  /** 用户描述的症状关键词 */
  symptoms: string[];
  /** 用户自由文本中的时间表达（如“昨天”“下周”） */
  timeExpression?: string;
}

export type ChatSectionKind =
  | 'why'
  | 'consequence'
  | 'prevention'
  | 'post-exposure'
  | 'treatment'
  | 'region'
  | 'season'
  | 'evidence'
  | 'note';

export interface ChatSection {
  kind: ChatSectionKind;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  parasiteIds?: string[];
  sourceIds?: string[];
}

export interface ChatCitation {
  sourceId: string;
  title: string;
  venue?: string;
  year?: string | number;
  reliability: SourceReliability;
  relevance: string;
  url?: string;
}

export interface ClarifyQuestion {
  question: string;
  field: 'food' | 'preparation' | 'province' | 'exposure' | 'symptoms';
  options: { label: string; value: string; hint?: string }[];
}

export interface RiskVerdict {
  level: RiskLevel;
  label: string;
  /** 判断依据摘要 */
  rationale: string[];
  parasiteIds: string[];
  /** 是否为已知高风险暴露组合 */
  hasDocumentedRisk: boolean;
}

export interface ChatAnswer {
  intent: ChatIntent;
  /** 多意图 */
  secondaryIntents: ChatIntent[];
  title: string;
  /** 直接回答的第一段 */
  lead: string;
  verdict: RiskVerdict | null;
  sections: ChatSection[];
  followUps: string[];
  clarify: ClarifyQuestion | null;
  citations: ChatCitation[];
  /** 本次回答理解到的条件 */
  context: ChatContext;
  /** 与回答关联的实体，用于前端卡片与地图联动 */
  related: {
    parasiteIds: string[];
    foodIds: string[];
    regionCodes: string[];
    sourceIds: string[];
    ruleIds: string[];
  };
  /** 是否有可在地图中定位的内容 */
  mapQuery: {
    provinceCodes: string[];
    foodIds: string[];
    months: number[];
    parasiteIds: string[];
    preparationTags: PreparationTag[];
  } | null;
  disclaimer: string;
  generatedBy: 'rules' | 'llm';
  /** 处理耗时（毫秒），便于调试 */
  elapsedMs?: number;
}

export interface ChatRequest {
  message: string;
  /** 最近若干轮对话，用于理解指代与追问 */
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** 客户端维护的结构化上下文 */
  context?: Partial<ChatContext>;
}

export interface ChatResponse {
  answer: ChatAnswer;
  /** 供客户端合并保存 */
  context: ChatContext;
  /** 会话建议追问 */
  suggestions: string[];
}

/* ---------------- 统一搜索 ---------------- */

export type SearchKind = 'parasite' | 'food' | 'region' | 'source';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  excerpt: string;
  /** 供高亮的关键词位置不重要，前端自行高亮 q */
  score: number;
  url: string;
  badges: string[];
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  grouped: Record<SearchKind, SearchHit[]>;
}

/* ---------------- 站点导航 ---------------- */

export interface NavLink {
  label: string;
  href: string;
  description?: string;
}

