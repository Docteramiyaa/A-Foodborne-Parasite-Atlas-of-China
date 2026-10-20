import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { SourceType } from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Button } from '@/components/ui/Button';
import { LoadingDots } from '@/components/ui/States';
import { SOURCE_TYPE_LABEL } from '@/components/ui/SourceList';
import {
  ActiveFilters,
  FilterChip,
  FilterPanel,
  SearchField,
  type ActiveFilterItem,
} from '@/components/catalog/CatalogFilters';
import { SOURCE_TYPE_ORDER, SourceIndexRow } from '@/components/catalog/SourceIndexRow';
import { FieldEmpty, FieldPageHeader } from '@/components/catalog/FieldNotes';

/**
 * 依据：知识库引用的来源清单。
 * 只呈现题名、作者、年份、出处与可访问链接，不重复可靠性/证据分级。
 */
export function SourcesPage() {
  const { sources, loading } = useAtlas();
  useDocumentTitle('来源', '知识库引用的指南、监测报告、研究与机构资料清单。');

  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const resetFilters = () => setParams(new URLSearchParams(), { replace: true });

  const types = useMemo(
    () =>
      SOURCE_TYPE_ORDER.filter((item) => sources.some((source) => source.type === item)).map((item) => ({
        id: item,
        name: SOURCE_TYPE_LABEL[item] ?? item,
      })),
    [sources],
  );

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return sources
      .filter((source) => {
        if (type && source.type !== type) return false;
        if (!keyword) return true;
        const haystack = [
          source.id,
          source.title,
          source.authors ?? '',
          source.venue ?? '',
          String(source.year),
          source.citation ?? '',
          SOURCE_TYPE_LABEL[source.type] ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  }, [sources, q, type]);

  const activeFilters: ActiveFilterItem[] = [];
  if (q.trim()) {
    activeFilters.push({ key: 'q', label: `关键词「${q.trim()}」`, onRemove: () => updateParam('q', '') });
  }
  if (type) {
    activeFilters.push({
      key: 'type',
      label: `类型：${SOURCE_TYPE_LABEL[type as SourceType] ?? type}`,
      onRemove: () => updateParam('type', ''),
    });
  }

  return (
    <div data-testid="sources-page" className="field-paper pb-14">
      <FieldPageHeader
        breadcrumbs={[{ label: '首页', to: '/' }, { label: '依据' }]}
        title="来源"
        lead="知识库引用的指南、监测报告、研究与机构资料；可以直接打开原文。"
      />

      <section className="mx-auto w-full max-w-shell px-5 md:px-8">
        <div className="border-b border-line py-4 md:py-5">
          <FilterPanel id="source-filters" activeCount={activeFilters.length} summary={`显示 ${filtered.length} 份`}>
            <div className="space-y-4">
              <SearchField
                value={q}
                onChange={(value) => updateParam('q', value)}
                label="搜索来源"
                placeholder="搜索题名、作者、期刊或编号，如「CDC」「S06」「华支睾吸虫」"
              />
              <div role="group" aria-label="按类型筛选">
                <p className="field-label mb-2 text-[12px]">类型</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterChip active={!type} onClick={() => updateParam('type', '')}>
                    全部
                  </FilterChip>
                  {types.map((item) => (
                    <FilterChip
                      key={item.id}
                      active={type === item.id}
                      onClick={() => updateParam('type', type === item.id ? '' : item.id)}
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

      <section className="mx-auto w-full max-w-shell px-5 pt-2 md:px-8">
        <h2 className="sr-only">来源清单</h2>
        <div id="source-results" className="scroll-mt-24">
          {filtered.length > 0 ? (
            <ol className="border-t border-line">
              {filtered.map((source) => (
                <li key={source.id}>
                  <SourceIndexRow source={source} />
                </li>
              ))}
            </ol>
          ) : loading && !q.trim() ? (
            <div className="flex justify-center py-16">
              <LoadingDots label="正在加载来源…" />
            </div>
          ) : (
            <FieldEmpty
              title="没有匹配的来源"
              description="换一个关键词或类型，或清除筛选后再试。"
              icon={<FileText size={18} />}
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
