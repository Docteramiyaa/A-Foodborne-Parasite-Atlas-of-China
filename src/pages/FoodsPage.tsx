import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';
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
import { FoodGridModule } from '@/components/catalog/EditorialModules';
import { FieldCatalogGrid, FieldEmpty, FieldPageHeader } from '@/components/catalog/FieldNotes';
import { useSearchHits } from '@/components/catalog/useSearchHits';

/**
 * 食物索引：按名称与类别浏览。
 * 不置顶任何食物，也不以关联寄生虫数量、证据等级或处理方式矩阵组织页面。
 */
export function FoodsPage() {
  const { foods, taxonomy, loading } = useAtlas();
  useDocumentTitle('食物与处理方式', '按名称与类别浏览常见食材，了解不同处理方式与更安全的做法。');

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
  const searchHits = useSearchHits('food', q);

  const categories = useMemo(() => {
    const ordered = [...taxonomy.foodCategories]
      .sort((a, b) => a.order - b.order)
      .filter((item) => foods.some((food) => food.categoryId === item.id))
      .map((item) => ({ id: String(item.id), name: item.name }));
    if (ordered.length > 0) return ordered;
    const seen = new Map<string, string>();
    foods.forEach((food) => {
      if (!seen.has(food.categoryId)) seen.set(food.categoryId, food.categoryLabel);
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [taxonomy.foodCategories, foods]);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return foods.filter((food) => {
      if (category && food.categoryId !== category) return false;
      if (keyword) {
        const haystack = [food.name, food.categoryLabel, food.tagline].join(' ').toLowerCase();
        if (!haystack.includes(keyword) && !searchHits.ids?.has(food.id)) return false;
      }
      return true;
    });
  }, [foods, category, q, searchHits.ids]);

  const activeFilters: ActiveFilterItem[] = [];
  if (q.trim()) {
    activeFilters.push({ key: 'q', label: `名称「${q.trim()}」`, onRemove: () => updateParam('q', '') });
  }
  if (category) {
    const name = categories.find((item) => item.id === category)?.name ?? category;
    activeFilters.push({ key: 'category', label: `类别：${name}`, onRemove: () => updateParam('category', '') });
  }

  return (
    <div data-testid="foods-index" className="field-paper pb-14">
      <FieldPageHeader
        breadcrumbs={[
          { label: '首页', to: '/' },
          { label: '图鉴', to: '/atlas' },
          { label: '食物' },
        ]}
        title="食物与处理方式"
        lead="按名称与类别浏览常见食材，了解不同处理方式与更安全的做法。"
      />

      <section className="mx-auto w-full max-w-shell px-5 md:px-8">
        <div className="border-b border-line py-4 md:py-5">
          <FilterPanel
            id="food-filters"
            activeCount={activeFilters.length}
            summary={`显示 ${filtered.length} 类`}
          >
            <div className="space-y-4">
              <SearchField
                value={q}
                onChange={(value) => updateParam('q', value)}
                label="搜索食物"
                placeholder="搜索食物名称，如「鱼生」「福寿螺」「荸荠」"
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
        <h2 className="sr-only">食物列表</h2>
        <div id="food-results" className="scroll-mt-24">
          {filtered.length > 0 ? (
            <FieldCatalogGrid>
              {filtered.map((food) => (
                <FoodGridModule key={food.id} food={food} />
              ))}
            </FieldCatalogGrid>
          ) : loading && !q.trim() ? (
            <div className="flex justify-center py-16">
              <LoadingDots label="正在加载知识库…" />
            </div>
          ) : (
            <FieldEmpty
              title="没有匹配的食物"
              description="换个名称，或清除类别筛选后再试。"
              icon={<UtensilsCrossed size={18} />}
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
