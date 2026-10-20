import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs';

/* ------------------------------------------------------------------ */
/* 索引页页头                                                          */
/* ------------------------------------------------------------------ */

/** 图鉴/依据的简洁页头：面包屑 + 标题 + 一句导语，不做刊物式包装 */
export function FieldPageHeader({
  breadcrumbs,
  title,
  lead,
  children,
  className,
}: {
  breadcrumbs: Crumb[];
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('bg-white', className)}>
      <div className="mx-auto w-full max-w-shell px-5 pb-8 pt-6 md:px-8 md:pb-10 md:pt-8">
        <Breadcrumbs items={breadcrumbs} />
        <div className="mt-4 max-w-3xl">
          <h1 className="font-serif text-[clamp(1.9rem,3.2vw,2.75rem)] font-semibold leading-[1.12] tracking-[0.01em] text-ink">
            {title}
          </h1>
          {lead && (
            <p className="mt-3 max-w-2xl font-sans text-[14px] leading-7 tracking-[0.01em] text-ink-muted">
              {lead}
            </p>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* 目录与列表                                                          */
/* ------------------------------------------------------------------ */

/** 独立条目的统一网格，不补空白卡片。 */
export function FieldCatalogGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>;
}

/** 目录分类标签 */
export function FieldTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-line bg-paper px-3 py-1 font-sans text-xs text-ink-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 简洁的列表空状态 */
export function FieldEmpty({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-3xl bg-blue-50 px-6 py-12', className)}>
      {icon && (
        <span className="text-ink-muted" aria-hidden>
          {icon}
        </span>
      )}
      <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
      {description && <div className="max-w-md font-sans text-[14px] leading-6 text-ink-muted">{description}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
