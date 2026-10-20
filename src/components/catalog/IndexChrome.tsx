import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Stat } from '@/components/ui/Stat';

/* ------------------------------------------------------------------ */
/* 索引页顶部统计条                                                     */
/* ------------------------------------------------------------------ */

export interface IndexStatItem {
  value: ReactNode;
  label: ReactNode;
  note?: ReactNode;
}

export function IndexStatStrip({
  items,
  className,
  bordered = true,
}: {
  items: IndexStatItem[];
  className?: string;
  bordered?: boolean;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 lg:gap-x-10',
        bordered && 'border-y border-ink/25 py-5 md:py-6',
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={index}>
          <Stat size="sm" value={item.value} label={item.label} note={item.note} />
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* 分组标题                                                            */
/* ------------------------------------------------------------------ */

export function CatalogGroupHeading({
  index,
  title,
  description,
  count,
  actions,
  className,
}: {
  index?: string;
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 border-b border-ink/30 pb-3 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0 max-w-3xl">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {index && <span className="font-serif text-[11px] tracking-[0.16em] text-terracotta-700">{index}</span>}
          <h2 className="font-serif text-xl font-semibold leading-snug tracking-[0.01em] text-ink md:text-2xl">{title}</h2>
          {count !== undefined && <span className="font-kai text-[10.5px] text-ink-faint">{count}</span>}
        </div>
        {description && <div className="mt-2 font-kai text-[11.5px] leading-6 text-ink-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
