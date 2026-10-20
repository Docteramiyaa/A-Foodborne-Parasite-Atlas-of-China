import { useMemo } from 'react';
import type { SearchKind } from '@shared/types';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

export interface CatalogSearchHits {
  /** 服务端检索命中的实体 id；未检索或检索失败时为 null（页面可退回本地过滤） */
  ids: ReadonlySet<string> | null;
  loading: boolean;
}

/**
 * 索引页的关键词检索增强：`/api/search` 能匹配别名、菜名与正文，
 * 而 atlas 摘要只带有限字段。这里返回对应类型的命中 id 集合，与本地过滤取并集。
 * 请求失败时静默退回本地过滤，不阻塞页面。
 */
export function useSearchHits(kind: SearchKind, query: string): CatalogSearchHits {
  const trimmed = query.trim();
  const { data, loading } = useAsync(
    () => (trimmed ? api.search(trimmed).catch(() => null) : Promise.resolve(null)),
    [trimmed],
  );

  const ids = useMemo(() => {
    if (!trimmed || !data) return null;
    /* useAsync 在新请求期间会保留旧数据，用响应中的 query 防止旧结果短暂覆盖 */
    if (data.query !== trimmed) return null;
    const merged = new Set<string>();
    for (const hit of data.grouped?.[kind] ?? []) merged.add(hit.id);
    for (const hit of data.hits ?? []) {
      if (hit.kind === kind) merged.add(hit.id);
    }
    return merged;
  }, [trimmed, data, kind]);

  return { ids, loading: trimmed !== '' && loading && ids === null };
}
