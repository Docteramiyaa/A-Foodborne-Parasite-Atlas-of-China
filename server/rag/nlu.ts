/**
 * 规则式中文理解（NLU）
 * ------------------------------------------------------------
 * 离线、确定性、可单测。负责把用户的自然语言描述解析为：
 *   食物 / 处理方式 / 地区 / 时间 / 寄生虫 / 暴露状态 / 症状 / 意图
 *
 * 设计原则：
 *  1. 优先使用数据层（foods/parasites/regions/taxonomy/cities）的 id/name/aliases，
 *     同时内置一份“契约级”兜底词典（ID 由 相关约定 锁定），
 *     使数据并行扩充期间仍能识别常见表达；
 *  2. 长词优先 + 互不重叠匹配，避免“生腌”被“腌”抢走；
 *  3. 处理否定表达（“不是生的”“不吃生的”），并记录 negationNotes 供回答组装使用；
 *  4. 不确定就标记歧义（如“生鱼片”），交由对话追问而不是凭空假设；
 *  5. 不 import store / 不发网络请求，lexicon 由调用方注入。
 */
import type {
  ChatContext,
  ChatIntent,
  Food,
  PreparationTag,
  Taxonomy,
} from '../../shared/types.js';
import {
  chineseNumberToInt,
  findKeywords,
  firstSentence,
  hasMeaningfulContent,
  normalizeText,
  splitBySeparators,
  truncateText,
  uniq,
} from './text.js';
import { loadCitiesFromData, mergeFallbackCities, PROVINCES, provinceDisplayName, type RagKnowledge } from './knowledge.js';

/* ========================================================================== */
/* 类型                                                                        */
/* ========================================================================== */

export type QuestionForm = 'yes-no' | 'wh' | 'statement' | 'none';

export interface NluMention {
  type: 'food' | 'parasite' | 'preparation' | 'province' | 'city' | 'time' | 'symptom';
  /** 用户原文中命中的词 */
  text: string;
  /** 解析出的实体 id（处理方式时为 tag） */
  id?: string;
  /** 规范化名称/标签 */
  canonical?: string;
  /** 实体是否存在于当前知识库（false 表示只识别到名称、数据尚未收录） */
  resolved?: boolean;
}

export interface AmbiguousFood {
  /** 歧义表达，如“生鱼片” */
  text: string;
  candidates: { id: string; name: string }[];
  /** 给用户看的说明 */
  note: string;
}

export type ComparisonDimension = 'food' | 'preparation' | 'parasite' | 'mixed';

export interface ComparisonSpec {
  left: string;
  right: string;
  dimension: ComparisonDimension;
  leftFoodIds: string[];
  rightFoodIds: string[];
  leftPreparationTags: PreparationTag[];
  rightPreparationTags: PreparationTag[];
  leftParasiteIds: string[];
  rightParasiteIds: string[];
}

export interface NluSignals {
  risk: boolean;
  prevention: boolean;
  preventionStrong: boolean;
  treatment: boolean;
  symptomQuery: boolean;
  knowledge: boolean;
  region: boolean;
  season: boolean;
  comparison: boolean;
  greeting: boolean;
  outOfScope: boolean;
  crisis: boolean;
  injection: boolean;
}

export interface NluResult {
  /** 本轮抽取出的结构化条件（未与上一轮合并，合并由 composer 负责） */
  context: ChatContext;
  /** 意图列表：第 1 项为主意图 */
  intents: ChatIntent[];
  primaryIntent: ChatIntent;
  secondaryIntents: ChatIntent[];
  ambiguousFoods: AmbiguousFood[];
  mentions: NluMention[];
  negationNotes: string[];
  notes: string[];
  rawText: string;
  normalizedText: string;
  truncated: boolean;
  isFollowUp: boolean;
  questionForm: QuestionForm;
  comparison: ComparisonSpec | null;
  signals: NluSignals;
  /** 安全相关标记：crisis（自伤等高风险表达）/ injection（提示注入尝试） */
  safety: 'crisis' | 'injection' | null;
}

/* ========================================================================== */
/* 内置词典（ID 来自 相关约定，锁定不变）                          */
/* ========================================================================== */

/** 19 种食物的内置别名兜底（数据层 aliases 优先并用，本表只补充常见表达） */
const BUILTIN_FOOD_ALIASES: Record<string, { name: string; aliases: string[] }> = {
  pork: { name: '猪肉', aliases: ['猪肉', '猪排', '排骨', '五花肉', '里脊', '猪腿肉', '猪肉馅', '生猪肉', '猪扒'] },
  beef: { name: '牛肉', aliases: ['牛肉', '牛排', '牛腩', '肥牛', '牛柳', '生牛肉', '牛肉片'] },
  mutton: { name: '羊肉', aliases: ['羊肉', '羊排', '羊腿', '涮羊肉', '羊蝎子', '羔羊', '羊肉片'] },
  'game-meat': { name: '其他动物肉类', aliases: ['狗肉', '野味', '鹿肉', '野猪', '獾肉', '鼠肉'] },
  offal: { name: '内脏与脏器', aliases: ['内脏', '猪肝', '鸡肝', '鸭肝', '腰花', '猪肺', '牛肝', '脏器', '肠粉'] },
  'freshwater-fish': {
    name: '淡水鱼',
    aliases: ['淡水鱼', '草鱼', '鲤鱼', '鲫鱼', '鳙鱼', '鲢鱼', '青鱼', '黑鱼', '乌鳢', '鳜鱼', '泥鳅', '黄鳝', '鱼生', '顺德鱼生', '淡水鱼生', '鳊鱼', '鲮鱼', '罗非鱼', '鱼片', '鱼头'],
  },
  'marine-fish': {
    name: '海鱼与洄游鱼',
    aliases: ['海鱼', '三文鱼', '鲑鱼', '金枪鱼', '吞拿鱼', '秋刀鱼', '鲭鱼', '鳕鱼', '带鱼', '沙丁鱼', '刀鲚', '鲅鱼', '刺身', '生鱼片', '寿司'],
  },
  shrimp: { name: '虾类', aliases: ['虾', '虾类', '虾仁', '河虾', '草虾', '对虾', '基围虾', '醉虾', '生腌虾', '虾滑'] },
  crab: { name: '蟹类', aliases: ['螃蟹', '蟹', '溪蟹', '河蟹', '大闸蟹', '石蟹', '醉蟹', '蟹黄', '蟹肉', '蟹棒'] },
  crayfish: { name: '蝲蛄 / 小龙虾', aliases: ['小龙虾', '蝲蛄', '喇蛄', '螯虾', '东北螯虾'] },
  snail: { name: '螺类', aliases: ['福寿螺', '玛瑙螺', '田螺', '螺类', '螺蛳', '螺肉', '东风螺', '褐云玛瑙螺'] },
  frog: { name: '蛙类', aliases: ['青蛙', '牛蛙', '田鸡', '蛙类', '林蛙', '棘胸蛙'] },
  snake: { name: '蛇类', aliases: ['蛇肉', '蛇类', '蛇胆', '蛇酒', '眼镜蛇', '五步蛇', '乌梢蛇'] },
  'aquatic-plant': { name: '水生植物', aliases: ['荸荠', '马蹄', '菱角', '茭白', '莲藕', '藕', '水芹', '芡实', '慈姑', '水生植物'] },
  vegetable: { name: '蔬菜与生食蔬菜', aliases: ['蔬菜', '生菜', '沙拉', '凉拌菜', '蔬菜沙拉', '生菜沙拉', '生吃蔬菜', '黄瓜', '番茄', '西红柿'] },
  fruit: { name: '瓜果', aliases: ['水果', '瓜果', '草莓', '葡萄', '水果沙拉', '鲜榨果汁'] },
  'drinking-water': { name: '饮用水', aliases: ['生水', '井水', '溪水', '河水', '山泉水', '泉水', '自来水', '未煮沸', '饮用水', '生饮水'] },
  'raw-milk': { name: '生乳', aliases: ['生乳', '生奶', '鲜奶', '未消毒牛奶', '现挤牛奶', '生牛奶', '羊奶'] },
  'other-aquatic': { name: '其他水产', aliases: ['贝类', '生蚝', '牡蛎', '蛤蜊', '扇贝', '章鱼', '鱿鱼', '墨鱼', '海鲜', '海产品', '海螺'] },
};

/** 18 种寄生虫的内置名称/别名兜底 */
const BUILTIN_PARASITES: Record<string, { name: string; aliases: string[] }> = {
  'taenia-solium': { name: '猪带绦虫', aliases: ['猪带绦虫', '猪肉绦虫', '囊虫', '囊尾蚴', '脑囊虫', '囊尾蚴病', '囊虫病'] },
  'taenia-saginata': { name: '牛带绦虫', aliases: ['牛带绦虫', '牛肉绦虫', '牛绦虫'] },
  'trichinella-spiralis': { name: '旋毛虫', aliases: ['旋毛虫', '旋毛虫病', '旋毛虫感染'] },
  'toxoplasma-gondii': { name: '弓形虫', aliases: ['弓形虫', '弓形体', '弓形虫病', '弓形虫感染'] },
  'echinococcus-granulosus': { name: '细粒棘球绦虫', aliases: ['细粒棘球绦虫', '棘球蚴', '囊型包虫病', '包虫病', '棘球蚴病'] },
  'echinococcus-multilocularis': { name: '多房棘球绦虫', aliases: ['多房棘球绦虫', '泡型包虫病', '泡型棘球蚴', '泡型棘球病'] },
  'linguatula-serrata': { name: '舌形虫', aliases: ['舌形虫', '锯齿舌形虫', '舌形虫病'] },
  'clonorchis-sinensis': { name: '华支睾吸虫', aliases: ['华支睾吸虫', '肝吸虫', '肝吸虫病', '华支睾吸虫病', '肝吸虫感染', '华支睾吸虫感染'] },
  anisakis: { name: '异尖线虫', aliases: ['异尖线虫', '异尖线虫病', '异尖虫', '海兽胃线虫'] },
  'gnathostoma-spinigerum': { name: '棘颚口线虫', aliases: ['棘颚口线虫', '颚口线虫', '棘颚口线虫病', '颚口线虫病'] },
  'spirometra-mansoni': { name: '曼氏裂头蚴', aliases: ['曼氏裂头蚴', '裂头蚴', '裂头蚴病', '曼氏裂头绦虫', '裂头绦虫', '曼氏迭宫绦虫'] },
  'angiostrongylus-cantonensis': { name: '广州管圆线虫', aliases: ['广州管圆线虫', '管圆线虫', '广州管圆线虫病', '管圆线虫病'] },
  'paragonimus-westermani': { name: '卫氏并殖吸虫', aliases: ['卫氏并殖吸虫', '并殖吸虫', '肺吸虫', '肺吸虫病', '并殖吸虫病'] },
  'fasciolopsis-buski': { name: '布氏姜片吸虫', aliases: ['布氏姜片吸虫', '姜片虫', '姜片虫病', '姜片吸虫'] },
  'fasciola-gigantica': { name: '巨片形吸虫', aliases: ['巨片形吸虫', '片形吸虫', '肝片形吸虫', '片形吸虫病', '肝片吸虫'] },
  cryptosporidium: { name: '隐孢子虫', aliases: ['隐孢子虫', '隐孢子虫病', '隐孢子虫感染'] },
  'entamoeba-histolytica': { name: '溶组织内阿米巴', aliases: ['溶组织内阿米巴', '阿米巴', '阿米巴病', '溶组织阿米巴', '阿米巴痢疾'] },
  'ascaris-lumbricoides': { name: '蛔虫', aliases: ['蛔虫', '蛔虫病', '人蛔虫', '似蚓蛔线虫'] },
  'diphyllobothrium-latum': { name: '阔节裂头绦虫', aliases: ['阔节裂头绦虫', '鱼绦虫', '鱼阔节绦虫', '阔节裂头绦虫病'] },
  'giardia-lamblia': { name: '蓝氏贾第鞭毛虫', aliases: ['蓝氏贾第鞭毛虫', '贾第虫', '贾第鞭毛虫', '贾第虫病'] },
  echinostoma: { name: '棘口吸虫', aliases: ['棘口吸虫', '棘口吸虫病', '棘口科吸虫'] },
  sarcocystis: { name: '肉孢子虫', aliases: ['肉孢子虫', '肉孢子虫病', '猪人肉孢子虫', '人肉孢子虫'] },
};

/**
 * 常见错别字 / 同音误写容错表。
 * 用户口语输入中高频出现的错写（如“福寿罗”之于“福寿螺”、“弓型虫”之于“弓形虫”），
 * 并入对应实体的检索词；只收录高置信、无歧义的错写。
 */
const COMMON_ENTITY_TYPOS: { term: string; foodId?: string; parasiteId?: string }[] = [
  { term: '福寿罗', foodId: 'snail' },
  { term: '玛瑙罗', foodId: 'snail' },
  { term: '喇咕', foodId: 'crayfish' },
  { term: '荸齐', foodId: 'aquatic-plant' },
  { term: '孛荠', foodId: 'aquatic-plant' },
  { term: '管园线虫', parasiteId: 'angiostrongylus-cantonensis' },
  { term: '管原线虫', parasiteId: 'angiostrongylus-cantonensis' },
  { term: '弓型虫', parasiteId: 'toxoplasma-gondii' },
  { term: '裂头幼', parasiteId: 'spirometra-mansoni' },
  { term: '囊尾幼', parasiteId: 'taenia-solium' },
  { term: '旋毛线虫', parasiteId: 'trichinella-spiralis' },
  { term: '回虫', parasiteId: 'ascaris-lumbricoides' },
  { term: '隐孢虫', parasiteId: 'cryptosporidium' },
];

interface PrepTerm {
  tag: PreparationTag;
  term: string;
  weak?: boolean;
}

/** 处理方式的内置补充词（数据层 taxonomy aliases 亦会并入；weak 词仅在已识别食物时生效） */
const BUILTIN_PREPARATION_TERMS: PrepTerm[] = [
  { tag: 'raw', term: '生吃' },
  { tag: 'raw', term: '生食' },
  { tag: 'raw', term: '生的' },
  { tag: 'raw', term: '生鱼片' },
  { tag: 'raw', term: '刺身' },
  { tag: 'raw', term: '鱼生' },
  { tag: 'raw', term: '生腌' },
  { tag: 'raw', term: '生淹' },
  { tag: 'raw', term: '生呛' },
  { tag: 'raw', term: '凉拌生' },
  { tag: 'raw', term: '生吞' },
  { tag: 'raw', term: '现捞现吃' },
  { tag: 'raw', term: '生饮' },
  { tag: 'raw', term: '没煮' },
  { tag: 'raw', term: '没加热' },
  { tag: 'raw', term: '未加热' },
  { tag: 'raw', term: '冻吃' },
  { tag: 'raw', term: '生拌' },
  { tag: 'raw', term: '醉' },
  { tag: 'raw', term: '呛' },
  { tag: 'raw', term: '凉拌' },
  { tag: 'undercooked', term: '半生' },
  { tag: 'undercooked', term: '半熟' },
  { tag: 'undercooked', term: '不熟' },
  { tag: 'undercooked', term: '没熟' },
  { tag: 'undercooked', term: '未熟' },
  { tag: 'undercooked', term: '没熟透' },
  { tag: 'undercooked', term: '未熟透' },
  { tag: 'undercooked', term: '七分熟' },
  { tag: 'undercooked', term: '五分熟' },
  { tag: 'undercooked', term: '三分熟' },
  { tag: 'undercooked', term: '八分熟' },
  { tag: 'undercooked', term: '溏心' },
  { tag: 'undercooked', term: '涮' },
  { tag: 'undercooked', term: '涮火锅' },
  { tag: 'undercooked', term: '火锅涮' },
  { tag: 'undercooked', term: '打边炉' },
  { tag: 'undercooked', term: '生滚' },
  { tag: 'undercooked', term: '快炒' },
  { tag: 'undercooked', term: '爆炒' },
  { tag: 'undercooked', term: '微熟' },
  { tag: 'undercooked', term: '断生' },
  { tag: 'undercooked', term: '轻焯' },
  { tag: 'undercooked', term: '过水' },
  { tag: 'undercooked', term: '焯水' },
  { tag: 'undercooked', term: '短时加热' },
  { tag: 'undercooked', term: '微波加热' },
  { tag: 'undercooked', term: '烫', weak: true },
  { tag: 'cured-smoked', term: '腌制' },
  { tag: 'cured-smoked', term: '腊肉' },
  { tag: 'cured-smoked', term: '腊肠' },
  { tag: 'cured-smoked', term: '咸肉' },
  { tag: 'cured-smoked', term: '咸鱼' },
  { tag: 'cured-smoked', term: '烟熏' },
  { tag: 'cured-smoked', term: '熏制' },
  { tag: 'cured-smoked', term: '风干' },
  { tag: 'cured-smoked', term: '晒干' },
  { tag: 'cured-smoked', term: '火腿' },
  { tag: 'cured-smoked', term: '酸鱼' },
  { tag: 'cured-smoked', term: '腌', weak: true },
  { tag: 'grilled', term: '烧烤' },
  { tag: 'grilled', term: '烤串' },
  { tag: 'grilled', term: '烤肉' },
  { tag: 'grilled', term: '烤鱼' },
  { tag: 'grilled', term: '炭火' },
  { tag: 'grilled', term: '明火烤' },
  { tag: 'grilled', term: '烤', weak: true },
  { tag: 'fully-cooked', term: '全熟' },
  { tag: 'fully-cooked', term: '熟透' },
  { tag: 'fully-cooked', term: '煮熟' },
  { tag: 'fully-cooked', term: '煮透' },
  { tag: 'fully-cooked', term: '炖煮' },
  { tag: 'fully-cooked', term: '蒸熟' },
  { tag: 'fully-cooked', term: '炒熟' },
  { tag: 'fully-cooked', term: '煎熟' },
  { tag: 'fully-cooked', term: '烧熟' },
  { tag: 'fully-cooked', term: '滚熟' },
  { tag: 'fully-cooked', term: '熟的' },
  { tag: 'fully-cooked', term: '做熟' },
  { tag: 'fully-cooked', term: '熟食' },
  { tag: 'fully-cooked', term: '高温' },
  { tag: 'fully-cooked', term: '炖', weak: true },
  { tag: 'fully-cooked', term: '蒸', weak: true },
  { tag: 'fully-cooked', term: '焖', weak: true },
  { tag: 'fully-cooked', term: '水煮', weak: true },
  { tag: 'fully-cooked', term: '煮', weak: true },
  { tag: 'fully-cooked', term: '炒', weak: true },
  { tag: 'fully-cooked', term: '煎', weak: true },
  { tag: 'fully-cooked', term: '熟', weak: true },
  { tag: 'boiled-water', term: '煮沸' },
  { tag: 'boiled-water', term: '烧开' },
  { tag: 'boiled-water', term: '煮开' },
  { tag: 'boiled-water', term: '开水' },
  { tag: 'boiled-water', term: '白开水' },
  { tag: 'boiled-water', term: '凉白开' },
  { tag: 'boiled-water', term: '沸腾' },
  { tag: 'unwashed-produce', term: '没洗' },
  { tag: 'unwashed-produce', term: '未洗' },
  { tag: 'unwashed-produce', term: '没洗干净' },
  { tag: 'unwashed-produce', term: '不洗' },
  { tag: 'unwashed-produce', term: '不削皮' },
  { tag: 'unwashed-produce', term: '带皮吃' },
  { tag: 'unwashed-produce', term: '沙拉' },
];

/** 歧义食物表达 → 候选食物 id（仅当候选在当前知识库中存在时生效） */
const AMBIGUOUS_FOOD_TERMS: { term: string; foodIds: string[]; note: string }[] = [
  {
    term: '生鱼片',
    foodIds: ['freshwater-fish', 'marine-fish'],
    note: '“生鱼片”可能指淡水鱼生，也可能指海鱼刺身，两者主要风险寄生虫不同。',
  },
  {
    term: '刺身',
    foodIds: ['marine-fish', 'freshwater-fish'],
    note: '刺身通常指海鱼，但也有淡水鱼刺身；两者主要风险寄生虫不同。',
  },
  {
    term: '生腌',
    foodIds: ['shrimp', 'crab', 'other-aquatic'],
    note: '“生腌”既可能是虾、蟹，也可能是其他水产，处理不当都可能带来寄生虫风险。',
  },
  {
    term: '海鲜',
    foodIds: ['marine-fish', 'other-aquatic'],
    note: '“海鲜”涵盖鱼类、贝类等，不同种类风险来源不同。',
  },
];

/** 症状关键词组 → 规范化标签 */
const SYMPTOM_GROUPS: { label: string; keywords: string[] }[] = [
  { label: '腹痛', keywords: ['腹痛', '肚子痛', '肚子疼', '腹部疼痛', '肚疼', '胃痛'] },
  { label: '腹泻', keywords: ['腹泻', '拉肚子', '拉稀', '稀便', '水样便', '痢疾'] },
  { label: '恶心', keywords: ['恶心', '想吐', '反胃'] },
  { label: '呕吐', keywords: ['呕吐', '吐了', '干呕'] },
  { label: '发热', keywords: ['发热', '发烧', '低烧', '高烧', '体温升高', '发烧了'] },
  { label: '乏力', keywords: ['乏力', '没力气', '疲劳', '疲倦', '全身无力'] },
  { label: '头痛', keywords: ['头痛', '头疼', '头部胀痛'] },
  { label: '肌肉痛', keywords: ['肌肉痛', '肌肉酸痛', '全身酸痛', '肌痛', '肌肉疼'] },
  { label: '黄疸', keywords: ['黄疸', '皮肤发黄', '眼睛发黄', '巩膜黄染'] },
  { label: '皮下包块', keywords: ['皮下包块', '包块', '游走性肿块', '皮下结节', '结节'] },
  { label: '癫痫', keywords: ['癫痫', '抽搐', '抽风', '羊癫疯'] },
  { label: '咳嗽咯血', keywords: ['咯血', '咳血', '咳嗽', '血痰', '烂桃样痰', '胸痛'] },
  { label: '眼部症状', keywords: ['眼睛痛', '眼痛', '视力下降', '视力模糊', '眼部不适', '眼眶痛'] },
  { label: '肝区不适', keywords: ['肝区痛', '右上腹痛', '上腹不适', '腹胀', '食欲下降', '食欲不振'] },
  { label: '皮肤症状', keywords: ['皮疹', '荨麻疹', '皮肤瘙痒', '皮肤红肿'] },
  { label: '颈项强直', keywords: ['颈项强直', '脖子硬', '颈部僵硬'] },
  { label: '意识异常', keywords: ['意识模糊', '昏迷', '嗜睡', '神志不清'] },
  { label: '消瘦', keywords: ['消瘦', '体重下降', '暴瘦'] },
];

const PREVENTION_WORDS = ['预防', '避免', '防止', '注意什么', '怎么做才安全', '如何防范', '安全做法', '降低风险', '减少风险', '注意哪些', '怎样才安全', '怎么避免', '安全吗怎么办'];
/** 强预防意图词：即使已给出食物+做法，也以“预防”为主意图 */
const PREVENTION_STRONG_WORDS = ['怎么预防', '如何预防', '预防', '避免', '防止', '如何防范', '怎么做才安全', '怎样才安全', '怎么避免'];
const TREATMENT_WORDS = ['治疗', '怎么治', '如何治', '吃什么药', '用药', '药物', '能治好', '驱虫', '打虫', '就医', '看医生', '检查', '诊断', '需要吃药', '治好'];
const SYMPTOM_QUERY_WORDS = ['症状', '表现', '会怎样', '有什么反应', '后果', '危害', '严重吗', '要紧吗', '会得什么病', '会怎么样', '后遗症', '潜伏期'];
const KNOWLEDGE_WORDS = ['是什么', '什么是', '介绍', '科普', '生活史', '宿主', '怎么传播', '如何传播', '传播途径', '传播方式', '原理', '为什么', '原因', '属于', '分类', '种类', '知识'];
const REGION_WORDS = ['流行', '分布', '高发', '地区', '省份', '哪些地方', '哪些省', '哪里', '当地', '这里', '我们这', '疫情', '发病率', '多不多', '常见吗'];
const STRONG_REGION_WORDS = ['流行', '分布', '高发', '疫情', '发病率', '哪些地方', '哪些省', '哪些地区', '常见吗', '多不多'];
const SEASON_WORDS = ['季节', '几月', '哪个月', '什么时候', '高发期', '旺季', '月份', '季节高峰', '什么季节', '冬春', '夏秋'];
const STRONG_SEASON_WORDS = ['季节', '几月', '哪个月', '什么季节', '高发期', '月份', '季节高峰', '什么时候'];
const COMPARISON_WORDS = ['哪个', '哪一种', '谁更', '更危险', '风险更高', '更高', '区别', '差别', '不同', '对比', '相比', '还是', 'vs', '差多少', '相差', '差在哪', '谁的风险', '谁高谁低', '哪个高', '哪个低', '区别大吗', '比较'];
const RISK_WORDS = ['风险', '危险', '安全', '能吃', '可以吃', '会不会', '感染', '得病', '有事吗', '要紧吗', '严重吗', '有影响吗', '敢吃'];
const GREETING_WORDS = ['你好', '您好', 'hi', 'hello', '嗨', '哈喽', '在吗', '在不在', '早上好', '中午好', '下午好', '晚上好', '谢谢', '多谢', '感谢', '再见', '拜拜', 'bye'];
const OUT_OF_SCOPE_WORDS = [
  '天气', '气温', '股票', '基金', '房价', '编程', '代码', 'python', 'java', '写诗', '写一首', '作文', '翻译',
  '数学题', '微积分', '历史事件', '法律', '离婚', '恋爱', '星座', '游戏', '电影', '音乐', '减肥', '健身',
  '彩票', '比特币', '政治', '选举', '工资', '失业', '高考', '英语', '物理题', '化学题', '笑话', '唱歌',
  '旅游攻略', '酒店', '机票', '汽车', '手机推荐', '电脑配置',
];
const CRISIS_WORDS = ['自杀', '自残', '想死', '不想活', '轻生', '活不下去', '结束生命'];
const INJECTION_PATTERNS = [
  /忽略(之前|上面|以上|前面)?的?[^。！？]{0,6}(指令|提示|规则|设定)/,
  /忘记(之前|上面|以上)?的?[^。！？]{0,6}(指令|提示|设定|角色)/,
  /(system\s*prompt|系统提示词|提示词|prompt)/i,
  /(开发者模式|越狱|jailbreak|developer\s*mode)/i,
  /你(的)?(系统)?(指令|设定|规则)是什么/,
  /输出[^。！？]{0,8}(指令|设定|提示词)/,
  /扮演[^。！？]{0,10}(角色|ai|助手)/,
];

/* ========================================================================== */
/* 词典构建                                                                    */
/* ========================================================================== */

export interface FoodLexEntry {
  id: string;
  name: string;
  terms: string[];
  /** 当前知识库是否存在该食物实体 */
  resolved: boolean;
}

export interface ParasiteLexEntry {
  id: string;
  name: string;
  terms: string[];
  resolved: boolean;
}

export interface PreparationLexEntry extends PrepTerm {}

export interface RegionLexEntry {
  code: string;
  name: string;
  terms: string[];
}

export interface NluLexicon {
  foods: FoodLexEntry[];
  parasites: ParasiteLexEntry[];
  preparations: PreparationLexEntry[];
  regions: RegionLexEntry[];
  cities: { name: string; provinceCode: string; terms: string[] }[];
  /** 词 → 食物 id 反查 */
  foodTermIndex: Map<string, string[]>;
  parasiteTermIndex: Map<string, string[]>;
  regionTermIndex: Map<string, string[]>;
  cityTermIndex: Map<string, string[]>;
}

function addTerms(index: Map<string, string[]>, terms: string[], id: string): void {
  for (const term of new Set(terms)) {
    if (!term || term.length === 0) continue;
    const list = index.get(term);
    if (!list) index.set(term, [id]);
    else if (!list.includes(id)) list.push(id);
  }
}

/**
 * 根据知识库（数据层）构建 NLU 词典，并合并内置兜底词典。
 * 数据层实体存在时以数据层 name/aliases 为准，内置词作为补充（同一 id 合并去重）。
 */
export function buildLexicon(knowledge: RagKnowledge = {}): NluLexicon {
  const foods: FoodLexEntry[] = [];
  const parasites: ParasiteLexEntry[] = [];
  const foodTermIndex = new Map<string, string[]>();
  const parasiteTermIndex = new Map<string, string[]>();

  const dataFoods = new Map<string, Food>((knowledge.foods ?? []).map((f) => [f.id, f]));
  for (const [id, builtin] of Object.entries(BUILTIN_FOOD_ALIASES)) {
    const food = dataFoods.get(id);
    const terms = uniq([
      builtin.name,
      ...(food ? [food.name, ...(food.aliases ?? [])] : []),
      ...builtin.aliases,
    ]);
    foods.push({ id, name: food?.name ?? builtin.name, terms, resolved: Boolean(food) });
    addTerms(foodTermIndex, terms, id);
  }
  for (const food of knowledge.foods ?? []) {
    if (foods.some((f) => f.id === food.id)) continue;
    const terms = uniq([food.name, ...(food.aliases ?? [])]);
    foods.push({ id: food.id, name: food.name, terms, resolved: true });
    addTerms(foodTermIndex, terms, food.id);
  }

  const dataParasites = new Map((knowledge.parasites ?? []).map((p) => [p.id, p]));
  for (const [id, builtin] of Object.entries(BUILTIN_PARASITES)) {
    const parasite = dataParasites.get(id);
    const terms = uniq([
      builtin.name,
      ...(parasite ? [parasite.name, ...(parasite.aliases ?? [])] : []),
      ...builtin.aliases,
    ]);
    parasites.push({ id, name: parasite?.name ?? builtin.name, terms, resolved: Boolean(parasite) });
    addTerms(parasiteTermIndex, terms, id);
  }
  for (const parasite of knowledge.parasites ?? []) {
    if (parasites.some((p) => p.id === parasite.id)) continue;
    const terms = uniq([parasite.name, ...(parasite.aliases ?? []), parasite.latinName].filter(Boolean));
    parasites.push({ id: parasite.id, name: parasite.name, terms, resolved: true });
    addTerms(parasiteTermIndex, terms, parasite.id);
  }

  /* 处理方式：数据层 aliases（强词） + 内置强/弱词 */
  const preparations: PreparationLexEntry[] = [];
  const seenPrep = new Set<string>();
  const pushPrep = (entry: PrepTerm) => {
    const key = `${entry.tag}:${entry.term}`;
    if (seenPrep.has(key)) return;
    seenPrep.add(key);
    preparations.push(entry);
  };
  const taxonomy: Taxonomy | undefined = knowledge.taxonomy;
  for (const meta of taxonomy?.preparations ?? []) {
    for (const alias of meta.aliases ?? []) pushPrep({ tag: meta.id, term: alias });
  }
  for (const entry of BUILTIN_PREPARATION_TERMS) pushPrep(entry);

  /* 地区：数据层优先 + 省级静态表兜底 */
  const regions: RegionLexEntry[] = [];
  const regionTermIndex = new Map<string, string[]>();
  const dataRegions = new Map((knowledge.regions ?? []).map((r) => [r.code, r]));
  for (const province of PROVINCES) {
    const region = dataRegions.get(province.code);
    const terms = uniq([
      province.name,
      province.shortName,
      ...province.aliases,
      ...(region ? [region.name, region.shortName, ...(region.aliases ?? [])] : []),
    ]);
    regions.push({ code: province.code, name: region?.name ?? province.name, terms });
    addTerms(regionTermIndex, terms, province.code);
  }
  for (const region of knowledge.regions ?? []) {
    if (regions.some((r) => r.code === region.code)) continue;
    const terms = uniq([region.name, region.shortName, ...(region.aliases ?? [])]);
    regions.push({ code: region.code, name: region.name, terms });
    addTerms(regionTermIndex, terms, region.code);
  }

  /* 城市 → 省份 */
  const citySource = mergeFallbackCities(
    knowledge.cities?.length ? knowledge.cities : loadCitiesFromData(),
  );
  const cities: NluLexicon['cities'] = [];
  const cityTermIndex = new Map<string, string[]>();
  const seenCity = new Set<string>();
  for (const city of citySource) {
    if (!city?.name || !city.provinceCode || seenCity.has(city.name)) continue;
    seenCity.add(city.name);
    const terms = uniq([city.name, ...(city.aliases ?? [])]);
    cities.push({ name: city.name, provinceCode: city.provinceCode, terms });
    addTerms(cityTermIndex, terms, city.provinceCode);
  }

  /* 常见错别字/误写容错:并入实体检索词索引 */
  for (const typo of COMMON_ENTITY_TYPOS) {
    if (typo.foodId) addTerms(foodTermIndex, [typo.term], typo.foodId);
    if (typo.parasiteId) addTerms(parasiteTermIndex, [typo.term], typo.parasiteId);
  }

  return {
    foods,
    parasites,
    preparations,
    regions,
    cities,
    foodTermIndex,
    parasiteTermIndex,
    regionTermIndex,
    cityTermIndex,
  };
}

/* ========================================================================== */
/* 上下文工具                                                                  */
/* ========================================================================== */

export function emptyContext(): ChatContext {
  return {
    provinceCodes: [],
    months: [],
    foodIds: [],
    preparationTags: [],
    parasiteIds: [],
    exposure: 'unknown',
    symptoms: [],
  };
}

const PREP_TAGS: PreparationTag[] = [
  'raw',
  'undercooked',
  'cured-smoked',
  'grilled',
  'fully-cooked',
  'boiled-water',
  'unwashed-produce',
  'unknown',
];

/** 清洗外部传入的上下文（客户端 context / 上一轮 context），丢弃非法字段 */
export function normalizeContext(input?: Partial<ChatContext> | null): ChatContext {
  const base = emptyContext();
  if (!input || typeof input !== 'object') return base;
  const provinceCodes = Array.isArray(input.provinceCodes)
    ? uniq(input.provinceCodes.filter((c): c is string => typeof c === 'string' && /^\d{6}$/.test(c)))
    : [];
  const months = Array.isArray(input.months)
    ? uniq(input.months.filter((m): m is number => Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 12)).sort((a, b) => a - b)
    : [];
  const foodIds = Array.isArray(input.foodIds) ? uniq(input.foodIds.filter((x): x is string => typeof x === 'string')) : [];
  const preparationTags = Array.isArray(input.preparationTags)
    ? uniq(input.preparationTags.filter((t): t is PreparationTag => PREP_TAGS.includes(t as PreparationTag)))
    : [];
  const parasiteIds = Array.isArray(input.parasiteIds)
    ? uniq(input.parasiteIds.filter((x): x is string => typeof x === 'string'))
    : [];
  const symptoms = Array.isArray(input.symptoms)
    ? uniq(input.symptoms.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)).slice(0, 20)
    : [];
  const exposure =
    input.exposure === 'before' || input.exposure === 'after' || input.exposure === 'unknown'
      ? input.exposure
      : 'unknown';
  const timeExpression =
    typeof input.timeExpression === 'string' && input.timeExpression.trim()
      ? input.timeExpression.trim().slice(0, 50)
      : undefined;
  return { provinceCodes, months, foodIds, preparationTags, parasiteIds, exposure, symptoms, ...(timeExpression ? { timeExpression } : {}) };
}

/** 两个上下文的“是否有内容”判断（用于追问/继承） */
export function contextHasConditions(context: Partial<ChatContext> | null | undefined): boolean {
  if (!context) return false;
  return Boolean(
    context.provinceCodes?.length ||
      context.months?.length ||
      context.foodIds?.length ||
      context.preparationTags?.length ||
      context.parasiteIds?.length ||
      context.symptoms?.length ||
      (context.exposure && context.exposure !== 'unknown'),
  );
}

/* ========================================================================== */
/* 主入口                                                                      */
/* ========================================================================== */

export interface AnalyzeOptions {
  now?: Date;
  lexicon?: NluLexicon;
  previousContext?: Partial<ChatContext> | null;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

const MAX_INPUT_LENGTH = 1000;

/** 季节词 → 月份映射（春 3–5、夏 6–8、秋 9–11、冬 12/1/2） */
const SEASON_TERMS: { term: string; months: number[] }[] = [
  { term: '春节', months: [1, 2] },
  { term: '过年', months: [1, 2] },
  { term: '初春', months: [3] },
  { term: '早春', months: [3] },
  { term: '春末', months: [5] },
  { term: '晚春', months: [5] },
  { term: '暮春', months: [5] },
  { term: '春天', months: [3, 4, 5] },
  { term: '春季', months: [3, 4, 5] },
  { term: '春', months: [3, 4, 5] },
  { term: '初夏', months: [6] },
  { term: '盛夏', months: [7] },
  { term: '夏末', months: [8] },
  { term: '夏天', months: [6, 7, 8] },
  { term: '夏季', months: [6, 7, 8] },
  { term: '夏', months: [6, 7, 8] },
  { term: '初秋', months: [9] },
  { term: '早秋', months: [9] },
  { term: '秋末', months: [10, 11] },
  { term: '深秋', months: [10, 11] },
  { term: '晚秋', months: [10, 11] },
  { term: '秋天', months: [9, 10, 11] },
  { term: '秋季', months: [9, 10, 11] },
  { term: '秋', months: [9, 10, 11] },
  { term: '初冬', months: [12] },
  { term: '入冬', months: [12] },
  { term: '深冬', months: [1] },
  { term: '隆冬', months: [1] },
  { term: '冬天', months: [12, 1, 2] },
  { term: '冬季', months: [12, 1, 2] },
  { term: '冬', months: [12, 1, 2] },
  { term: '春夏', months: [3, 4, 5, 6] },
  { term: '秋冬', months: [9, 10, 11, 12] },
  { term: '冬春', months: [12, 1, 2, 3] },
  { term: '夏秋', months: [6, 7, 8, 9] },
];

const NEGATION_PREFIXES = ['不是', '不吃', '没吃', '没有', '没喝', '不喝', '不敢', '不会', '不想', '不能', '不打算', '从来不', '从未', '未曾', '别', '勿', '无需', '不用'];

/** 提取食物 */
function extractFoods(text: string, lexicon: NluLexicon, mentions: NluMention[]): { foodIds: string[]; ambiguousFoods: AmbiguousFood[] } {
  const foodIds: string[] = [];
  const seenMention = new Set<string>();
  const allTerms = [...lexicon.foodTermIndex.keys()];
  const hits = findKeywords(text, allTerms);
  for (const hit of hits) {
    const ids = lexicon.foodTermIndex.get(hit.keyword) ?? [];
    for (const id of ids) {
      const entry = lexicon.foods.find((f) => f.id === id);
      if (!entry) continue;
      if (!foodIds.includes(id)) foodIds.push(id);
      const key = `${hit.keyword}:${id}`;
      if (!seenMention.has(key)) {
        seenMention.add(key);
        mentions.push({ type: 'food', text: hit.keyword, id, canonical: entry.name, resolved: entry.resolved });
      }
    }
  }

  /* 歧义表达：候选存在于知识库、且没有被更具体的食物表达消歧时才提示 */
  const ambiguousFoods: AmbiguousFood[] = [];
  const otherMatchedIds = (term: string): string[] => {
    const ids: string[] = [];
    for (const hit of hits) {
      if (hit.keyword === term) continue;
      for (const id of lexicon.foodTermIndex.get(hit.keyword) ?? []) if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  for (const item of AMBIGUOUS_FOOD_TERMS) {
    if (!text.includes(item.term)) continue;
    const candidates = item.foodIds
      .map((id) => lexicon.foods.find((f) => f.id === id))
      .filter((f): f is FoodLexEntry => Boolean(f && f.resolved));
    if (candidates.length < 2) continue;
    /* 若同一句中另有更具体的食物词明确指向某个候选，则视为已消歧 */
    const disambiguating = otherMatchedIds(item.term).filter((id) =>
      candidates.some((c) => c.id === id),
    );
    if (disambiguating.length > 0) continue;
    ambiguousFoods.push({
      text: item.term,
      candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
      note: item.note,
    });
    for (const candidate of candidates) {
      if (!foodIds.includes(candidate.id)) foodIds.push(candidate.id);
      mentions.push({ type: 'food', text: item.term, id: candidate.id, canonical: candidate.name, resolved: true });
    }
  }

  /* 数据别名交叉重叠造成的歧义（例如数据层把同一别名挂在两个食物下） */
  for (const hit of hits) {
    const ids = lexicon.foodTermIndex.get(hit.keyword) ?? [];
    if (ids.length < 2) continue;
    if (ambiguousFoods.some((a) => a.text === hit.keyword)) continue;
    const candidates = ids
      .map((id) => lexicon.foods.find((f) => f.id === id))
      .filter((f): f is FoodLexEntry => Boolean(f && f.resolved))
      .map((f) => ({ id: f.id, name: f.name }));
    if (candidates.length < 2) continue;
    ambiguousFoods.push({
      text: hit.keyword,
      candidates,
      note: `“${hit.keyword}”可能对应多种食物，需要确认具体是哪一种。`,
    });
  }

  return { foodIds: uniq(foodIds), ambiguousFoods };
}

/** 提取寄生虫 */
function extractParasites(text: string, lexicon: NluLexicon, mentions: NluMention[]): string[] {
  const ids: string[] = [];
  const hits = findKeywords(text, [...lexicon.parasiteTermIndex.keys()]);
  for (const hit of hits) {
    for (const id of lexicon.parasiteTermIndex.get(hit.keyword) ?? []) {
      const entry = lexicon.parasites.find((p) => p.id === id);
      if (!entry) continue;
      if (!ids.includes(id)) ids.push(id);
      mentions.push({ type: 'parasite', text: hit.keyword, id, canonical: entry.name, resolved: entry.resolved });
    }
  }
  return uniq(ids);
}

/** 提取地区（省名/简称/别名 + 城市名） */
/**
 * 遮蔽文本中被食物/寄生虫实体占据的片段（保持长度与索引不变），供地区抽取使用。
 * 避免实体名中的地名被误识别为地区条件，例如“广州管圆线虫”中的“广州”。
 * 索引与 String.prototype.indexOf 一致（UTF-16 码元），与 findKeywords 返回的 index 对齐。
 */
function maskEntitySpans(text: string, lexicon: NluLexicon): string {
  const hits = [
    ...findKeywords(text, [...lexicon.foodTermIndex.keys()]),
    ...findKeywords(text, [...lexicon.parasiteTermIndex.keys()]),
  ];
  if (hits.length === 0) return text;
  const mask = new Array<boolean>(text.length).fill(false);
  for (const hit of hits) {
    for (let i = hit.index; i < hit.index + hit.keyword.length && i < text.length; i += 1) {
      mask[i] = true;
    }
  }
  let out = '';
  for (let i = 0; i < text.length; i += 1) out += mask[i] ? '\u0000' : text[i];
  return out;
}

function extractRegions(
  text: string,
  lexicon: NluLexicon,
  mentions: NluMention[],
): { provinceCodes: string[]; matched: string[] } {
  const codes: string[] = [];
  const matched: string[] = [];
  const hits = findKeywords(text, [...lexicon.regionTermIndex.keys()]);
  for (const hit of hits) {
    for (const code of lexicon.regionTermIndex.get(hit.keyword) ?? []) {
      if (!codes.includes(code)) codes.push(code);
      matched.push(hit.keyword);
      mentions.push({ type: 'province', text: hit.keyword, id: code, canonical: provinceDisplayName(code), resolved: true });
    }
  }
  const cityHits = findKeywords(text, [...lexicon.cityTermIndex.keys()]);
  for (const hit of cityHits) {
    for (const code of lexicon.cityTermIndex.get(hit.keyword) ?? []) {
      if (codes.includes(code)) continue;
      codes.push(code);
      matched.push(hit.keyword);
      mentions.push({ type: 'city', text: hit.keyword, id: code, canonical: provinceDisplayName(code), resolved: true });
    }
  }
  /* 6 位 adcode 直接识别 */
  for (const rawCode of text.match(/(?<!\d)\d{6}(?!\d)/g) ?? []) {
    if (PROVINCES.some((p) => p.code === rawCode) && !codes.includes(rawCode)) {
      codes.push(rawCode);
      matched.push(rawCode);
    }
  }
  return { provinceCodes: uniq(codes), matched: uniq(matched) };
}

function monthOf(date: Date): number {
  return date.getMonth() + 1;
}

function shiftMonth(now: Date, offset: number): number {
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).getMonth() + 1;
}

function shiftDayMonth(now: Date, offset: number): number {
  return monthOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

/** 提取月份与时间表达（相对时间以 now 计算） */
function extractTime(
  text: string,
  now: Date,
  mentions: NluMention[],
): { months: number[]; timeExpression?: string; seasonal: boolean } {
  const months = new Set<number>();
  const expressions: string[] = [];
  let seasonal = false;
  const push = (month: number, expression: string) => {
    if (Number.isInteger(month) && month >= 1 && month <= 12) months.add(month);
    const expr = expression.trim();
    if (expr && !expressions.includes(expr)) expressions.push(expr);
    if (expr) mentions.push({ type: 'time', text: expr });
  };
  const addRange = (from: number, to: number, expression: string) => {
    if (from < 1 || from > 12 || to < 1 || to > 12) return;
    if (from <= to) for (let m = from; m <= to; m += 1) push(m, expression);
    else {
      for (let m = from; m <= 12; m += 1) push(m, expression);
      for (let m = 1; m <= to; m += 1) push(m, expression);
    }
  };

  /* 1) 数字月份与范围（半角数字已在 normalize 中处理） */
  const consumed: { start: number; end: number }[] = [];
  const rangeRegex = /(\d{1,2})\s*[-~～—到至]\s*(\d{1,2})\s*月(?:份)?/g;
  for (const m of text.matchAll(rangeRegex)) {
    const index = m.index ?? 0;
    addRange(Number(m[1]), Number(m[2]), m[0]);
    consumed.push({ start: index, end: index + m[0].length });
    seasonal = true;
  }
  const monthRegex = /(\d{1,2})\s*月(?:份)?/g;
  for (const m of text.matchAll(monthRegex)) {
    const index = m.index ?? 0;
    if (consumed.some((span) => index >= span.start && index < span.end)) continue;
    push(Number(m[1]), m[0]);
    seasonal = true;
  }
  /* 中文数字月份：“三月”“十一月”“三到五月” */
  const cnRangeRegex = /([一二三四五六七八九十]{1,3})\s*[-~～—到至]\s*([一二三四五六七八九十]{1,3})\s*月(?:份)?/g;
  for (const m of text.matchAll(cnRangeRegex)) {
    const from = chineseNumberToInt(m[1] ?? '');
    const to = chineseNumberToInt(m[2] ?? '');
    const index = m.index ?? 0;
    if (from && to) {
      addRange(from, to, m[0]);
      consumed.push({ start: index, end: index + m[0].length });
      seasonal = true;
    }
  }
  const cnMonthRegex = /([一二三四五六七八九十]{1,3})\s*月(?:份)?/g;
  for (const m of text.matchAll(cnMonthRegex)) {
    const index = m.index ?? 0;
    if (consumed.some((span) => index >= span.start && index < span.end)) continue;
    const month = chineseNumberToInt(m[1] ?? '');
    if (month) {
      push(month, m[0]);
      seasonal = true;
    }
  }

  /* 2) 相对月份 */
  const relativeMonthTerms: { terms: string[]; month: () => number }[] = [
    { terms: ['下个月', '下月'], month: () => shiftMonth(now, 1) },
    { terms: ['上个月', '上月'], month: () => shiftMonth(now, -1) },
    { terms: ['这个月', '本月', '当月', '这月'], month: () => monthOf(now) },
    { terms: ['去年这个时候'], month: () => monthOf(now) },
  ];
  for (const item of relativeMonthTerms) {
    for (const term of item.terms) {
      if (text.includes(term)) {
        push(item.month(), term);
        seasonal = true;
      }
    }
  }

  /* 3) 季节词（长词优先、互不重叠） */
  const seasonHits = findKeywords(text, SEASON_TERMS.map((s) => s.term));
  for (const hit of seasonHits) {
    const season = SEASON_TERMS.find((s) => s.term === hit.keyword);
    if (!season) continue;
    for (const month of season.months) push(month, hit.keyword);
    seasonal = true;
  }

  /* 4) 近期/就诊时间（作为暴露时间或季节上下文） */
  const relativeDays: { terms: string[]; offset: number }[] = [
    { terms: ['今天', '今日', '刚才', '刚刚', '今早', '今晚', '这周', '本周', '周末', '这周末'], offset: 0 },
    { terms: ['昨天', '昨日', '昨晚'], offset: -1 },
    { terms: ['前天'], offset: -2 },
    { terms: ['大前天'], offset: -3 },
    { terms: ['前几天', '前两天', '最近', '近期', '这几天', '这段时间', '这些天'], offset: 0 },
    { terms: ['上周', '上周末', '上个星期', '上星期'], offset: 0 },
  ];
  for (const item of relativeDays) {
    for (const term of item.terms) {
      if (text.includes(term)) push(shiftDayMonth(now, item.offset), term);
    }
  }
  /* 5) 纯年份等时间表达（不一定推出月份） */
  for (const term of ['去年', '今年', '明年', '前年', '这周', '下周', '下个星期']) {
    if (text.includes(term) && !expressions.includes(term)) expressions.push(term);
  }

  const sorted = [...months].sort((a, b) => a - b);
  return {
    months: sorted,
    ...(expressions.length ? { timeExpression: expressions.slice(0, 3).join('、') } : {}),
    seasonal,
  };
}

/** 提取处理方式（含否定处理、弱词门控、水/煮沸特例） */
function extractPreparations(
  text: string,
  foodIds: string[],
  lexicon: NluLexicon,
  mentions: NluMention[],
  negationNotes: string[],
): PreparationTag[] {
  const terms = lexicon.preparations.map((p) => p.term);
  const hits = findKeywords(text, terms);
  const foodContext = foodIds.length > 0;
  const tags: PreparationTag[] = [];
  const tagLabels = new Map<PreparationTag, string>();

  for (const hit of hits) {
    const entries = lexicon.preparations.filter((p) => p.term === hit.keyword);
    for (const entry of entries) {
      if (entry.weak && !foodContext) continue;
      const before = text.slice(Math.max(0, hit.index - 4), hit.index);
      const negated = NEGATION_PREFIXES.some((prefix) => before.endsWith(prefix));
      if (negated) {
        if (entry.tag === 'raw') {
          const note = `检测到否定表达「…${before.slice(-2)}${hit.keyword}」：不按生食处理。`;
          if (!negationNotes.includes(note)) negationNotes.push(note);
        } else {
          const note = `检测到否定表达「…${before.slice(-2)}${hit.keyword}」。`;
          if (!negationNotes.includes(note)) negationNotes.push(note);
        }
        continue;
      }
      if (!tags.includes(entry.tag)) tags.push(entry.tag);
      if (!tagLabels.has(entry.tag)) tagLabels.set(entry.tag, hit.keyword);
      if (!mentions.some((m) => m.type === 'preparation' && m.id === entry.tag && m.text === hit.keyword)) {
        mentions.push({ type: 'preparation', text: hit.keyword, id: entry.tag, canonical: entry.tag });
      }
    }
  }

  /* 语境规则补充：典型菜名/做法 */
  const contextual: { regex: RegExp; tag: PreparationTag; label: string }[] = [
    { regex: /(生腌|酒腌|糟醉|醉制)/, tag: 'raw', label: '生腌/醉制' },
    { regex: /(生水|生饮|没煮沸|未煮沸|直接喝)/, tag: 'raw', label: '生水/未煮沸' },
    { regex: /(涮|烫|生滚|打边炉)/, tag: 'undercooked', label: '涮/烫' },
    { regex: /(七分熟|五分熟|三分熟|溏心)/, tag: 'undercooked', label: '欠火候' },
    { regex: /(全熟|熟透|煮透|滚熟)/, tag: 'fully-cooked', label: '全熟' },
    { regex: /(烧开|煮开|煮沸|开水|白开水|凉白开)/, tag: 'boiled-water', label: '煮沸' },
  ];
  for (const rule of contextual) {
    if (rule.regex.test(text) && !tags.includes(rule.tag)) tags.push(rule.tag);
  }

  /* 水/饮品特例：以“煮沸/未煮沸”作为处理方式，避免“水煮”等词误判 */
  const isWater = foodIds.includes('drinking-water');
  if (isWater && tags.includes('boiled-water')) {
    return ['boiled-water'];
  }

  /* 按 taxonomy 顺序排序 */
  return PREP_TAGS.filter((tag) => tags.includes(tag));
}

/** 提取暴露状态 */
function extractExposure(text: string): { exposure: ChatContext['exposure']; note?: string } {
  const beforePatterns = [
    /(准备|打算|计划|想要|想吃|要吃|准备吃|马上吃|今晚吃|周末吃|下次吃)/,
    /(还没吃|没吃过|没吃|不敢吃|不想吃|不打算)/,
    /(能不能吃|可以吃吗|能吃吗|安全吗|有风险吗|会不会感染|会得病吗|有没有风险|敢吃吗|可以吃么|能不能食用)/,
  ];
  const afterPatterns = [
    /(吃了|喝过|吃过|生吃过|误食|吞下|咽下|下肚|刚吃|已经吃|才吃|吃下去|喝下去)/,
    /(昨天吃|前天吃|昨晚吃|今天吃|今早吃|中午吃|晚上吃|前几天吃|最近吃|刚才吃)/,
    /\b(ate|eaten|drank|drunk|consumed|swallowed)\b/,
  ];
  const negatedAfter = /(没吃|还没吃|没喝|还没喝|没有吃|没有喝)/.test(text);
  if (negatedAfter && !afterPatterns.some((p) => p.test(text.replace(/(没吃|还没吃|没喝|还没喝|没有吃|没有喝)/g, '')))) {
    return { exposure: 'before', note: '用户明确表示尚未食用。' };
  }
  if (afterPatterns.some((p) => p.test(text))) return { exposure: 'after' };
  if (beforePatterns.some((p) => p.test(text))) return { exposure: 'before' };
  return { exposure: 'unknown' };
}

/** 提取症状（规范化标签） */
function extractSymptoms(text: string, mentions: NluMention[]): string[] {
  const labels: string[] = [];
  for (const group of SYMPTOM_GROUPS) {
    const hits = findKeywords(text, group.keywords);
    if (hits.length === 0) continue;
    labels.push(group.label);
    for (const hit of hits) mentions.push({ type: 'symptom', text: hit.keyword, canonical: group.label });
  }
  return uniq(labels);
}

/** 判断是否追问/改变条件 */
function detectFollowUp(
  text: string,
  hasPrevious: boolean,
  previousContext?: Partial<ChatContext> | null,
  hasNewEntity = false,
): boolean {
  const markers = [
    /(换一种|换一个|换成|换个做法|换做法|改一种)/,
    /(那如果|如果.{0,8}(呢|会|是不是|能不能))/,
    /(还有呢|还有吗|然后呢|继续|接下来|另外|再问|顺便)/,
    /(那在|在那|在.{1,8}呢|呢[?？]?$)/,
    /(同上|同样|也是|对比一下|比较一下)/,
    /^(那|那么|所以|还有|继续|另外)/,
  ];
  if (markers.some((re) => re.test(text))) return true;
  if (!hasPrevious || hasNewEntity) return false;
  if (text.length <= 16 && contextHasConditions(previousContext)) {
    /* 短句、且没有提出新的食物/寄生虫实体：视为对上一轮问题的补充/追问 */
    return /[？?]?$/.test(text) && !/(你好|谢谢|再见)/.test(text);
  }
  return false;
}

/** 判断问题形式 */
function detectQuestionForm(text: string): QuestionForm {
  if (!text) return 'none';
  if (/(什么|怎么|怎样|为什么|为何|哪些|哪里|哪个|如何|多少|多久|几种|哪几|谁)/.test(text)) return 'wh';
  if (/(吗|么|呢[?？]?$|是不是|能不能|可不可以|会不会|有没有|要不要|安全不安全|风险大不大)/.test(text)) return 'yes-no';
  if (/[?？]/.test(text)) return 'wh';
  return 'statement';
}

/** 提取对比结构（A 和 B 哪个风险高） */
function extractComparison(text: string, lexicon: NluLexicon): ComparisonSpec | null {
  if (!COMPARISON_WORDS.some((word) => text.includes(word))) return null;
  const separators = ['和', '与', '跟', '比', '还是', 'vs', '、', '对比', '相比'];
  const split = splitBySeparators(text.replace(/^[，,。！？\s]+/, ''), separators);
  if (!split) return null;
  const clean = (part: string): string =>
    part
      .replace(/^(那|那么|如果|要是|请问|我想问|想问|想知道|哪个|哪一种|谁)+/g, '')
      .replace(/(哪个|哪一个|谁|更危险|风险更高|更高|更安全|更安全一些|风险大|风险|区别大吗|区别|差别|不同|差多少|相差|差在哪|多少|怎么样|如何|会更|比较|高|低|大|小|吗).*$/g, '')
      .replace(/[，,。！？?？\s]+$/g, '')
      .trim();
  const left = clean(split.left);
  const right = clean(split.right);
  if (!left || !right) return null;

  const pickFoods = (part: string): string[] => {
    const ids: string[] = [];
    for (const hit of findKeywords(part, [...lexicon.foodTermIndex.keys()])) {
      for (const id of lexicon.foodTermIndex.get(hit.keyword) ?? []) if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  const pickParasites = (part: string): string[] => {
    const ids: string[] = [];
    for (const hit of findKeywords(part, [...lexicon.parasiteTermIndex.keys()])) {
      for (const id of lexicon.parasiteTermIndex.get(hit.keyword) ?? []) if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  const pickPreps = (part: string): PreparationTag[] => {
    const tags: PreparationTag[] = [];
    for (const hit of findKeywords(part, lexicon.preparations.map((p) => p.term))) {
      for (const entry of lexicon.preparations.filter((p) => p.term === hit.keyword)) {
        if (!tags.includes(entry.tag)) tags.push(entry.tag);
      }
    }
    return tags;
  };

  const leftFoodIds = pickFoods(left);
  const rightFoodIds = pickFoods(right);
  const leftParasiteIds = pickParasites(left);
  const rightParasiteIds = pickParasites(right);
  const leftPreparationTags = pickPreps(left);
  const rightPreparationTags = pickPreps(right);

  const hasFood = leftFoodIds.length > 0 || rightFoodIds.length > 0;
  const hasPrep = leftPreparationTags.length > 0 || rightPreparationTags.length > 0;
  const hasParasite = leftParasiteIds.length > 0 || rightParasiteIds.length > 0;
  if (!hasFood && !hasPrep && !hasParasite) return null;

  const prepDelta =
    leftPreparationTags.join(',') !== rightPreparationTags.join(',') &&
    (leftPreparationTags.length > 0 || rightPreparationTags.length > 0);
  let dimension: ComparisonDimension = 'mixed';
  if (leftParasiteIds.length && rightParasiteIds.length) dimension = 'parasite';
  else if (hasFood && !prepDelta) dimension = 'food';
  else if (prepDelta) dimension = 'preparation';
  else if (hasFood) dimension = 'food';

  return {
    left,
    right,
    dimension,
    leftFoodIds,
    rightFoodIds,
    leftPreparationTags,
    rightPreparationTags,
    leftParasiteIds,
    rightParasiteIds,
  };
}

/** 主函数：分析一条用户消息 */
export function analyzeMessage(message: string, options: AnalyzeOptions = {}): NluResult {
  const now = options.now ?? new Date();
  const lexicon = options.lexicon ?? buildLexicon({});
  const previousContext = options.previousContext ?? null;
  const history = options.history ?? [];

  const rawClipped = truncateText(typeof message === 'string' ? message : '', MAX_INPUT_LENGTH);
  const rawText = rawClipped.text;
  const normalizedText = normalizeText(rawText);
  const meaningful = hasMeaningfulContent(normalizedText);

  const mentions: NluMention[] = [];
  const negationNotes: string[] = [];
  const notes: string[] = [];
  if (rawClipped.truncated) notes.push(`输入超过 ${MAX_INPUT_LENGTH} 字，已截断后解析。`);

  if (!meaningful) {
    return {
      context: emptyContext(),
      intents: ['out-of-scope'],
      primaryIntent: 'out-of-scope',
      secondaryIntents: [],
      ambiguousFoods: [],
      mentions,
      negationNotes,
      notes: [...notes, '输入中没有可识别的文字内容。'],
      rawText,
      normalizedText,
      truncated: rawClipped.truncated,
      isFollowUp: false,
      questionForm: 'none',
      comparison: null,
      signals: {
        risk: false, prevention: false, preventionStrong: false, treatment: false, symptomQuery: false,
        knowledge: false, region: false, season: false, comparison: false, greeting: false,
        outOfScope: true, crisis: false, injection: false,
      },
      safety: null,
    };
  }

  /* ---------- 安全检查 ---------- */
  const crisis = CRISIS_WORDS.some((word) => normalizedText.includes(word));
  const injection = INJECTION_PATTERNS.some((re) => re.test(normalizedText));

  /* ---------- 实体抽取 ---------- */
  const { foodIds, ambiguousFoods } = extractFoods(normalizedText, lexicon, mentions);
  const parasiteIds = extractParasites(normalizedText, lexicon, mentions);
  /* 地区抽取前先遮蔽食物/寄生虫实体占据的文本段，避免实体名中的地名被误抽为地区条件 */
  const regionResult = extractRegions(maskEntitySpans(normalizedText, lexicon), lexicon, mentions);
  const timeResult = extractTime(normalizedText, now, mentions);
  const symptoms = extractSymptoms(normalizedText, mentions);
  const preparationTags = extractPreparations(normalizedText, foodIds, lexicon, mentions, negationNotes);
  const exposureResult = extractExposure(normalizedText);
  if (exposureResult.note) notes.push(exposureResult.note);
  const comparison = extractComparison(normalizedText, lexicon);

  /* ---------- 意图信号 ---------- */
  const has = (words: string[]) => words.some((word) => normalizedText.includes(word));
  const signals: NluSignals = {
    risk: has(RISK_WORDS),
    prevention: has(PREVENTION_WORDS),
    preventionStrong: has(PREVENTION_STRONG_WORDS),
    treatment: has(TREATMENT_WORDS),
    symptomQuery: has(SYMPTOM_QUERY_WORDS),
    knowledge: has(KNOWLEDGE_WORDS),
    region: has(REGION_WORDS) || regionResult.provinceCodes.length > 0,
    season: has(SEASON_WORDS) || timeResult.seasonal,
    comparison: comparison != null,
    greeting: false,
    outOfScope: false,
    crisis,
    injection,
  };

  /* 问候语仅当去掉问候词后没有其他内容 */
  let greetingOnly = false;
  {
    let rest = normalizedText;
    for (const word of GREETING_WORDS) rest = rest.split(word).join(' ');
    rest = rest.replace(/[\s,，。！？!?~～、.…]+/g, '');
    greetingOnly = rest.length === 0 && normalizedText.length > 0;
  }
  signals.greeting = greetingOnly;

  /* 超范围：命中无关领域词，且没有任何食源性寄生虫相关实体/症状 */
  const inScopeEntity =
    foodIds.length > 0 ||
    parasiteIds.length > 0 ||
    regionResult.provinceCodes.length > 0 ||
    preparationTags.length > 0 ||
    symptoms.length > 0;
  const outOfScopeWord = OUT_OF_SCOPE_WORDS.some((word) => normalizedText.includes(word));
  if (!greetingOnly && (outOfScopeWord || (has(OUT_OF_SCOPE_WORDS) && !inScopeEntity)) && !inScopeEntity) {
    signals.outOfScope = true;
  }
  if (crisis) {
    signals.outOfScope = true;
  }

  /* ---------- 追问识别（依赖上一轮上下文） ---------- */
  const hasPrevious = contextHasConditions(previousContext) || history.length >= 2;
  const hasNewEntity = foodIds.length > 0 || parasiteIds.length > 0;
  const isFollowUp = detectFollowUp(
    normalizedText,
    hasPrevious || history.length >= 2,
    previousContext,
    hasNewEntity,
  );

  /* 有效暴露状态：追问时继承上一轮的“已食用” */
  const effectiveExposure: ChatContext['exposure'] =
    exposureResult.exposure !== 'unknown'
      ? exposureResult.exposure
      : isFollowUp && previousContext?.exposure === 'after'
        ? 'after'
        : 'unknown';

  const context: ChatContext = {
    provinceCodes: regionResult.provinceCodes,
    months: timeResult.months,
    foodIds,
    preparationTags,
    parasiteIds,
    exposure: exposureResult.exposure,
    symptoms,
    ...(timeResult.timeExpression ? { timeExpression: timeResult.timeExpression } : {}),
  };

  /* 对比轮的实体也并入上下文（从而检索能覆盖两侧） */
  if (comparison) {
    context.foodIds = uniq([
      ...context.foodIds,
      ...comparison.leftFoodIds,
      ...comparison.rightFoodIds,
    ]);
    context.preparationTags = PREP_TAGS.filter((tag) =>
      [...context.preparationTags, ...comparison.leftPreparationTags, ...comparison.rightPreparationTags].includes(tag),
    );
    context.parasiteIds = uniq([
      ...context.parasiteIds,
      ...comparison.leftParasiteIds,
      ...comparison.rightParasiteIds,
    ]);
  }

  /* ---------- 意图判定 ---------- */
  const intents: ChatIntent[] = [];
  const hasFood = foodIds.length > 0 || Boolean(comparison?.leftFoodIds.length) || Boolean(comparison?.rightFoodIds.length);
  const hasParasite = parasiteIds.length > 0;
  const shortText = normalizedText.length <= 12;
  const questionWords = /[?？]|(吗|呢|怎么|什么|为什么|哪个|哪些|如何)/.test(normalizedText);

  const clarificationAnswer =
    !questionWords &&
    shortText &&
    contextHasConditions(previousContext) &&
    (preparationTags.length > 0 ||
      regionResult.provinceCodes.length > 0 ||
      timeResult.months.length > 0 ||
      exposureResult.exposure !== 'unknown' ||
      hasFood ||
      hasParasite);

  if (signals.outOfScope) intents.push('out-of-scope');
  else if (injection && !inScopeEntity) intents.push('out-of-scope');
  else if (greetingOnly) intents.push('greeting');
  else if (signals.comparison) intents.push('comparison');
  else if (effectiveExposure === 'after') intents.push('post-exposure');
  else if (clarificationAnswer) intents.push('clarification-answer');
  else if (isFollowUp && !has(RISK_WORDS.concat(PREVENTION_WORDS, TREATMENT_WORDS))) intents.push('follow-up');
  else if (signals.treatment) intents.push('treatment');
  else if (
    signals.prevention &&
    (signals.preventionStrong || !(hasFood && preparationTags.length > 0))
  ) {
    intents.push('prevention');
  } else if (signals.symptomQuery && !(hasFood && preparationTags.length > 0)) intents.push('symptoms');
  else if (signals.knowledge && !hasFood) intents.push('knowledge');
  else if (
    regionResult.provinceCodes.length > 0 &&
    !hasFood &&
    !hasParasite &&
    preparationTags.length === 0 &&
    symptoms.length === 0
  ) {
    intents.push('region');
  } else if (regionResult.provinceCodes.length > 0 && has(STRONG_REGION_WORDS) && !hasFood) {
    intents.push('region');
  } else if (
    !hasFood &&
    !hasParasite &&
    timeResult.seasonal &&
    (has(STRONG_SEASON_WORDS) || /月/.test(normalizedText))
  ) {
    intents.push('season');
  } else if (has(STRONG_SEASON_WORDS) && !hasFood) intents.push('season');
  else if (clarificationAnswer) intents.push('clarification-answer');
  else if (hasFood || hasParasite || preparationTags.length > 0 || symptoms.length > 0) intents.push('risk-assessment');
  else if (regionResult.provinceCodes.length > 0) intents.push('region');
  else intents.push('risk-assessment');

  /* 补充 secondaryIntents（最多 3 个） */
  const secondary: ChatIntent[] = [];
  const pushSecondary = (intent: ChatIntent) => {
    if (intent !== intents[0] && !secondary.includes(intent)) secondary.push(intent);
  };
  if (signals.prevention) pushSecondary('prevention');
  if (signals.treatment) pushSecondary('treatment');
  if (signals.symptomQuery || symptoms.length > 0) pushSecondary('symptoms');
  if (signals.knowledge) pushSecondary('knowledge');
  if (signals.region) pushSecondary('region');
  if (signals.season) pushSecondary('season');
  if (signals.comparison) pushSecondary('comparison');
  if (effectiveExposure === 'after') pushSecondary('post-exposure');
  if (hasFood || hasParasite || preparationTags.length > 0) {
    if (!['risk-assessment', 'post-exposure', 'comparison', 'follow-up', 'clarification-answer'].includes(intents[0])) {
      pushSecondary('risk-assessment');
    }
  }
  const secondaryIntents = secondary.slice(0, 3);

  return {
    context,
    intents: [...intents, ...secondaryIntents],
    primaryIntent: intents[0],
    secondaryIntents,
    ambiguousFoods,
    mentions,
    negationNotes,
    notes,
    rawText,
    normalizedText,
    truncated: rawClipped.truncated,
    isFollowUp,
    questionForm: detectQuestionForm(normalizedText),
    comparison,
    signals,
    safety: crisis ? 'crisis' : injection ? 'injection' : null,
  };
}

/** 供调试/测试使用的简要摘要（不参与生产回答） */
export function summarizeNlu(result: NluResult): string {
  return firstSentence(
    `意图=${result.intents.join('/')} 食物=${result.context.foodIds.join(',') || '-'} 做法=${result.context.preparationTags.join(',') || '-'} 地区=${result.context.provinceCodes.join(',') || '-'} 月份=${result.context.months.join(',') || '-'} 暴露=${result.context.exposure}`,
    200,
  );
}

