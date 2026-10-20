import { useMemo, useState } from 'react';
import { ChevronDown, MapPin, RotateCcw, Search, X } from 'lucide-react';
import type { ExplorePreparationOption, SeasonId } from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { cn } from '@/lib/utils';
import { SEASON_LABELS, SEASON_ORDER } from '@/lib/query-context';
import { PREPARATION_FALLBACK } from '@/lib/format';

export interface ConditionsProps {
  provinceName: string | null;
  season: SeasonId | null;
  foodId: string | null;
  preparationTag: ExplorePreparationOption['tag'] | null;
  preparationOptions: ExplorePreparationOption[];
  preparationOptionsLoading: boolean;
  onOpenProvince: () => void;
  onSeasonChange: (season: SeasonId | null) => void;
  onFoodChange: (foodId: string | null) => void;
  onPreparationChange: (tag: ExplorePreparationOption['tag'] | null) => void;
  onClear: () => void;
  hasAny: boolean;
  className?: string;
}

function conditionSummary(provinceName: string | null, season: SeasonId | null, foodName: string | null, prepLabel: string | null) {
  return [provinceName, season ? SEASON_LABELS[season] : null, foodName, prepLabel].filter(Boolean).join(' · ');
}

/**
 * 探索页唯一的一套条件：地区 / 季节 / 食物 / 做法。
 * 移动端默认展开、可折叠；桌面端始终平铺。
 */
export function Conditions({
  provinceName,
  season,
  foodId,
  preparationTag,
  preparationOptions,
  preparationOptionsLoading,
  onOpenProvince,
  onSeasonChange,
  onFoodChange,
  onPreparationChange,
  onClear,
  hasAny,
  className,
}: ConditionsProps) {
  const { foods, taxonomy } = useAtlas();
  const [expanded, setExpanded] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 640px)').matches,
  );

  const foodGroups = useMemo(() => {
    return [...taxonomy.foodCategories]
      .sort((a, b) => a.order - b.order)
      .map((category) => ({
        category,
        items: foods.filter((food) => food.categoryId === category.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [foods, taxonomy]);

  const foodName = foodId ? foods.find((food) => food.id === foodId)?.name ?? null : null;
  const preparationLabel = preparationTag
    ? preparationOptions.find((option) => option.tag === preparationTag)?.label ??
      PREPARATION_FALLBACK[preparationTag]?.name ??
      preparationTag
    : null;
  const summary = conditionSummary(provinceName, season, foodName, preparationLabel);

  return (
    <section
      data-testid="explore-conditions"
      aria-label="查询条件"
      className={cn('border border-ink/40 bg-paper-light/45 shadow-[5px_5px_0_rgba(37,54,45,.06)]', className)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-ink/20 px-4 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <h2 className="whitespace-nowrap font-serif text-[16px] font-semibold text-ink">按条件查找</h2>
          <span className="truncate font-kai text-[10.5px] text-ink-muted sm:text-[11px]">
            {summary || '四项条件都可以独立选择'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {hasAny && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 border-b border-ink/30 pb-px font-kai text-[10.5px] text-ink-muted transition hover:border-terracotta-700 hover:text-terracotta-700"
            >
              <RotateCcw size={10} aria-hidden />
              清除
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 border-b border-ink/30 pb-px font-kai text-[10.5px] text-ink-muted md:hidden"
          >
            {expanded ? '收起条件' : '展开条件'}
            <ChevronDown size={11} className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden />
          </button>
        </div>
      </div>

      <div className={cn('gap-x-0 gap-y-3 px-4 py-3 md:grid md:grid-cols-[1.05fr_1.1fr_1.1fr_1.5fr] md:gap-0 md:px-0 md:py-0', expanded ? 'grid grid-cols-1' : 'hidden md:grid')}>
        {/* 地区 */}
        <div className="md:border-r md:border-line/50 md:px-4 md:py-3">
          <p className="font-kai text-[10px] tracking-[0.12em] text-ink-faint">地区</p>
          <button
            type="button"
            onClick={onOpenProvince}
            className="mt-1.5 flex w-full items-center justify-between gap-2 border-b border-line-strong/60 pb-1 text-left font-kai text-[13px] text-ink transition hover:border-ink"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin size={12} className="shrink-0 text-jade-700" aria-hidden />
              <span className="truncate">{provinceName ?? '不限地区'}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-ink-faint">
              选择省份
              <ChevronDown size={11} aria-hidden />
            </span>
          </button>
        </div>

        {/* 季节 */}
        <div className="md:border-r md:border-line/50 md:px-4 md:py-3">
          <p className="font-kai text-[10px] tracking-[0.12em] text-ink-faint">季节</p>
          <div className="mt-1.5 flex gap-1" role="group" aria-label="选择季节">
            {SEASON_ORDER.map((id) => {
              const active = season === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSeasonChange(active ? null : id)}
                  className={cn(
                    'flex-1 border py-1 font-kai text-[11.5px] tracking-[0.04em] transition',
                    active
                      ? 'border-ink bg-ink text-paper-light'
                      : 'border-line bg-paper-light/60 text-ink-muted hover:border-ink/50 hover:text-ink',
                  )}
                >
                  {SEASON_LABELS[id].replace('季', '')}
                </button>
              );
            })}
          </div>
        </div>

        {/* 食物 */}
        <div className="md:border-r md:border-line/50 md:px-4 md:py-3">
          <label htmlFor="explore-food" className="font-kai text-[10px] tracking-[0.12em] text-ink-faint">
            食物
          </label>
          <div className="relative mt-1.5">
            <select
              id="explore-food"
              value={foodId ?? ''}
              onChange={(event) => onFoodChange(event.target.value || null)}
              className="h-8 w-full appearance-none truncate border border-line bg-paper-light/70 px-2 pr-6 font-kai text-[12.5px] tracking-[0.02em] text-ink transition hover:border-ink/50 focus:border-ink focus:outline-none"
            >
              <option value="">不限食物</option>
              {foodGroups.map((group) => (
                <optgroup key={group.category.id} label={group.category.name}>
                  {group.items.map((food) => (
                    <option key={food.id} value={food.id}>
                      {food.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
          </div>
        </div>

        {/* 做法 */}
        <div className="md:px-4 md:py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-kai text-[10px] tracking-[0.12em] text-ink-faint">做法</p>
            <span className="font-kai text-[9.5px] text-ink-faint">
              {foodId ? '按所选食物给出' : '可以先选通用做法'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="选择做法">
            {preparationOptionsLoading ? (
              <span className="font-kai text-[11px] text-ink-faint">正在读取做法…</span>
            ) : preparationOptions.length === 0 ? (
              <span className="font-kai text-[11px] text-ink-faint">选择食物后显示适用做法</span>
            ) : (
              preparationOptions.slice(0, 8).map((option) => {
                const active = preparationTag === option.tag;
                return (
                  <button
                    key={option.tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPreparationChange(active ? null : option.tag)}
                    className={cn(
                      'border px-2 py-1 font-kai text-[11px] tracking-[0.02em] transition',
                      active
                        ? 'border-ink bg-ink text-paper-light'
                        : 'border-line bg-paper-light/60 text-ink-muted hover:border-ink/50 hover:text-ink',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 地区选择（复用 Modal，保持键盘可达）                                   */
/* ------------------------------------------------------------------ */

import type { RegionSummary } from '@shared/types';
import { Modal } from './Modal';
import { mapEvidenceCategory, MAP_CATEGORY_LABEL } from '@/components/map/ExploreMap';

export function ProvincePicker({
  open,
  onClose,
  regions,
  selectedCode,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  regions: RegionSummary[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return regions;
    return regions.filter((region) => `${region.name}${region.shortName}${region.code}`.includes(keyword));
  }, [regions, query]);

  return (
    <Modal open={open} onClose={onClose} title="选择地区" description="选择后可在地图上定位，结果会带上该地区的本地资料。">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索省份名称"
          aria-label="搜索省份名称"
          className="h-9 w-full border border-line bg-paper-light/60 pl-8 pr-8 text-[12px] text-ink transition focus:border-ink focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清除搜索"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint transition hover:text-ink"
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {filtered.map((region) => {
          const active = region.code === selectedCode;
          const category = mapEvidenceCategory(region);
          return (
            <button
              key={region.code}
              type="button"
              onClick={() => {
                onSelect(region.code);
                onClose();
              }}
              className={cn(
                'flex min-w-0 items-center justify-between gap-2 border px-2.5 py-2 text-left font-kai text-[12px] transition',
                active
                  ? 'border-ink bg-ink text-paper-light'
                  : 'border-line bg-paper-light/45 text-ink-soft hover:border-ink/60 hover:text-ink',
              )}
            >
              <span className="min-w-0 truncate">{region.name}</span>
              <span className={cn('shrink-0 text-[9.5px]', active ? 'text-paper/70' : 'text-ink-faint')}>
                {MAP_CATEGORY_LABEL[category]}
              </span>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="mt-3 font-kai text-[11px] text-ink-muted">没有匹配的省份。</p>
      )}
    </Modal>
  );
}


