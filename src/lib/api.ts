import type {
  AtlasMeta,
  AtlasPayload,
  ChatRequest,
  ChatResponse,
  ExploreBriefing,
  FoodDetail,
  FoodSummary,
  ParasiteDetail,
  ParasiteSummary,
  RegionDetail,
  RegionSummary,
  SearchResponse,
  SeasonId,
  Source,
  Taxonomy,
} from '@shared/types';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = 'UNKNOWN') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (e) {
    throw new ApiError('无法连接到知识服务，请确认后端服务已启动。', 0, 'NETWORK_ERROR');
  }

  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    let code = 'HTTP_ERROR';
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      if (body?.error?.message) message = body.error.message;
      if (body?.error?.code) code = body.error.code;
    } catch {
      /* 忽略非 JSON 错误体 */
    }
    throw new ApiError(message, res.status, code);
  }

  return (await res.json()) as T;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

export interface ParasiteListParams {
  category?: string;
  food?: string[];
  province?: string[];
  month?: number[];
  featured?: boolean;
  q?: string;
}

export interface FoodListParams {
  category?: string;
  parasite?: string[];
  featured?: boolean;
  q?: string;
}

export interface SourceListParams {
  type?: string;
  reliability?: string;
  q?: string;
  entity?: string;
}

/**
 * 探索页条件（唯一来源为 URL）。
 * 地区/季节/食物/做法都可独立选择；season 为四季之一或多个。
 * parasite 仅用于兼容对话/详情页带入的旧链接，不在探索条件栏展示。
 */
export interface ExploreParams {
  province?: string[];
  season?: SeasonId[];
  food?: string[];
  prep?: string[];
  parasite?: string[];
}

export const api = {
  health: () => request<{ ok: boolean; version: string; uptimeMs: number; dataVersion: string }>('/health'),

  meta: () => request<AtlasMeta>('/meta'),

  atlas: () => request<AtlasPayload>('/atlas'),

  taxonomy: () => request<Taxonomy>('/meta'),

  parasites: (params?: ParasiteListParams) =>
    request<ListResponse<ParasiteSummary>>(`/parasites${buildQuery(params as Record<string, QueryValue>)}`),

  parasite: (id: string) => request<ParasiteDetail>(`/parasites/${encodeURIComponent(id)}`),

  foods: (params?: FoodListParams) =>
    request<ListResponse<FoodSummary>>(`/foods${buildQuery(params as Record<string, QueryValue>)}`),

  food: (id: string) => request<FoodDetail>(`/foods/${encodeURIComponent(id)}`),

  regions: () => request<{ items: RegionSummary[] }>('/regions'),

  region: (code: string) => request<RegionDetail>(`/regions/${encodeURIComponent(code)}`),

  sources: (params?: SourceListParams) =>
    request<ListResponse<Source>>(`/sources${buildQuery(params as Record<string, QueryValue>)}`),

  search: (q: string) => request<SearchResponse>(`/search${buildQuery({ q })}`),

  exploreBriefing: (params: ExploreParams) =>
    request<ExploreBriefing>(`/explore/briefing${buildQuery(params as Record<string, QueryValue>)}`),

  chat: (body: ChatRequest) =>
    request<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify(body) }),

  chatSuggestions: () => request<{ suggestions: string[] }>('/chat/suggestions'),
};

