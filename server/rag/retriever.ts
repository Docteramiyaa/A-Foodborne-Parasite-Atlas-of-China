/**
 * 检索与排序（纯函数）
 * ------------------------------------------------------------
 * 输入：规范化后的知识索引 + NLU 结果；输出：按实体聚合的证据/知识块。
 *
 * 打分思路（中文离线检索）：
 *  - 实体精确匹配（食物/寄生虫/地区）权重最高；
 *  - 别名命中来自数据层与内置词典；
 *  - 文本块使用“字 + 二连字 + 英文词”重合打分；
 *  - 来源可靠性（high > medium > reference）加权；
 *  - 地区 / 季节约束匹配加分，冲突时减分；
 *  - 风险规则按优先级 + 条件具体度打分。
 *
 * 检索只负责“找到证据”，最终口吻与医学边界由 composer 负责。
 */
import type {
  ChatIntent,
  Consequence,
  Food,
  FoodPreparation,
  Parasite,
  PreparationTag,
  Region,
  RegionEvidenceEntry,
  RegionStatus,
  RiskLevel,
  RiskRule,
  RiskScenario,
  Severity,
} from '../../shared/types.js';
import type { RagChunk, RagIndex } from './knowledge.js';
import { provinceDisplayName, provinceInfo } from './knowledge.js';
import type { NluResult } from './nlu.js';
import { tokenize } from './text.js';

/* ========================================================================== */
/* 输出类型                                                                    */
/* ========================================================================== */

export interface RuleMatch {
  rule: RiskRule;
  parasite: Parasite | null;
  score: number;
  matchedFoodIds: string[];
  matchedPreparationTags: PreparationTag[];
  matchedProvinceCodes: string[];
  reasons: string[];
}

export interface ScenarioMatch {
  parasite: Parasite;
  scenario: RiskScenario;
  matchedFoodIds: string[];
  matchedPreparationTags: PreparationTag[];
  /** 用户尚未说明处理方式，该场景只是“可能相关” */
  preparationUnknown: boolean;
}

export interface ParasiteHit {
  parasite: Parasite;
  score: number;
  reasons: string[];
  mentioned: boolean;
  ruleMatches: RuleMatch[];
  scenarioMatches: ScenarioMatch[];
}

export interface FoodHit {
  food: Food;
  score: number;
  matched: boolean;
  reasons: string[];
  /** 与用户所描述处理方式对应的风险矩阵条目 */
  preparation: FoodPreparation | null;
}

export interface RegionEvidenceHit {
  region: Region;
  entry: RegionEvidenceEntry;
  score: number;
  matchedParasiteIds: string[];
  matchedFoodIds: string[];
  reasons: string[];
}

export interface RegionHit {
  code: string;
  name: string;
  /** 用户明确提到（否则为“由寄生虫相关地区反查”） */
  requested: boolean;
  region: Region | null;
  entries: RegionEvidenceHit[];
  notCovered: boolean;
  evidenceStatus: RegionStatus | null;
  reasons: string[];
}

export interface RegionCoverage {
  code: string;
  name: string;
  hasEvidence: boolean;
  /** 面向回答的覆盖说明（无资料时明确“不代表没有风险”） */
  note: string;
}

export interface ChunkHit {
  chunk: RagChunk;
  score: number;
  reasons: string[];
}

export interface KnowledgeItem {
  parasiteId: string;
  parasiteName: string;
  title: string;
  detail: string;
  key?: boolean;
  sourceIds: string[];
}

export interface ConsequenceItem extends KnowledgeItem {
  consequenceId: string;
  severity: Severity;
  onset?: string;
}

export interface TreatmentItem extends KnowledgeItem {
  note: string;
}

export interface SeasonalHit {
  parasiteId: string;
  parasiteName: string;
  peakMonths: number[];
  pattern: string;
  evidenceNote: string;
  contextNote?: string;
  sourceIds: string[];
}

export interface RegionalSeasonHit {
  regionCode: string;
  regionName: string;
  months: number[];
  note: string;
  basis: 'infection-evidence' | 'dietary-context';
  parasiteIds: string[];
  sourceIds: string[];
}

export interface RetrievalResult {
  intent: ChatIntent;
  /** 有效条件（已合并上下文的 NLU context） */
  query: {
    foodIds: string[];
    preparationTags: PreparationTag[];
    provinceCodes: string[];
    months: number[];
    parasiteIds: string[];
    symptoms: string[];
    exposure: NluResult['context']['exposure'];
  };
  foods: FoodHit[];
  parasites: ParasiteHit[];
  rules: RuleMatch[];
  scenarios: ScenarioMatch[];
  regions: RegionHit[];
  regionCoverage: RegionCoverage[];
  chunks: ChunkHit[];
  prevention: KnowledgeItem[];
  consequences: ConsequenceItem[];
  postExposure: KnowledgeItem[];
  treatments: TreatmentItem[];
  seasonal: SeasonalHit[];
  regionalSeasons: RegionalSeasonHit[];
  ambiguousFoodIds: string[];
  unresolvedFoodMentions: string[];
  unresolvedParasiteMentions: string[];
  notes: string[];
}

export interface RetrieveOptions {
  /** 指定意图（不传则用 nlu.primaryIntent），用于按意图侧重检索 */
  intent?: ChatIntent;
  /** 最多返回多少个文本块 */
  maxChunks?: number;
}

/* ========================================================================== */
/* 常量                                                                        */
/* ========================================================================== */

const STATUS_RANK: Record<RegionStatus, number> = {
  endemic: 7,
  'high-burden': 6,
  reported: 5,
  'national-context': 3,
  limited: 2,
  'not-reported': 1,
  unknown: 0,
};

const EVIDENCE_RANK: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
const RISK_RANK: Record<RiskLevel, number> = { high: 4, moderate: 3, contextual: 2, low: 1, unknown: 0 };
const SEVERITY_RANK: Record<Severity, number> = {
  'life-threatening': 5,
  severe: 4,
  moderate: 3,
  mild: 2,
  variable: 1,
};

const RELIABILITY_BONUS: Record<string, number> = { high: 1.5, medium: 1, reference: 0.5 };

const CHUNK_KIND_BONUS: Record<ChatIntent, Partial<Record<RagChunk['kind'], number>>> = {
  'risk-assessment': { rule: 2.5, parasite: 1.2, prevention: 1, consequence: 1 },
  'post-exposure': { 'post-exposure': 2.5, consequence: 1.5, prevention: 0.5, rule: 0.8 },
  prevention: { prevention: 2.5, food: 1, region: 0.5, rule: 0.6 },
  symptoms: { consequence: 2.5, parasite: 1.2, 'post-exposure': 0.5 },
  treatment: { 'post-exposure': 2, consequence: 1, parasite: 0.8 },
  knowledge: { parasite: 2.5, food: 1.2, region: 0.6 },
  region: { region: 2.5, season: 1, parasite: 0.8 },
  season: { season: 2.5, region: 1.2, parasite: 0.8 },
  comparison: { rule: 1.8, parasite: 1.2, food: 1 },
  'follow-up': { rule: 1.2, parasite: 0.8, prevention: 0.8 },
  'clarification-answer': { rule: 1, parasite: 0.6 },
  greeting: {},
  'out-of-scope': {},
};

/** 症状 → 候选寄生虫的排序提示（仅用于检索排序，不作为诊断结论） */
const SYMPTOM_PARASITE_HINTS: Record<string, string[]> = {
  腹痛: ['clonorchis-sinensis', 'anisakis', 'fasciolopsis-buski', 'ascaris-lumbricoides', 'trichinella-spiralis'],
  腹泻: ['cryptosporidium', 'entamoeba-histolytica', 'trichinella-spiralis', 'ascaris-lumbricoides'],
  恶心: ['anisakis', 'trichinella-spiralis', 'ascaris-lumbricoides'],
  呕吐: ['anisakis', 'trichinella-spiralis', 'angiostrongylus-cantonensis', 'ascaris-lumbricoides'],
  发热: ['trichinella-spiralis', 'toxoplasma-gondii', 'spirometra-mansoni', 'clonorchis-sinensis'],
  乏力: ['trichinella-spiralis', 'clonorchis-sinensis', 'toxoplasma-gondii'],
  头痛: ['angiostrongylus-cantonensis', 'taenia-solium', 'spirometra-mansoni'],
  肌肉痛: ['trichinella-spiralis', 'toxoplasma-gondii'],
  黄疸: ['clonorchis-sinensis', 'fasciola-gigantica', 'echinococcus-granulosus'],
  皮下包块: ['gnathostoma-spinigerum', 'spirometra-mansoni', 'linguatula-serrata'],
  癫痫: ['taenia-solium', 'spirometra-mansoni', 'toxoplasma-gondii'],
  咳嗽咯血: ['paragonimus-westermani', 'ascaris-lumbricoides'],
  眼部症状: ['toxoplasma-gondii', 'spirometra-mansoni', 'taenia-solium'],
  肝区不适: ['clonorchis-sinensis', 'fasciola-gigantica', 'echinococcus-granulosus'],
  皮肤症状: ['gnathostoma-spinigerum', 'toxoplasma-gondii'],
  颈项强直: ['angiostrongylus-cantonensis', 'taenia-solium'],
  意识异常: ['taenia-solium', 'angiostrongylus-cantonensis'],
  消瘦: ['toxoplasma-gondii', 'echinococcus-granulosus', 'spirometra-mansoni'],
};

/* ========================================================================== */
/* 小工具                                                                      */
/* ========================================================================== */

function intersect<T>(a: readonly T[], b: readonly T[]): T[] {
  return a.filter((item) => b.includes(item));
}

function sourceReliabilityBonus(ids: readonly string[], index: RagIndex): number {
  if (ids.length === 0) return 0;
  let total = 0;
  let found = 0;
  for (const id of ids) {
    const source = index.sourceById.get(id);
    if (!source) continue;
    found += 1;
    total += RELIABILITY_BONUS[source.reliability] ?? 0.5;
  }
  return found > 0 ? total / found : 0;
}

function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/* ========================================================================== */
/* 风险规则匹配                                                                */
/* ========================================================================== */

function matchRules(
  index: RagIndex,
  foodIds: readonly string[],
  preparationTags: readonly PreparationTag[],
  provinceCodes: readonly string[],
  months: readonly number[],
): RuleMatch[] {
  const matchedFoodCategories = new Set<string>();
  for (const foodId of foodIds) {
    const food = index.foodById.get(foodId);
    if (food) matchedFoodCategories.add(food.categoryId);
  }

  const matches: RuleMatch[] = [];
  for (const rule of index.rules) {
    const parasite = index.parasiteById.get(rule.parasiteId) ?? null;
    const when = rule.when ?? {};
    const reasons: string[] = [];

    /* 食物条件：规则必须给出食物/食物大类条件；且必须命中 */
    const ruleFoodIds = when.foodIds ?? [];
    const ruleCategoryIds = when.foodCategoryIds ?? [];
    if (ruleFoodIds.length === 0 && ruleCategoryIds.length === 0) continue;
    const matchedFoodIds = intersect(ruleFoodIds, foodIds);
    const matchedCategoryIds = ruleCategoryIds.filter((c) => matchedFoodCategories.has(c));
    if (matchedFoodIds.length === 0 && matchedCategoryIds.length === 0) continue;
    if (matchedFoodIds.length > 0) reasons.push('食物条件匹配');
    else reasons.push('食物大类条件匹配');

    /* 处理方式条件 */
    const rulePreps = when.preparationTags ?? [];
    const matchedPreparationTags = rulePreps.length > 0 ? intersect(rulePreps, preparationTags) : [];
    if (rulePreps.length > 0 && matchedPreparationTags.length === 0) continue;
    if (matchedPreparationTags.length > 0) reasons.push('处理方式条件匹配');

    /* 地区条件 */
    const ruleProvinces = when.provinceCodes ?? [];
    const matchedProvinceCodes = ruleProvinces.length > 0 ? intersect(ruleProvinces, provinceCodes) : [];
    if (ruleProvinces.length > 0 && matchedProvinceCodes.length === 0) continue;
    if (matchedProvinceCodes.length > 0) reasons.push('地区条件匹配');

    /* 月份条件 */
    const ruleMonths = when.months ?? [];
    const monthMatch = ruleMonths.length > 0 ? intersect(ruleMonths, months) : [];
    if (ruleMonths.length > 0 && monthMatch.length === 0) continue;
    if (monthMatch.length > 0) reasons.push('月份条件匹配');

    const specificity =
      (matchedFoodIds.length > 0 ? 2 : 1) +
      (matchedPreparationTags.length > 0 ? 2 : 0) +
      (ruleProvinces.length > 0 ? 5 : 0) +
      (ruleMonths.length > 0 ? 3 : 0);
    const score =
      (rule.priority ?? 0) +
      specificity * 2 +
      RISK_RANK[rule.riskLevel] * 3 +
      (parasite ? 2 : 0);

    matches.push({
      rule,
      parasite,
      score,
      matchedFoodIds,
      matchedPreparationTags,
      matchedProvinceCodes,
      reasons,
    });
  }
  return matches.sort((a, b) => b.score - a.score);
}

/* ========================================================================== */
/* 候选寄生虫                                                                  */
/* ========================================================================== */

function collectCandidateParasites(
  index: RagIndex,
  nlu: NluResult,
  foodHits: FoodHit[],
  ruleMatches: RuleMatch[],
): { scores: Map<string, number>; reasons: Map<string, string[]>; mentioned: Set<string> } {
  const scores = new Map<string, number>();
  const reasons = new Map<string, string[]>();
  const mentioned = new Set<string>();
  const bump = (id: string, amount: number, reason: string) => {
    if (!index.parasiteById.has(id)) return;
    scores.set(id, (scores.get(id) ?? 0) + amount);
    const list = reasons.get(id) ?? [];
    if (!list.includes(reason)) list.push(reason);
    reasons.set(id, list);
  };

  for (const id of nlu.context.parasiteIds) {
    bump(id, 14, '用户直接提到该寄生虫');
    if (index.parasiteById.has(id)) mentioned.add(id);
  }
  /* 已识别食物 → 数据层声明的关联寄生虫（这是“与食物匹配”的一级来源） */
  for (const hit of foodHits) {
    for (const parasiteId of hit.food.parasiteIds ?? []) {
      bump(parasiteId, hit.matched ? 6 : 3, `与食物「${hit.food.name}」相关`);
    }
  }
  /* 命中的风险规则（食物+处理方式组合）→ 候选寄生虫 */
  for (const match of ruleMatches) {
    bump(match.rule.parasiteId, 8 + RISK_RANK[match.rule.riskLevel] * 2, match.rule.rationale);
  }
  /*
   * 症状提示只用于“排序”，且仅在两种情况生效：
   *  1. 没有识别到食物/寄生虫（症状倾诉/食后但未说明食物）；
   *  2. 该寄生虫已因食物/规则进入候选。
   * 绝不能因为“四川的地区证据”或“发热头痛”把与食物无关的寄生虫塞进病原集合。
   */
  const hasFoodContext = foodHits.length > 0;
  const hasExplicitParasite = nlu.context.parasiteIds.length > 0;
  for (const label of nlu.context.symptoms) {
    for (const parasiteId of SYMPTOM_PARASITE_HINTS[label] ?? []) {
      if (hasFoodContext || hasExplicitParasite) {
        if (!scores.has(parasiteId)) continue;
      }
      bump(parasiteId, 2.5, `症状「${label}」相关（仅用于排序，不代表诊断）`);
    }
  }
  return { scores, reasons, mentioned };
}

/* ========================================================================== */
/* 文本块打分                                                                  */
/* ========================================================================== */

function scoreChunks(
  index: RagIndex,
  nlu: NluResult,
  intent: ChatIntent,
  candidateParasiteIds: string[],
  foodIds: string[],
  maxChunks: number,
): ChunkHit[] {
  const query = tokenize(nlu.normalizedText);
  const foodById = index.foodById;
  const parasiteById = index.parasiteById;
  const requestedProvinces = nlu.context.provinceCodes;
  const requestedMonths = nlu.context.months;
  const kindBonus = CHUNK_KIND_BONUS[intent] ?? {};

  const hits: ChunkHit[] = [];
  for (const chunk of index.chunks) {
    const tokens = index.chunkTokens.get(chunk.id);
    if (!tokens) continue;
    const reasons: string[] = [];
    let score = 0;

    /* 1) 文本重合（二连字 1、单字 0.3、英文词 1.5） */
    let overlap = 0;
    for (const bigram of query.bigrams) if (tokens.bigrams.has(bigram)) overlap += 1;
    for (const unigram of query.unigrams) if (tokens.unigrams.has(unigram)) overlap += 0.3;
    for (const word of query.words) if (tokens.words.has(word)) overlap += 1.5;
    score += Math.min(overlap, 14);
    if (overlap > 0) reasons.push('文本关键词命中');

    /* 2) 实体匹配加权 */
    const parasiteOverlap = intersect(chunk.parasiteIds, candidateParasiteIds).length;
    const foodOverlap = intersect(chunk.foodIds, foodIds).length;
    if (parasiteOverlap > 0) {
      score += Math.min(parasiteOverlap * 5, 10);
      reasons.push('涉及同一寄生虫');
    }
    if (foodOverlap > 0) {
      score += Math.min(foodOverlap * 4, 8);
      reasons.push('涉及同一食物');
    }
    /* 标题命中实体名：额外加分（近似精确匹配） */
    for (const className of ['parasite', 'food'] as const) {
      const ids = className === 'parasite' ? candidateParasiteIds : foodIds;
      for (const id of ids) {
        const name = className === 'parasite' ? parasiteById.get(id)?.name : foodById.get(id)?.name;
        if (name && name.length >= 2 && chunk.title.includes(name)) {
          score += 3;
          reasons.push(`标题包含「${name}」`);
          break;
        }
      }
    }

    /* 3) 地区约束 */
    if (requestedProvinces.length > 0 && chunk.provinceCodes.length > 0) {
      if (intersect(chunk.provinceCodes, requestedProvinces).length > 0) {
        score += 4;
        reasons.push('地区匹配');
      } else {
        score -= 2.5;
      }
    }

    /* 4) 季节约束 */
    if (requestedMonths.length > 0 && chunk.months.length > 0) {
      if (intersect(chunk.months, requestedMonths).length > 0) {
        score += 3;
        reasons.push('季节匹配');
      } else {
        score -= 1.5;
      }
    }

    /* 5) 来源可靠性与知识块权重 */
    score *= chunk.weight > 0 ? chunk.weight : 1;
    score += sourceReliabilityBonus(chunk.sourceIds, index);

    /* 6) 意图侧重的知识块类型 */
    const bonus = kindBonus[chunk.kind] ?? 0;
    if (bonus) score += bonus;

    if (score >= 3) hits.push({ chunk, score, reasons });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, maxChunks);
}

/* ========================================================================== */
/* 地区证据                                                                    */
/* ========================================================================== */

function collectRegions(
  index: RagIndex,
  nlu: NluResult,
  candidateParasiteIds: string[],
  foodIds: string[],
  intent: ChatIntent,
): { regions: RegionHit[]; coverage: RegionCoverage[] } {
  const requestedCodes = [...nlu.context.provinceCodes];
  const regions: RegionHit[] = [];
  const coverage: RegionCoverage[] = [];

  const buildHit = (code: string, requested: boolean): RegionHit => {
    const region = index.regionByCode.get(code) ?? null;
    const name = region?.name ?? provinceDisplayName(code);
    const entries: RegionEvidenceHit[] = [];
    for (const entry of region?.entries ?? []) {
      const matchedParasiteIds = intersect(entry.parasiteIds ?? [], candidateParasiteIds);
      const matchedFoodIds = intersect(entry.foodIds ?? [], foodIds);
      const relevant =
        candidateParasiteIds.length === 0 && foodIds.length === 0
          ? true
          : matchedParasiteIds.length > 0 || matchedFoodIds.length > 0;
      if (!relevant) continue;
      const score =
        STATUS_RANK[entry.status] * 2 +
        (EVIDENCE_RANK[entry.evidenceLevel] ?? 1) * 1.5 +
        matchedParasiteIds.length * 2 +
        matchedFoodIds.length * 2;
      entries.push({
        region: region as Region,
        entry,
        score,
        matchedParasiteIds,
        matchedFoodIds,
        reasons: [
          matchedParasiteIds.length ? '涉及相关寄生虫' : '',
          matchedFoodIds.length ? '涉及相关食物' : '',
        ].filter(Boolean),
      });
    }
    entries.sort((a, b) => b.score - a.score);
    const hasRegion = Boolean(region);
    const notCovered = entries.length === 0;
    return {
      code,
      name,
      requested,
      region,
      entries,
      notCovered,
      evidenceStatus: region?.evidenceStatus ?? null,
      reasons: [
        hasRegion ? '知识库收录该省级地区' : '知识库暂未收录该省级地区条目',
        notCovered ? '没有与该问题匹配的省级证据' : `命中 ${entries.length} 条省级证据`,
      ],
    };
  };

  for (const code of requestedCodes) {
    const hit = buildHit(code, true);
    regions.push(hit);
    coverage.push({
      code,
      name: hit.name,
      hasEvidence: hit.entries.length > 0,
      note: hit.entries.length
        ? `本知识库收录了 ${hit.entries.length} 条与您问题相关的${hit.name}资料，引用时已保留其研究对象与统计口径。`
        : `本知识库暂未收录${hit.name}针对此问题的专门调查，这不代表该地区没有风险；可参考全国层面资料与一般防护原则。`,
    });
  }

  /* 用户未指定省份，但问的是地区/季节：反查与候选寄生虫相关的省份 */
  if (requestedCodes.length === 0 && candidateParasiteIds.length > 0 && ['region', 'season', 'knowledge'].includes(intent)) {
    const related: { code: string; score: number }[] = [];
    for (const region of index.regions) {
      let score = 0;
      for (const entry of region.entries ?? []) {
        if (intersect(entry.parasiteIds ?? [], candidateParasiteIds).length > 0) {
          score += STATUS_RANK[entry.status];
        }
      }
      if (score > 0) related.push({ code: region.code, score });
    }
    related.sort((a, b) => b.score - a.score);
    for (const item of related.slice(0, 5)) {
      const hit = buildHit(item.code, false);
      if (hit.entries.length > 0) regions.push(hit);
    }
  }

  return { regions, coverage };
}

/* ========================================================================== */
/* 结构化知识聚合                                                              */
/* ========================================================================== */

function collectStructuredKnowledge(
  index: RagIndex,
  parasites: ParasiteHit[],
  regions: RegionHit[],
  months: number[],
  foodIds: string[],
): Pick<
  RetrievalResult,
  'prevention' | 'consequences' | 'postExposure' | 'treatments' | 'seasonal' | 'regionalSeasons'
> {
  const prevention: KnowledgeItem[] = [];
  const consequences: ConsequenceItem[] = [];
  const postExposure: KnowledgeItem[] = [];
  const treatments: TreatmentItem[] = [];
  const seasonal: SeasonalHit[] = [];
  const regionalSeasons: RegionalSeasonHit[] = [];

  const parasiteSeen = new Set<string>();
  for (const hit of parasites) {
    if (parasiteSeen.has(hit.parasite.id)) continue;
    parasiteSeen.add(hit.parasite.id);
    const parasite = hit.parasite;

    const measures = [...(parasite.prevention ?? [])].sort((a, b) => Number(Boolean(b.key)) - Number(Boolean(a.key)));
    for (const measure of measures) {
      prevention.push({
        parasiteId: parasite.id,
        parasiteName: parasite.name,
        title: measure.title,
        detail: measure.detail,
        key: Boolean(measure.key),
        sourceIds: measure.sourceIds ?? parasite.transmission?.sourceIds ?? [],
      });
    }
    for (const consequence of parasite.consequences ?? []) {
      consequences.push({
        parasiteId: parasite.id,
        parasiteName: parasite.name,
        consequenceId: consequence.id,
        title: consequence.title,
        detail: consequence.description,
        severity: consequence.severity,
        ...(consequence.onset ? { onset: consequence.onset } : {}),
        sourceIds: consequence.sourceIds ?? [],
      });
    }
    for (const measure of parasite.postExposure ?? []) {
      postExposure.push({
        parasiteId: parasite.id,
        parasiteName: parasite.name,
        title: measure.title,
        detail: measure.detail,
        sourceIds: measure.sourceIds ?? [],
      });
    }
    if (parasite.treatment) {
      treatments.push({
        parasiteId: parasite.id,
        parasiteName: parasite.name,
        title: `${parasite.name} · 治疗与就医`,
        detail: parasite.treatment.summary,
        note: parasite.treatment.note,
        sourceIds: parasite.treatment.sourceIds ?? [],
      });
    }
    if (parasite.seasonality) {
      seasonal.push({
        parasiteId: parasite.id,
        parasiteName: parasite.name,
        peakMonths: parasite.seasonality.peakMonths ?? [],
        pattern: parasite.seasonality.pattern,
        evidenceNote: parasite.seasonality.evidenceNote,
        ...(parasite.seasonality.contextNote ? { contextNote: parasite.seasonality.contextNote } : {}),
        sourceIds: parasite.seasonality.sourceIds ?? [],
      });
    }
  }

  /* 食物自带的选购/处理要点也属于预防知识 */
  for (const foodId of foodIds) {
    const food = index.foodById.get(foodId);
    if (!food) continue;
    for (const tip of food.tips ?? []) {
      if (prevention.some((item) => item.title === tip.title)) continue;
      prevention.push({
        parasiteId: '',
        parasiteName: food.name,
        title: tip.title,
        detail: tip.detail,
        sourceIds: tip.sourceIds ?? food.sourceIds ?? [],
      });
    }
  }

  /* 地区季节资料（保留 evidence / dietary-context 区分） */
  for (const regionHit of regions) {
    if (!regionHit.region) continue;
    for (const note of regionHit.region.seasonalNotes ?? []) {
      const monthsMatch = months.length === 0 || intersect(note.months ?? [], months).length > 0;
      if (!monthsMatch) continue;
      regionalSeasons.push({
        regionCode: regionHit.region.code,
        regionName: regionHit.region.name,
        months: note.months ?? [],
        note: note.note,
        basis: note.basis,
        parasiteIds: note.parasiteIds ?? [],
        sourceIds: note.sourceIds ?? [],
      });
    }
  }

  consequences.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  return {
    prevention: dedupeBy(prevention, (item) => `${item.parasiteId}:${item.title}`),
    consequences: dedupeBy(consequences, (item) => `${item.parasiteId}:${item.consequenceId}`),
    postExposure: dedupeBy(postExposure, (item) => `${item.parasiteId}:${item.title}`),
    treatments: dedupeBy(treatments, (item) => item.parasiteId),
    seasonal: dedupeBy(seasonal, (item) => item.parasiteId),
    regionalSeasons: dedupeBy(regionalSeasons, (item) => `${item.regionCode}:${item.note}`),
  };
}

/* ========================================================================== */
/* 主检索函数                                                                  */
/* ========================================================================== */

/**
 * 全量检索：结构化命中 + 文本块 + 聚合知识。
 * 纯函数；索引由调用方通过 buildIndex 构建（或使用 createRetriever 缓存）。
 */
export function retrieve(index: RagIndex, nlu: NluResult, options: RetrieveOptions = {}): RetrievalResult {
  const intent = options.intent ?? nlu.primaryIntent;
  const maxChunks = options.maxChunks ?? 20;

  const unresolvedFoodMentions = nlu.mentions
    .filter((m) => m.type === 'food' && m.id && m.resolved === false)
    .map((m) => m.text);
  const unresolvedParasiteMentions = nlu.mentions
    .filter((m) => m.type === 'parasite' && m.id && m.resolved === false)
    .map((m) => m.text);

  const foodIds = nlu.context.foodIds.filter((id) => index.foodById.has(id));
  const foodHits: FoodHit[] = [];
  for (const foodId of foodIds) {
    const food = index.foodById.get(foodId);
    if (!food) continue;
    const preparation = nlu.context.preparationTags.length
      ? (food.preparations ?? []).find((p) => nlu.context.preparationTags.includes(p.tag)) ?? null
      : null;
    foodHits.push({
      food,
      score: 10 + (preparation ? 4 : 0),
      matched: true,
      reasons: [preparation ? `命中处理方式「${preparation.label}」` : '用户提到的食物'],
      preparation,
    });
  }

  const ruleMatches = matchRules(
    index,
    foodIds,
    nlu.context.preparationTags,
    nlu.context.provinceCodes,
    nlu.context.months,
  );

  const candidateInfo = collectCandidateParasites(index, nlu, foodHits, ruleMatches);
  const sortedCandidates = [...candidateInfo.scores.entries()]
    .filter(([id]) => index.parasiteById.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  let candidateParasiteIds = sortedCandidates.map(([id]) => id);
  /* 若用户直接提到寄生虫，确保其进入候选（即使分数低） */
  for (const id of nlu.context.parasiteIds) {
    if (index.parasiteById.has(id) && !candidateParasiteIds.includes(id)) candidateParasiteIds.push(id);
  }
  /*
   * 通用知识类问题（预防/症状/治疗/科普）没有具体食物或寄生虫时：
   * 用知识库中的 featured 寄生虫作为“通用知识”候选，避免回答空泛或错误追问具体食物。
   */
  if (
    candidateParasiteIds.length === 0 &&
    foodIds.length === 0 &&
    ['prevention', 'knowledge', 'symptoms', 'treatment'].includes(intent)
  ) {
    const general = index.parasites.filter((parasite) => parasite.featured).slice(0, 4);
    for (const parasite of general) {
      candidateParasiteIds.push(parasite.id);
      candidateInfo.scores.set(parasite.id, 1);
      candidateInfo.reasons.set(parasite.id, ['常见食源性寄生虫（通用知识）']);
    }
  }

  const scenarioMatches: ScenarioMatch[] = [];
  const parasites: ParasiteHit[] = [];
  for (const parasiteId of candidateParasiteIds) {
    const parasite = index.parasiteById.get(parasiteId);
    if (!parasite) continue;
    const parasiteRuleMatches = ruleMatches.filter((match) => match.rule.parasiteId === parasiteId);
    const scenarios: ScenarioMatch[] = [];
    for (const scenario of parasite.riskScenarios ?? []) {
      const matchedFoodIds = intersect(scenario.foodIds ?? [], foodIds);
      if (matchedFoodIds.length === 0) continue;
      const matchedPreparationTags = intersect(scenario.preparationTags ?? [], nlu.context.preparationTags);
      const preparationUnknown = nlu.context.preparationTags.length === 0;
      if (!preparationUnknown && matchedPreparationTags.length === 0) continue;
      const match: ScenarioMatch = {
        parasite,
        scenario,
        matchedFoodIds,
        matchedPreparationTags,
        preparationUnknown,
      };
      scenarios.push(match);
      scenarioMatches.push(match);
    }
    scenarios.sort((a, b) => RISK_RANK[b.scenario.riskLevel] - RISK_RANK[a.scenario.riskLevel]);
    if (parasiteRuleMatches.length === 0 && scenarios.length === 0 && candidateInfo.mentioned.has(parasiteId)) {
      /* 直接提到的寄生虫即使没有规则命中也要保留 */
    }
    parasites.push({
      parasite,
      score: candidateInfo.scores.get(parasiteId) ?? 0,
      reasons: candidateInfo.reasons.get(parasiteId) ?? [],
      mentioned: candidateInfo.mentioned.has(parasiteId),
      ruleMatches: parasiteRuleMatches,
      scenarioMatches: scenarios,
    });
  }
  parasites.sort((a, b) => b.score - a.score);

  const chunks = scoreChunks(index, nlu, intent, candidateParasiteIds, foodIds, maxChunks);
  const regionResult = collectRegions(index, nlu, candidateParasiteIds, foodIds, intent);
  const structured = collectStructuredKnowledge(index, parasites, regionResult.regions, nlu.context.months, foodIds);

  const notes: string[] = [];
  if (unresolvedFoodMentions.length > 0) {
    notes.push(`识别到食物表达「${[...new Set(unresolvedFoodMentions)].join('、')}」，但知识库暂未收录对应条目。`);
  }
  if (unresolvedParasiteMentions.length > 0) {
    notes.push(`识别到寄生虫表达「${[...new Set(unresolvedParasiteMentions)].join('、')}」，但知识库暂未收录对应条目。`);
  }
  if (candidateParasiteIds.length === 0 && foodIds.length > 0) {
    notes.push('当前知识库尚未建立该食物与寄生虫的明确关联。');
  }

  return {
    intent,
    query: {
      foodIds,
      preparationTags: nlu.context.preparationTags,
      provinceCodes: nlu.context.provinceCodes,
      months: nlu.context.months,
      parasiteIds: nlu.context.parasiteIds,
      symptoms: nlu.context.symptoms,
      exposure: nlu.context.exposure,
    },
    foods: foodHits,
    parasites,
    rules: ruleMatches,
    scenarios: scenarioMatches,
    regions: regionResult.regions,
    regionCoverage: regionResult.coverage,
    chunks,
    ...structured,
    ambiguousFoodIds: nlu.ambiguousFoods.flatMap((item) => item.candidates.map((c) => c.id)),
    unresolvedFoodMentions,
    unresolvedParasiteMentions,
    notes,
  };
}

/** 按意图侧重检索（结果结构一致，仅块/知识按意图裁剪） */
export function retrieveForIntent(index: RagIndex, nlu: NluResult, intent: ChatIntent): RetrievalResult {
  const result = retrieve(index, nlu, { intent });
  const kindPriority: Partial<Record<RagChunk['kind'], number>> = CHUNK_KIND_BONUS[intent] ?? {};
  let chunks = result.chunks;
  if (Object.keys(kindPriority).length > 0) {
    const allowedKinds = Object.entries(kindPriority)
      .filter(([, bonus]) => (bonus ?? 0) >= 0.8)
      .map(([kind]) => kind);
    const filtered = chunks.filter((hit) => allowedKinds.includes(hit.chunk.kind));
    chunks = filtered.length >= 4 ? filtered : chunks;
  }
  return { ...result, chunks };
}

/** 检索结果摘要（调试/测试辅助） */
export function summarizeRetrieval(result: RetrievalResult): string {
  const parasiteNames = result.parasites.slice(0, 3).map((p) => p.parasite.name);
  return [
    `意图=${result.intent}`,
    `食物=${result.foods.map((f) => f.food.name).join('、') || '-'}`,
    `寄生虫=${parasiteNames.join('、') || '-'}`,
    `规则=${result.rules.length}`,
    `地区=${result.regions.map((r) => r.name).join('、') || '-'}`,
    `文本块=${result.chunks.length}`,
    `防御要点=${result.prevention.length}`,
    `后果=${result.consequences.length}`,
  ].join(' | ');
}
