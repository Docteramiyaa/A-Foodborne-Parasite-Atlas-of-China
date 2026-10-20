import { Link } from 'react-router-dom';
import { MapPinned } from 'lucide-react';
import type { RegionEvidenceEntry, SeasonalNote, StudySite } from '@shared/types';
import { paths } from '@/lib/format';
import { useAtlas } from '@/lib/atlas';
import { cn } from '@/lib/utils';
import { FoodLinks, formatCoord, MonthStrip, NoteBox, ParasiteLinks } from './Shared';

/* ========================================================================== */
/* 本地区资料                                                                   */
/* ========================================================================== */

const CONTEXT_FIELDS: { key: keyof NonNullable<RegionEvidenceEntry['studyContext']>; label: string }[] = [
  { key: 'population', label: '研究对象 / 人群' },
  { key: 'sample', label: '样本' },
  { key: 'period', label: '时间范围' },
  { key: 'statistic', label: '统计口径' },
  { key: 'location', label: '研究地点' },
];

export function RegionMaterialCard({ entry, className }: { entry: RegionEvidenceEntry; className?: string }) {
  const context = entry.studyContext;
  const contextFields = CONTEXT_FIELDS.filter((field) => {
    const value = context?.[field.key];
    return typeof value === 'string' && value.trim().length > 0;
  });

  return (
    <article className={cn('border border-line bg-paper-light/40 p-5 md:p-6', className)}>
      <h3 className="font-serif text-[17px] font-semibold leading-snug tracking-[0.01em] text-ink">{entry.headline}</h3>
      <p className="mt-2.5 font-sans text-[14px] leading-7 tracking-[0.02em] text-ink-soft">{entry.detail}</p>

      {contextFields.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-px border border-ink/15 bg-ink/15 md:grid-cols-3">
          {contextFields.map((field) => (
            <div key={field.key} className="min-w-0 bg-paper px-3.5 py-2.5">
              <dt className="font-sans text-xs tracking-[0.12em] text-ink-faint">{field.label}</dt>
              <dd className="mt-1 font-sans text-[13px] leading-5 tracking-[0.02em] text-ink-soft">{context?.[field.key]}</dd>
            </div>
          ))}
          {contextFields.length % 2 === 1 && <div className="bg-paper md:hidden" aria-hidden />}
          {Array.from({ length: (3 - (contextFields.length % 3)) % 3 }).map((_, index) => (
            <div key={`filler-${index}`} className="hidden bg-paper md:block" aria-hidden />
          ))}
        </dl>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink/15 pt-3">
        <ParasiteLinks ids={entry.parasiteIds} prefix="相关寄生虫" />
        <FoodLinks ids={entry.foodIds} prefix="相关食物" />
      </div>
    </article>
  );
}

/* ========================================================================== */
/* 研究地点                                                                     */
/* ========================================================================== */

export function StudySiteList({
  sites,
  className,
}: {
  sites: readonly StudySite[] | null | undefined;
  className?: string;
}) {
  const list = sites ?? [];
  if (list.length === 0) {
    return (
      <NoteBox tone="neutral" title="暂未收录研究地点">
        资料尚未补充。
      </NoteBox>
    );
  }
  return (
    <ul className={cn('border-t border-line', className)}>
      {list.map((site) => (
        <li key={site.id} className="border-b border-ink/20 py-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-serif text-[16px] font-semibold leading-snug tracking-[0.01em] text-ink">{site.name}</h3>
            {site.geo && <MapPinned size={14} className="mt-1 shrink-0 text-ink-faint" aria-hidden />}
          </div>
          {site.geo && <p className="mt-1 font-mono text-[12px] tracking-[0.03em] text-ink-faint">{formatCoord(site.geo)}</p>}
          <p className="mt-2 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-muted">{site.note}</p>
          <ParasiteLinks ids={site.parasiteIds} className="mt-3 border-t border-ink/15 pt-2.5" />
        </li>
      ))}
    </ul>
  );
}

/* ========================================================================== */
/* 季节                                                                         */
/* ========================================================================== */

export function RegionSeasonalNotes({
  notes,
  className,
}: {
  notes: readonly SeasonalNote[] | null | undefined;
  className?: string;
}) {
  const list = notes ?? [];
  if (list.length === 0) {
    return <NoteBox tone="neutral" title="暂未收录季节资料">资料尚未补充。</NoteBox>;
  }
  return (
    <ul className={cn('grid gap-3', list.length > 1 && 'lg:grid-cols-2', className)}>
      {list.map((note, index) => {
        const isContext = note.basis === 'dietary-context';
        return (
          <li
            key={`${note.basis}-${index}`}
            className={cn(
              'flex h-full flex-col border border-l-2 border-line bg-paper-light/40 p-5',
              isContext ? 'border-l-ochre-500/80' : 'border-l-terracotta-700/80',
            )}
          >
            <p className="font-sans text-[12px] tracking-[0.1em] text-ink-muted">{isContext ? '饮食情境提示' : '季节资料'}</p>
            <p className="mt-2.5 flex-1 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-soft">{note.note}</p>
            <MonthStrip months={note.months} className="mt-3" caption={false} />
            <ParasiteLinks ids={note.parasiteIds} className="mt-3 border-t border-ink/20 pt-2.5" />
          </li>
        );
      })}
    </ul>
  );
}

/* ========================================================================== */
/* 邻近省份                                                                     */
/* ========================================================================== */

export interface NeighborItem {
  code: string;
  name: string;
  distanceKm: number;
}

export function NeighborLinks({ neighbors, className }: { neighbors: readonly NeighborItem[]; className?: string }) {
  const { regionByCode } = useAtlas();
  if (neighbors.length === 0) return null;
  return (
    <div className={className}>
      <p className="mb-2 font-sans text-xs tracking-[0.1em] text-ink-faint">邻近省份</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-2">
        {neighbors.map((neighbor) => {
          const summary = regionByCode.get(neighbor.code);
          return (
            <li key={neighbor.code}>
              <Link
                to={paths.region(neighbor.code)}
                className="inline-flex items-baseline gap-1.5 border-b border-line pb-0.5 font-sans text-[13px] tracking-[0.03em] text-ink-soft transition hover:border-blue-700 hover:text-blue-700"
              >
                {summary?.shortName ?? neighbor.name}
                <span className="font-mono text-xs tabular-nums text-ink-faint">{neighbor.distanceKm} km</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
