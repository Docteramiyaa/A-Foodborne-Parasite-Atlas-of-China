import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { ExampleDish, FoodPreparation, RegionStatus } from '@shared/types';
import { RiskBadge } from '@/components/ui/Badge';
import { useAtlas } from '@/lib/atlas';
import { paths } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ParasiteLinks, PreparationTags } from './Shared';

/* ========================================================================== */
/* 处理方式与风险                                                               */
/* ========================================================================== */

export function PreparationMatrix({
  preparations,
  className,
}: {
  preparations: readonly FoodPreparation[] | null | undefined;
  className?: string;
}) {
  const list = preparations ?? [];
  if (list.length === 0) {
    return <p className="font-kai text-[13px] text-ink-muted">该食物的处理方式资料尚未收录。</p>;
  }
  return (
    <div className={cn('border-t border-ink/25', className)}>
      {list.map((preparation, index) => (
        <article
          key={`${preparation.tag}-${index}`}
          className="grid gap-3 border-b border-ink/20 py-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-[16.5px] font-semibold leading-snug tracking-[0.01em] text-ink">
                {preparation.label}
              </h3>
              <RiskBadge level={preparation.risk} />
            </div>
            <ParasiteLinks ids={preparation.parasiteIds} className="mt-2.5" prefix="相关寄生虫" />
          </div>

          <div className="min-w-0">
            <p className="font-kai text-[12.5px] leading-7 tracking-[0.02em] text-ink-soft">{preparation.explanation}</p>
            {preparation.saferAlternative && (
              <div className="mt-3 border-l-2 border-jade-700/70 pl-3.5">
                <p className="flex items-center gap-1.5 font-kai text-[9.5px] tracking-[0.1em] text-jade-800">
                  <ShieldCheck size={11} aria-hidden />
                  更安全的做法
                </p>
                <p className="mt-1 font-kai text-[12px] leading-6 tracking-[0.02em] text-ink-soft">
                  {preparation.saferAlternative}
                </p>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

/* ========================================================================== */
/* 常见吃法                                                                     */
/* ========================================================================== */

export function DishCard({ dish, className }: { dish: ExampleDish; className?: string }) {
  return (
    <article
      className={cn(
        'flex h-full flex-col border border-ink/25 bg-paper-light/45 p-5 shadow-[5px_5px_0_rgba(37,54,45,0.06)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-serif text-[16.5px] font-semibold leading-snug tracking-[0.01em] text-ink">{dish.name}</h3>
        <PreparationTags tags={dish.preparationTags} />
      </div>
      {dish.context && (
        <p className="mt-2 font-kai text-[10.5px] leading-5 tracking-[0.02em] text-ink-faint">{dish.context}</p>
      )}
      <p className="mt-3 flex-1 font-kai text-[12.5px] leading-6 tracking-[0.02em] text-ink-soft">{dish.riskNote}</p>
      <ParasiteLinks ids={dish.parasiteIds} className="mt-3 border-t border-ink/20 pt-3" />
    </article>
  );
}

/* ========================================================================== */
/* 涉及地区                                                                     */
/* ========================================================================== */

export interface FoodRegionItem {
  code: string;
  name: string;
  status: RegionStatus;
  headline: string;
}

interface GroupedFoodRegion {
  code: string;
  name: string;
  headlines: string[];
}

/** 合并同一省份的多条记载（不改写内容） */
export function groupFoodRegions(regions: readonly FoodRegionItem[]): GroupedFoodRegion[] {
  const map = new Map<string, GroupedFoodRegion>();
  for (const region of regions) {
    const existing = map.get(region.code);
    if (!existing) {
      map.set(region.code, {
        code: region.code,
        name: region.name,
        headlines: region.headline ? [region.headline] : [],
      });
      continue;
    }
    if (region.headline && !existing.headlines.includes(region.headline)) existing.headlines.push(region.headline);
  }
  return [...map.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'zh-Hans-CN'));
}

export function FoodRegions({
  regions,
  className,
}: {
  regions: readonly FoodRegionItem[] | null | undefined;
  className?: string;
}) {
  const { regionByCode } = useAtlas();
  const list = groupFoodRegions(regions ?? []);
  if (list.length === 0) {
    return <p className="font-kai text-[13px] text-ink-muted">暂未收录与具体地区相关的资料。</p>;
  }
  return (
    <ul className={cn('border-t border-ink/25', className)}>
      {list.map((item) => {
        const summary = regionByCode.get(item.code);
        return (
          <li key={item.code} className="border-b border-ink/20">
            <Link to={paths.region(item.code)} className="group block px-1 py-3.5 transition hover:bg-paper-light/35">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-serif text-[15px] font-semibold leading-5 tracking-[0.01em] text-ink transition group-hover:text-terracotta-700">
                  {summary?.shortName ?? item.name}
                </span>
                <ArrowUpRight
                  size={14}
                  className="ml-auto shrink-0 text-ink-faint transition duration-300 group-hover:text-terracotta-700"
                  aria-hidden
                />
              </div>
              {item.headlines.length > 0 && (
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-kai text-[11px] leading-5 tracking-[0.02em] text-ink-muted">
                  {item.headlines.slice(0, 2).map((headline) => (
                    <span key={headline} className="line-clamp-1">
                      {headline}
                    </span>
                  ))}
                  {item.headlines.length > 2 && (
                    <span className="shrink-0 font-mono text-[9.5px] text-ink-faint">+{item.headlines.length - 2}</span>
                  )}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
