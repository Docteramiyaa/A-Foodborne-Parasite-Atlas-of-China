import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useAtlas } from '@/lib/atlas';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Button } from '@/components/ui/Button';
import { LoadingDots } from '@/components/ui/States';
import { ActiveFilters, SearchField, type ActiveFilterItem } from '@/components/catalog/CatalogFilters';
import { RegionGridModule } from '@/components/catalog/EditorialModules';
import { FieldCatalogGrid, FieldEmpty, FieldPageHeader } from '@/components/catalog/FieldNotes';
import { useSearchHits } from '@/components/catalog/useSearchHits';

/**
 * 地区索引：省级地区知识目录。
 * 不展示证据状态、证据数量或地图副本；只按名称浏览并进入地区页。
 */
export function RegionsPage() {
  const { regions, loading } = useAtlas();
  useDocumentTitle('省级地区', '按名称浏览省级地区，查看当地饮食特点与相关寄生虫知识。');

  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const updateParams = (next: URLSearchParams) => setParams(next, { replace: true });
  const updateQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    updateParams(next);
  };
  const resetFilters = () => setParams(new URLSearchParams(), { replace: true });
  const searchHits = useSearchHits('region', q);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return regions;
    return regions.filter((region) => {
      const haystack = [region.name, region.shortName, region.code].join(' ').toLowerCase();
      return haystack.includes(keyword) || Boolean(searchHits.ids?.has(region.code));
    });
  }, [regions, q, searchHits.ids]);

  const activeFilters: ActiveFilterItem[] = [];
  if (q.trim()) {
    activeFilters.push({ key: 'q', label: `名称「${q.trim()}」`, onRemove: () => updateQuery('') });
  }

  return (
    <div data-testid="regions-index" className="field-paper pb-14">
      <FieldPageHeader
        breadcrumbs={[
          { label: '首页', to: '/' },
          { label: '图鉴', to: '/atlas' },
          { label: '地区' },
        ]}
        title="地区"
        lead="按名称浏览省级地区，查看当地的饮食特点与相关寄生虫知识。"
      />

      <section className="mx-auto w-full max-w-shell px-5 md:px-8">
        <div className="border-b border-line py-4 md:py-5">
          <div className="max-w-md">
            <SearchField
              value={q}
              onChange={updateQuery}
              label="搜索省级地区"
              placeholder="搜索省份名称，如「广东」「四川」"
            />
          </div>
          <ActiveFilters items={activeFilters} onClear={resetFilters} className="mt-3 border-t border-ink/20 pt-3" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-shell px-5 pt-6 md:px-8">
        <h2 className="sr-only">省级地区列表</h2>
        <div id="region-results" className="scroll-mt-24">
          {filtered.length > 0 ? (
            <FieldCatalogGrid>
              {filtered.map((region) => (
                <RegionGridModule key={region.code} region={region} />
              ))}
            </FieldCatalogGrid>
          ) : loading && !q.trim() ? (
            <div className="flex justify-center py-16">
              <LoadingDots label="正在加载知识库…" />
            </div>
          ) : (
            <FieldEmpty
              title="没有匹配的省级地区"
              description="换个名称，或清除搜索后再试。"
              icon={<MapPin size={18} />}
              action={
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  清除搜索
                </Button>
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}
