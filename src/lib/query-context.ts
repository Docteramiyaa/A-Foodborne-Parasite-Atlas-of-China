/**
 * 跨页面查询上下文（地区 / 探索 / 对话共用）
 * ------------------------------------------------------------
 * 探索页的 URL 条件已改为四季：`?province=440000&season=summer&food=freshwater-fish&prep=raw`。
 * 旧链接中的 `month=` / `q=` 仍然解析并原样保留，用于兼容对话页和详情页带过来的上下文；
 * 探索页本身不再展示或写入月份 / 关键词，会把旧 `month` 折算成季节。
 */
import type { PreparationTag, SeasonId } from '@shared/types';

export type MapMode = 'evidence' | 'parasite' | 'food';

export const MAP_MODES: MapMode[] = ['evidence', 'parasite', 'food'];

export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_LABELS: Record<SeasonId, string> = {
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
};

export const SEASON_MONTHS: Record<SeasonId, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

export function isSeasonId(value: string | null | undefined): value is SeasonId {
  return value === 'spring' || value === 'summer' || value === 'autumn' || value === 'winter';
}

export function seasonForMonth(month: number): SeasonId | null {
  for (const id of SEASON_ORDER) {
    if (SEASON_MONTHS[id].includes(month)) return id;
  }
  return null;
}

export function seasonsFromMonths(months: number[]): SeasonId[] {
  const set = new Set<SeasonId>();
  for (const month of months) {
    const season = seasonForMonth(month);
    if (season) set.add(season);
  }
  return SEASON_ORDER.filter((id) => set.has(id));
}

export function monthsForSeasons(seasons: SeasonId[]): number[] {
  const set = new Set<number>();
  for (const id of seasons) for (const month of SEASON_MONTHS[id]) set.add(month);
  return Array.from(set).sort((a, b) => a - b);
}

export interface QueryContext {
  provinceCodes: string[];
  /** 新：四季（探索页使用） */
  seasons: SeasonId[];
  /** @deprecated 旧 URL 兼容；对话页仍使用逐月上下文 */
  months: number[];
  foodIds: string[];
  preparationTags: PreparationTag[];
  parasiteIds: string[];
  /** @deprecated 旧 URL 兼容；探索页不再使用关键词 */
  q: string;
}

export const EMPTY_QUERY_CONTEXT: QueryContext = {
  provinceCodes: [],
  seasons: [],
  months: [],
  foodIds: [],
  preparationTags: [],
  parasiteIds: [],
  q: '',
};

function splitUnique(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.split(',').map((part) => part.trim()).filter(Boolean)));
}

function parseMonths(raw: string | null): number[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((month): month is number => Number.isInteger(month) && month >= 1 && month <= 12),
    ),
  ).sort((a, b) => a - b);
}

function parseSeasons(raw: string | null): SeasonId[] {
  const seen = new Set<SeasonId>();
  for (const part of splitUnique(raw)) {
    if (isSeasonId(part)) seen.add(part);
  }
  return SEASON_ORDER.filter((id) => seen.has(id));
}

/** 从 URLSearchParams 读取查询上下文（不做数据存在性校验） */
export function parseQueryContext(params: URLSearchParams): QueryContext {
  return {
    provinceCodes: splitUnique(params.get('province')),
    seasons: parseSeasons(params.get('season')),
    months: parseMonths(params.get('month')),
    foodIds: splitUnique(params.get('food')),
    preparationTags: splitUnique(params.get('prep')) as PreparationTag[],
    parasiteIds: splitUnique(params.get('parasite')),
    q: (params.get('q') ?? '').slice(0, 100),
  };
}

/** 写回 URLSearchParams（省略空值，顺序稳定；兼容旧字段） */
export function serializeQueryContext(context: QueryContext): URLSearchParams {
  const params = new URLSearchParams();
  if (context.provinceCodes.length > 0) params.set('province', context.provinceCodes.join(','));
  if (context.seasons.length > 0) params.set('season', context.seasons.join(','));
  if (context.months.length > 0) params.set('month', context.months.join(','));
  if (context.foodIds.length > 0) params.set('food', context.foodIds.join(','));
  if (context.preparationTags.length > 0) params.set('prep', context.preparationTags.join(','));
  if (context.parasiteIds.length > 0) params.set('parasite', context.parasiteIds.join(','));
  const keyword = context.q.trim();
  if (keyword) params.set('q', keyword);
  return params;
}

/** 探索页专用序列化：只写探索条件，不写月份/关键词；parasite 仅在原始 URL 带入时保留 */
export function serializeExploreContext(
  context: QueryContext,
  options: { keepParasite?: boolean } = {},
): URLSearchParams {
  const params = new URLSearchParams();
  if (context.provinceCodes.length > 0) params.set('province', context.provinceCodes[0]);
  if (context.seasons.length > 0) params.set('season', context.seasons[0]);
  if (context.foodIds.length > 0) params.set('food', context.foodIds[0]);
  if (context.preparationTags.length > 0) params.set('prep', context.preparationTags[0]);
  if (options.keepParasite && context.parasiteIds.length > 0) {
    params.set('parasite', context.parasiteIds[0]);
  }
  return params;
}

export function mergeQueryContext(base: QueryContext, patch: Partial<QueryContext>): QueryContext {
  return { ...base, ...patch };
}

export function countQueryContext(context: QueryContext): number {
  return (
    context.provinceCodes.length +
    context.seasons.length +
    context.months.length +
    context.foodIds.length +
    context.preparationTags.length +
    context.parasiteIds.length +
    (context.q.trim() ? 1 : 0)
  );
}

export function isEmptyQueryContext(context: QueryContext): boolean {
  return countQueryContext(context) === 0;
}

/** 从 URL 推断旧地图模式（已不再用于探索页，保留给旧链接的重定向/兼容代码） */
export function inferMapMode(params: URLSearchParams): MapMode {
  const raw = params.get('mode');
  if (raw === 'parasite' || raw === 'food' || raw === 'evidence') return raw;
  if (params.get('parasite')) return 'parasite';
  if (params.get('food')) return 'food';
  return 'evidence';
}

/**
 * 旧地图链接：地图已并入 /explore 工作台。
 * 保留该函数以兼容对话/详情/图集里已有的链接生成逻辑。
 */
export function buildMapHref(context: QueryContext, mode?: MapMode): string {
  const params = serializeQueryContext(context);
  const effectiveMode =
    mode ?? (context.parasiteIds.length > 0 ? 'parasite' : context.foodIds.length > 0 ? 'food' : 'evidence');
  if (effectiveMode === 'evidence') params.delete('mode');
  else params.set('mode', effectiveMode);
  const search = params.toString();
  return search ? `/explore?${search}` : '/explore';
}

/** 条件查询链接：完整保留上下文（旧调用方可能仍带月份，探索页会折算成季节） */
export function buildExploreHref(context: QueryContext): string {
  const search = serializeQueryContext(context).toString();
  return search ? `/explore?${search}` : '/explore';
}

/**
 * 对话链接：保留地区/月份/食物/处理方式/寄生虫条件。
 * 探索页里的季节会在调用前折算成代表性月份。
 */
export function buildChatHref(context: QueryContext, question?: string): string {
  const params = serializeQueryContext({ ...context, q: '' });
  if (question?.trim()) params.set('q', question.trim().slice(0, 300));
  const search = params.toString();
  return search ? `/chat?${search}` : '/chat';
}

/** 挑选地图可聚焦的首个省份（地图当前为单省选择） */
export function primaryProvinceCode(context: QueryContext): string | null {
  return context.provinceCodes[0] ?? null;
}

export function primaryFoodId(context: QueryContext): string | null {
  return context.foodIds[0] ?? null;
}

export function primaryParasiteId(context: QueryContext): string | null {
  return context.parasiteIds[0] ?? null;
}
