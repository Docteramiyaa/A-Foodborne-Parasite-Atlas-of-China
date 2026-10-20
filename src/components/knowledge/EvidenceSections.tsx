import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { Seasonality } from '@shared/types';
import { paths } from '@/lib/format';
import { useAtlas } from '@/lib/atlas';
import { cn } from '@/lib/utils';
import { MonthStrip } from './Shared';

/* ========================================================================== */
/* 寄生虫详情：各地资料                                                         */
/* ========================================================================== */

export interface ParasiteRegionMaterial {
  code: string;
  name: string;
  headline: string;
}

/** 各地资料：按地区名称排列，不按资料等级或数量排序 */
export function RegionMaterials({
  materials,
  className,
}: {
  materials: readonly ParasiteRegionMaterial[] | null | undefined;
  className?: string;
}) {
  const { regionByCode } = useAtlas();
  const list = [...(materials ?? [])].sort((a, b) =>
    (regionByCode.get(a.code)?.shortName ?? a.name).localeCompare(regionByCode.get(b.code)?.shortName ?? b.name, 'zh-Hans-CN'),
  );
  if (list.length === 0) {
    return <p className="font-sans text-[14px] text-ink-muted">暂未收录各地资料。</p>;
  }
  return (
    <ul className={cn('border-t border-line', className)}>
      {list.map((item) => {
        const label = regionByCode.get(item.code)?.shortName ?? item.name;
        return (
          <li key={`${item.code}-${item.headline}`} className="border-b border-ink/20">
            <Link
              to={paths.region(item.code)}
              className="group flex items-start justify-between gap-4 px-1 py-3.5 transition hover:bg-paper-light/35"
            >
              <div className="min-w-0">
                <p className="font-serif text-[14.5px] font-semibold leading-5 tracking-[0.01em] text-ink transition group-hover:text-blue-700">
                  {label}
                </p>
                <p className="mt-1 font-sans text-[13px] leading-5 tracking-[0.02em] text-ink-muted">{item.headline}</p>
              </div>
              <ArrowUpRight size={14} className="mt-1 shrink-0 text-ink-faint transition group-hover:text-blue-700" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ========================================================================== */
/* 季节                                                                         */
/* ========================================================================== */

export function SeasonPanel({
  seasonality,
  className,
}: {
  seasonality: Seasonality | null | undefined;
  className?: string;
}) {
  if (!seasonality) {
    return <p className="font-sans text-[14px] text-ink-muted">季节资料尚未收录。</p>;
  }
  const peakMonths = seasonality.peakMonths ?? [];
  return (
    <div className={cn('border border-line bg-paper-light/45 shadow-card', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/20 px-5 py-3">
        <span className="font-sans text-[12px] tracking-[0.12em] text-ink-muted">季节</span>
        <span className="font-sans text-[12px] tracking-[0.04em] text-ink-faint">月份分布</span>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-8">
        <div>
          <p className="font-serif text-[19px] font-semibold leading-snug tracking-[0.01em] text-ink">
            {seasonality.pattern || '文献未给出明确季节'}
          </p>
          <MonthStrip months={peakMonths} className="mt-4" />
        </div>

        <div className="space-y-4">
          <div className="border-l-2 border-blue-700/70 pl-3.5">
            <p className="font-sans text-[12px] tracking-[0.1em] text-ink-muted">季节说明</p>
            <p className="mt-1.5 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-soft">{seasonality.evidenceNote}</p>
          </div>
          {seasonality.contextNote && (
            <div className="border-l-2 border-ochre-500/80 pl-3.5">
              <p className="font-sans text-[12px] tracking-[0.1em] text-ink-muted">饮食情境提示</p>
              <p className="mt-1.5 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-soft">{seasonality.contextNote}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
