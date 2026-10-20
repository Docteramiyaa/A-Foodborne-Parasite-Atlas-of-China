import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Microscope } from 'lucide-react';
import type { ParasiteCategory } from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Button } from '@/components/ui/Button';
import { LoadingDots } from '@/components/ui/States';
import {
  ActiveFilters,
  FilterChip,
  FilterPanel,
  SearchField,
  type ActiveFilterItem,
} from '@/components/catalog/CatalogFilters';
import { ParasiteGridModule } from '@/components/catalog/EditorialModules';
import { FieldCatalogGrid, FieldEmpty, FieldPageHeader } from '@/components/catalog/FieldNotes';
import { useSearchHits } from '@/components/catalog/useSearchHits';

/**
 * 寄生虫索引：按名称与类别浏览。
 * 不展示证据等级、证据数量、地区覆盖数，也不置顶任何条目。
 */
export function ParasitesPage() {
  const { parasites, taxonomy, loading } = useAtlas();
  useDocumentTitle('寄生虫图鉴', '按名称与类别浏览常见食源性寄生虫，查看生活史、风险场景与防护。');

  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const resetFilters = () => setParams(new URLSearchParams(), { replace: true });
  const searchHits = useSearchHits('parasite', q);

  const categories = useMemo(() => {
    const ordered = [...taxonomy.parasiteCategories]
      .sort((a, b) => a.order - b.order)
      .filter((item) => parasites.some((parasite) => parasite.category === item.id))
      .map((item) => ({ id: item.id as ParasiteCategory, name: item.name }));
    if (ordered.length > 0) return ordered;
    const seen = new Map<ParasiteCategory, string>();
    parasites.forEach((parasite) => {
      if (!seen.has(parasite.category)) seen.set(parasite.category, parasite.categoryLabel);
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [taxonomy.parasiteCategories, parasites]);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return parasites.filter((parasite) => {
      if (category && parasite.category !== category) return false;
      if (keyword) {
        const haystack = [parasite.name, parasite.latinName, parasite.categoryLabel, parasite.tagline]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(keyword) && !searchHits.ids?.has(parasite.id)) return false;
      }
      return true;
    });
  }, [parasites, category, q, searchHits.ids]);

  const activeFilters: ActiveFilterItem[] = [];
  if (q.trim()) {
    activeFilters.push({ key: 'q', label: `名称「${q.trim()}」`, onRemove: () => updateParam('q', '') });
  }
  if (category) {
    const name = categories.find((item) => item.id === category)?.name ?? category;
    activeFilters.push({ key: 'category', label: `类别：${name}`, onRemove: () => updateParam('category', '') });
  }

  return (
    <div data-testid="parasites-index" className="field-paper pb-14">
      <FieldPageHeader
        breadcrumbs={[
          { label: '首页', to: '/' },
          { label: '图鉴', to: '/atlas' },
          { label: '寄生虫' },
        ]}
        title="寄生虫图鉴"
        lead="按名称与类别浏览常见食源性寄生虫，查看它们的生活史、风险场景与防护。"
      />

      <section className="mx-auto w-full max-w-shell px-5 md:px-8">
        <div className="border-b border-line py-4 md:py-5">
          <FilterPanel
            id="parasite-filters"
            activeCount={activeFilters.length}
            summary={`显示 ${filtered.length} 种`}
          >
            <div className="space-y-4">
              <SearchField
                value={q}
                onChange={(value) => updateParam('q', value)}
                label="搜索寄生虫"
                placeholder="搜索名称或学名，如「肝吸虫」「华支睾吸虫」"
              />
              <div role="group" aria-label="按类别筛选">
                <p className="field-label mb-2 text-[12px]">类别</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterChip active={!category} onClick={() => updateParam('category', '')}>
                    全部
                  </FilterChip>
                  {categories.map((item) => (
                    <FilterChip
                      key={item.id}
                      active={category === item.id}
                      onClick={() => updateParam('category', category === item.id ? '' : item.id)}
                    >
                      {item.name}
                    </FilterChip>
                  ))}
                </div>
              </div>
            </div>
          </FilterPanel>
          <ActiveFilters items={activeFilters} onClear={resetFilters} className="mt-4 border-t border-ink/20 pt-3" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-shell px-5 pt-6 md:px-8">
        <h2 className="sr-only">寄生虫列表</h2>
        <div id="parasite-results" className="scroll-mt-24">
          {filtered.length > 0 ? (
            <FieldCatalogGrid>
              {filtered.map((parasite) => (
                <ParasiteGridModule key={parasite.id} parasite={parasite} />
              ))}
            </FieldCatalogGrid>
          ) : loading && !q.trim() ? (
            <div className="flex justify-center py-16">
              <LoadingDots label="正在加载知识库…" />
            </div>
          ) : (
            <FieldEmpty
              title="没有匹配的寄生虫"
              description="换个名称，或清除类别筛选后再试。"
              icon={<Microscope size={18} />}
              action={
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  清除筛选
                </Button>
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}
