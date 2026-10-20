/**
 * 统一搜索（寄生虫 / 食物 / 地区 / 来源）。
 *
 * 相关性规则（API.md）：
 *   完全匹配 > 前缀匹配 > 别名 > 正文；
 *   中文按子串匹配；多词查询按 AND 语义（每个词都要命中某个字段），
 *   整串命中额外加分。hits 上限 30，grouped 每类上限 10。
 *
 * 城市名：
 *   知识库维护了「城市 → 省份」映射（store.cities，约 190 条）。
 *   城市名/城市别名以低于省名、简称、省别名但高于正文的权重并入地区字段，
 *   命中后仍返回该省的 region hit（title=省名、url=/regions/:code），
 *   仅 subtitle / badges / excerpt 标注城市，避免同一城市单独造一个 SearchKind。
 */
import type {
  Food,
  FoodSummary,
  Parasite,
  ParasiteSummary,
  Region,
  RegionSummary,
  SearchHit,
  SearchKind,
  SearchResponse,
  Source,
} from '../../shared/types.js';
import {
  SOURCE_TYPE_LABELS,
} from '../data/loader.js';
import type { KnowledgeStore } from '../data/store.js';

export const SEARCH_HITS_LIMIT = 30;
export const SEARCH_GROUP_LIMIT = 10;
export const SEARCH_MAX_QUERY_LENGTH = 100;

const KIND_ORDER: Record<SearchKind, number> = { parasite: 0, food: 1, region: 2, source: 3 };

interface FieldWeight {
  text: string | undefined;
  exact: number;
  prefix: number;
  includes: number;
  /** 命中该字段时用于展示的城市名（如“深圳市”）；用于识别“城市命中” */
  cityDisplay?: string;
  /** 最短查询词长度（城市字段用 2，避免单字“州/市”命中大量城市造成噪音） */
  minTokenLength?: number;
}

const field = (
  text: string | undefined,
  exact: number,
  prefix: number,
  includes: number,
  extra?: Pick<FieldWeight, 'cityDisplay' | 'minTokenLength'>,
): FieldWeight => ({
  text,
  exact,
  prefix,
  includes,
  ...(extra ?? {}),
});

function scoreField(text: string | undefined, query: string, weights: FieldWeight): number {
  if (!text) return 0;
  if (weights.minTokenLength && query.length < weights.minTokenLength) return 0;
  const value = text.trim();
  if (!value) return 0;
  const lower = value.toLowerCase();
  if (!query) return 0;
  if (lower === query) return weights.exact;
  if (lower.startsWith(query)) return weights.prefix;
  const index = lower.indexOf(query);
  if (index < 0) return 0;
  const previous = index > 0 ? lower[index - 1] : '';
  const boundaryBonus = !previous ? 30 : /[\s、，,;；:：/·\-（()）\[\]【】]/.test(previous) ? 20 : 0;
  return weights.includes + boundaryBonus;
}

interface FieldMatchResult {
  score: number;
  /** 命中权重最高字段对应的城市展示名（按查询词顺序、已去重） */
  cities: string[];
}

function scoreFields(fields: FieldWeight[], tokens: string[], wholeQuery: string): FieldMatchResult {
  const result: FieldMatchResult = { score: 0, cities: [] };
  if (!tokens.length) return result;
  let total = 0;
  const citySet = new Set<string>();
  for (const token of tokens) {
    let best = 0;
    let bestField: FieldWeight | undefined;
    for (const item of fields) {
      const current = scoreField(item.text, token, item);
      if (current > best) {
        best = current;
        bestField = item;
      }
    }
    if (best <= 0) return { score: 0, cities: [] }; // 多词 AND：任一词完全不命中则不返回
    total += best;
    if (bestField?.cityDisplay) citySet.add(bestField.cityDisplay);
  }
  if (tokens.length > 1) {
    let whole = 0;
    for (const item of fields) {
      const current = scoreField(item.text, wholeQuery, item);
      if (current > whole) whole = current;
    }
    total += Math.round(whole * 0.3);
  }
  result.score = total;
  result.cities = [...citySet];
  return result;
}

function excerpt(text: string | undefined, tokens: string[], max = 96): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const lower = clean.toLowerCase();
  let index = -1;
  let hitToken = '';
  for (const token of tokens) {
    const found = lower.indexOf(token);
    if (found >= 0 && (index < 0 || found < index)) {
      index = found;
      hitToken = token;
    }
  }
  if (index < 0) return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  const around = Math.max(0, index - Math.floor((max - hitToken.length) / 3));
  const end = Math.min(clean.length, around + max);
  return `${around > 0 ? '…' : ''}${clean.slice(around, end)}${end < clean.length ? '…' : ''}`;
}

interface ScoredHit {
  hit: SearchHit;
  order: number;
}

function buildHit(
  kind: SearchKind,
  id: string,
  title: string,
  subtitle: string,
  excerptText: string,
  score: number,
  url: string,
  badges: string[],
  tokens: string[],
): SearchHit {
  return {
    kind,
    id,
    title,
    subtitle,
    excerpt: excerpt(excerptText, tokens),
    score: Math.round(score),
    url,
    badges,
  };
}

/** 城市 → 省份映射条目（level 用于展示“深圳市 / 哈尔滨市”这类规范名） */
export interface SearchableCity {
  name: string;
  provinceCode: string;
  aliases?: string[];
  level?: string;
}

/** store 中搜索需要的字段子集（便于单测时构造轻量数据） */
export type SearchableStore = Pick<
  KnowledgeStore,
  'parasites' | 'foods' | 'regions' | 'sources' | 'taxonomy'
> & {
  /** 可选城市词典：提供时支持用城市名/城市别名检索到对应省份 */
  cities?: SearchableCity[];
};

/** 城市展示名：地级市补“市”；区县/研究地点保持原名 */
function cityDisplayName(city: SearchableCity): string {
  const name = city.name.trim();
  if (!name) return name;
  if (city.level === 'county' || city.level === 'site') return name;
  if (/[市县区旗盟]$/.test(name)) return name;
  return `${name}市`;
}

/**
 * 按省份分组城市搜索字段。
 * 权重刻意低于省名/简称(1000)/省别名(620)，高于正文（entry.headline 190 封顶），
 * 这样“深圳”优先命中广东省，而不是被其他省份正文里的“深圳”字样抢走；
 * 单字查询不参与城市匹配（minTokenLength=2），避免“州/市”命中大量城市造成噪音。
 */
function buildCityFieldsByRegion(
  cities: SearchableCity[],
  regionCodes: ReadonlySet<string>,
): Map<string, FieldWeight[]> {
  const map = new Map<string, FieldWeight[]>();
  for (const city of cities) {
    if (!city || typeof city.name !== 'string' || !city.name.trim()) continue;
    if (typeof city.provinceCode !== 'string' || !regionCodes.has(city.provinceCode)) continue;
    const display = cityDisplayName(city);
    const fields = map.get(city.provinceCode) ?? [];
    fields.push(field(city.name, 560, 440, 340, { cityDisplay: display, minTokenLength: 2 }));
    for (const alias of city.aliases ?? []) {
      if (typeof alias !== 'string') continue;
      const trimmed = alias.trim();
      if (!trimmed || trimmed === city.name.trim()) continue;
      fields.push(field(trimmed, 520, 400, 310, { cityDisplay: display, minTokenLength: 2 }));
    }
    map.set(city.provinceCode, fields);
  }
  return map;
}

export function searchKnowledge(store: SearchableStore, rawQuery: string): SearchResponse {
  const query = (rawQuery ?? '').trim();
  const emptyGrouped: Record<SearchKind, SearchHit[]> = { parasite: [], food: [], region: [], source: [] };
  if (!query) {
    return { query: '', hits: [], grouped: emptyGrouped };
  }
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return { query: '', hits: [], grouped: emptyGrouped };
  }
  const whole = tokens.join(' ');
  const scored: ScoredHit[] = [];
  const cityFieldsByRegion = buildCityFieldsByRegion(
    store.cities ?? [],
    new Set(store.regions.map((region) => region.code)),
  );

  const parasiteFields = (parasite: Parasite): FieldWeight[] => [
    field(parasite.name, 1000, 700, 520),
    field(parasite.latinName, 950, 650, 500),
    field(parasite.categoryLabel, 420, 320, 260),
    ...parasite.aliases.map((alias) => field(alias, 620, 460, 360)),
    field(parasite.tagline, 170, 150, 130),
    field(parasite.summary, 150, 135, 115),
    ...parasite.consequences.map((item) => field(item.title, 130, 120, 100)),
  ];

  store.parasites.forEach((parasite: Parasite, index: number) => {
    const match = scoreFields(parasiteFields(parasite), tokens, whole);
    if (match.score <= 0) return;
    const badges = [parasite.categoryLabel];
    scored.push({
      order: index,
      hit: buildHit(
        'parasite',
        parasite.id,
        parasite.name,
        `${parasite.latinName}${parasite.latinName ? ' · ' : ''}${parasite.categoryLabel}`,
        parasite.summary || parasite.tagline,
        match.score,
        `/parasites/${encodeURIComponent(parasite.id)}`,
        badges,
        tokens,
      ),
    });
  });

  const foodFields = (food: Food): FieldWeight[] => [
    field(food.name, 1000, 700, 520),
    field(food.categoryLabel, 420, 320, 260),
    ...food.aliases.map((alias) => field(alias, 620, 460, 360)),
    ...food.exampleDishes.map((dish) => field(dish.name, 520, 420, 340)),
    field(food.tagline, 170, 150, 130),
    field(food.summary, 150, 135, 115),
    ...food.exampleDishes.map((dish) => field(dish.riskNote, 130, 120, 100)),
    ...food.preparations.map((prep) => field(prep.label, 200, 160, 130)),
  ];

  store.foods.forEach((food: Food, index: number) => {
    const match = scoreFields(foodFields(food), tokens, whole);
    if (match.score <= 0) return;
    const badges = [food.categoryLabel];
    scored.push({
      order: index,
      hit: buildHit(
        'food',
        food.id,
        food.name,
        `${food.categoryLabel}`,
        food.summary || food.tagline,
        match.score,
        `/foods/${encodeURIComponent(food.id)}`,
        badges,
        tokens,
      ),
    });
  });

  const regionFields = (region: Region): FieldWeight[] => [
    field(region.name, 1000, 700, 520),
    field(region.shortName, 1000, 700, 520),
    ...region.aliases.map((alias) => field(alias, 620, 460, 360)),
    field(region.tagline, 170, 150, 130),
    field(region.evidenceSummary, 150, 135, 115),
    field(region.intro, 145, 130, 110),
    ...region.foodCulture.map((item) => field(item, 130, 115, 100)),
    ...region.entries.map((entry) => field(entry.headline, 190, 160, 130)),
    // 城市名/别名：低于省名、简称、省别名，高于正文
    ...(cityFieldsByRegion.get(region.code) ?? []),
  ];

  store.regions.forEach((region: Region, index: number) => {
    const match = scoreFields(regionFields(region), tokens, whole);
    if (match.score <= 0) return;
    // 城市命中：仍返回该省的 region hit，仅额外标注城市（title=省名、url 不变）
    const cityName = match.cities[0];
    const subtitle = cityName ? `城市：${cityName} · 省级地区` : '省级地区';
    const badges = cityName ? [`城市：${cityName}`] : [];
    scored.push({
      order: index,
      hit: buildHit(
        'region',
        region.code,
        region.name,
        subtitle,
        region.evidenceSummary || region.intro,
        match.score,
        `/regions/${encodeURIComponent(region.code)}`,
        badges,
        tokens,
      ),
    });
  });

  const sourceFields = (source: Source): FieldWeight[] => [
    field(source.id, 1000, 700, 620),
    field(source.title, 1000, 700, 520),
    field(source.authors, 420, 320, 260),
    field(source.venue, 400, 300, 240),
    field(typeof source.year === 'number' ? String(source.year) : source.year, 300, 260, 220),
    field(source.citation, 320, 260, 210),
    field(source.usage, 165, 145, 120),
    field(source.caveats?.join(' '), 130, 115, 100),
  ];

  store.sources.forEach((source: Source, index: number) => {
    const match = scoreFields(sourceFields(source), tokens, whole);
    if (match.score <= 0) return;
    const typeLabel = SOURCE_TYPE_LABELS[source.type] ?? source.type;
    const meta = [source.venue, source.year].filter((part) => part !== undefined && part !== '').join(' · ');
    const sourceUrl = source.url ?? (source.doi ? `https://doi.org/${source.doi}` : `/sources#${source.id}`);
    scored.push({
      order: index,
      hit: buildHit(
        'source',
        source.id,
        source.title,
        [meta, typeLabel].filter(Boolean).join(' · '),
        source.usage || source.citation || source.title,
        match.score,
        sourceUrl,
        [typeLabel],
        tokens,
      ),
    });
  });

  scored.sort(
    (a, b) =>
      b.hit.score - a.hit.score ||
      KIND_ORDER[a.hit.kind] - KIND_ORDER[b.hit.kind] ||
      a.order - b.order ||
      a.hit.id.localeCompare(b.hit.id),
  );

  const hits = scored.slice(0, SEARCH_HITS_LIMIT).map((item) => item.hit);
  const grouped: Record<SearchKind, SearchHit[]> = { parasite: [], food: [], region: [], source: [] };
  for (const item of scored) {
    if (grouped[item.hit.kind].length < SEARCH_GROUP_LIMIT) grouped[item.hit.kind].push(item.hit);
  }
  return { query, hits, grouped };
}

/* -------------------------------------------------------------------------- */
/* 供 explore / RAG 复用的辅助（避免重复实现关键词判定）                         */
/* -------------------------------------------------------------------------- */

export function textIncludesAny(text: string | undefined, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

export function firstMatchedToken(text: string | undefined, tokens: string[]): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  return tokens.find((token) => lower.includes(token.toLowerCase()));
}

export type { FoodSummary, ParasiteSummary, RegionSummary };
