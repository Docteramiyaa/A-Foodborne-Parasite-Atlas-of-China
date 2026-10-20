import { Children, type ReactNode } from 'react';
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
    <header className={cn('border-b border-ink/30', className)}>
      <div className="mx-auto w-full max-w-shell px-5 pb-7 pt-5 md:px-8 md:pb-9 md:pt-6">
        <Breadcrumbs items={breadcrumbs} />
        <div className="mt-4 max-w-3xl">
          <h1 className="font-serif text-[clamp(1.9rem,3.2vw,2.75rem)] font-semibold leading-[1.12] tracking-[0.01em] text-ink">
            {title}
          </h1>
          {lead && (
            <p className="mt-3 max-w-2xl font-kai text-[13.5px] leading-7 tracking-[0.01em] text-ink-muted">
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

/**
 * 目录网格：用 1px 分隔线组成，而不是漂浮的圆角卡片。
 * 末尾按 2/3 列断点补同色纸片，避免最后一行露出分隔线底色。
 */
export function FieldCatalogGrid({ children, className }: { children: ReactNode; className?: string }) {
  const count = Children.count(children);
  const mdFillers = (2 - (count % 2)) % 2;
  const lgFillers = (3 - (count % 3)) % 3;
  return (
    <div className={cn('grid gap-px border border-ink/30 bg-ink/25 md:grid-cols-2 lg:grid-cols-3', className)}>
      {children}
      {Array.from({ length: mdFillers }, (_, index) => (
        <div key={`md-filler-${index}`} aria-hidden className="hidden bg-paper-light/70 md:block lg:hidden" />
      ))}
      {Array.from({ length: lgFillers }, (_, index) => (
        <div key={`lg-filler-${index}`} aria-hidden className="hidden bg-paper-light/70 lg:block" />
      ))}
    </div>
  );
}

/** 目录小标签：方角细线，不使用药丸 */
export function FieldTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center border border-ink/25 bg-paper/70 px-2 py-0.5 font-kai text-[10.5px] tracking-[0.04em] text-ink-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 空态：细虚线框 + 楷体说明，延续纸面语言 */
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
    <div className={cn('flex flex-col items-start gap-3 border border-dashed border-ink/35 bg-paper-light/40 px-6 py-12', className)}>
      {icon && (
        <span className="text-ink-muted" aria-hidden>
          {icon}
        </span>
      )}
      <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
      {description && <div className="max-w-md font-kai text-[12.5px] leading-6 text-ink-muted">{description}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
