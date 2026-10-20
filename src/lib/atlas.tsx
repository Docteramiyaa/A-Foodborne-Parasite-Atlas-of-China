import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AtlasMeta,
  AtlasPayload,
  FoodSummary,
  ParasiteSummary,
  RegionSummary,
  Source,
  Taxonomy,
} from '@shared/types';
import { api } from './api';

interface AtlasContextValue {
  meta: AtlasMeta | null;
  taxonomy: Taxonomy;
  parasites: ParasiteSummary[];
  foods: FoodSummary[];
  regions: RegionSummary[];
  sources: Source[];
  parasiteById: ReadonlyMap<string, ParasiteSummary>;
  foodById: ReadonlyMap<string, FoodSummary>;
  regionByCode: ReadonlyMap<string, RegionSummary>;
  sourceById: ReadonlyMap<string, Source>;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

const AtlasContext = createContext<AtlasContextValue | null>(null);

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<AtlasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .atlas()
      .then((data) => {
        if (alive) setPayload(data);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<AtlasContextValue>(() => {
    const parasites = payload?.parasites ?? [];
    const foods = payload?.foods ?? [];
    const regions = payload?.regions ?? [];
    const sources = payload?.sources ?? [];
    return {
      meta: payload?.meta ?? null,
      taxonomy:
        payload?.taxonomy ??
        ({
          foodCategories: [],
          preparations: [],
          parasiteCategories: [],
          regionStatuses: [],
          evidenceLevels: [],
        } as Taxonomy),
      parasites,
      foods,
      regions,
      sources,
      parasiteById: new Map(parasites.map((p) => [p.id, p])),
      foodById: new Map(foods.map((f) => [f.id, f])),
      regionByCode: new Map(regions.map((r) => [r.code, r])),
      sourceById: new Map(sources.map((s) => [s.id, s])),
      loading,
      error,
      reload,
    };
  }, [payload, loading, error, reload]);

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas(): AtlasContextValue {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error('useAtlas 必须在 <AtlasProvider> 内使用');
  return ctx;
}

export function useParasiteSummary(id: string | undefined | null) {
  const { parasiteById } = useAtlas();
  return id ? parasiteById.get(id) ?? null : null;
}

export function useFoodSummary(id: string | undefined | null) {
  const { foodById } = useAtlas();
  return id ? foodById.get(id) ?? null : null;
}

export function useRegionSummary(code: string | undefined | null) {
  const { regionByCode } = useAtlas();
  return code ? regionByCode.get(code) ?? null : null;
}

export function useSourceLabeler() {
  const { sourceById } = useAtlas();
  return useCallback(
    (id: string) => {
      const s = sourceById.get(id);
      return s ? { ...s, display: `${s.title}` } : null;
    },
    [sourceById],
  );
}

/** 省份名匹配（用于从 URL/对话上下文回显） */
export function normalizeRegionCode(input: string | number | undefined | null): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (/^\d{6}$/.test(s)) return s;
  if (/^\d{2}$/.test(s)) {
    const full = `${s}0000`;
    return full;
  }
  return null;
}
