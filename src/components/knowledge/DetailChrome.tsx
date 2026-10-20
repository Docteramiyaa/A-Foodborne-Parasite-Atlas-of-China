import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs';
import { Reveal } from '@/components/ui/Reveal';
import type { SectionNavItem } from '@/components/ui/SectionNav';
import { cn } from '@/lib/utils';

/* ========================================================================== */
/* 页面骨架：页眉 + 正文（目录 + 章节）                                         */
/* ========================================================================== */

export function KnowledgeHero({
  breadcrumbs,
  eyebrow,
  title,
  latin,
  subtitle,
  statusBadge,
  tagline,
  lead,
  facts,
  actions,
  notice,
  aside,
  className,
}: {
  breadcrumbs: Crumb[];
  eyebrow?: ReactNode;
  title: ReactNode;
  latin?: ReactNode;
  subtitle?: ReactNode;
  statusBadge?: ReactNode;
  tagline?: ReactNode;
  lead?: ReactNode;
  facts?: ReactNode;
  actions?: ReactNode;
  notice?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('relative border-b border-line bg-white', className)}>
      <div className="relative mx-auto max-w-shell px-5 md:px-8">
        <div className="border-b border-ink/20 py-3.5">
          <Breadcrumbs
            items={breadcrumbs}
            className="[&_ol]:font-sans [&_ol]:text-[13px] [&_ol]:tracking-[0.04em] [&_a:hover]:text-terracotta-700"
          />
        </div>

        <div className="grid gap-10 py-9 md:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start lg:gap-16">
          <div className="min-w-0">
            <Reveal>
              {eyebrow && <p className="field-label text-[14px] leading-5">{eyebrow}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="font-serif text-[clamp(2.4rem,4.6vw,3.9rem)] font-semibold leading-[1.08] tracking-[0.02em] text-ink">
                  {title}
                </h1>
                {statusBadge}
              </div>
              {latin && (
                <p className="mt-3 font-serif text-[15px] italic leading-6 tracking-wide text-ink-faint md:text-base">
                  {latin}
                </p>
              )}
              {subtitle && <div className="mt-2.5 text-[14px] leading-5 text-ink-muted">{subtitle}</div>}
              {tagline && (
                <p className="mt-7 max-w-2xl font-sans text-[clamp(1.15rem,1.8vw,1.45rem)] leading-[1.8] tracking-[0.02em] text-ink-soft">
                  {tagline}
                </p>
              )}
              {lead && (
                <p className="mt-4 max-w-2xl font-sans text-[14px] leading-[1.9] tracking-[0.02em] text-ink-muted md:text-[14.5px] md:leading-8">
                  {lead}
                </p>
              )}
            </Reveal>

            {facts && (
              <Reveal delay={0.06}>
                <div className="mt-8">{facts}</div>
              </Reveal>
            )}

            {actions && (
              <Reveal delay={0.1}>
                <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>
              </Reveal>
            )}

            {notice && (
              <Reveal delay={0.12}>
                <div className="mt-6 max-w-2xl">{notice}</div>
              </Reveal>
            )}
          </div>

          {aside && (
            <Reveal delay={0.08} y={16} className="min-w-0">
              {aside}
            </Reveal>
          )}
        </div>
      </div>
    </header>
  );
}

/** Hero 关键信息：简单的信息表，不做数字编号 */
export function HeroFacts({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3', className)}>
      {children}
    </dl>
  );
}

export function HeroFact({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col bg-paper px-4 py-4', className)}>
      <dt className="font-sans text-xs font-medium tracking-[0.16em] text-ink-faint">{label}</dt>
      <dd className="mt-2 font-serif text-[15.5px] font-medium leading-snug tracking-[0.01em] text-ink">{value}</dd>
      {hint && <dd className="mt-1 font-sans text-[12px] leading-4 tracking-[0.02em] text-ink-muted">{hint}</dd>}
    </div>
  );
}

/* ========================================================================== */
/* 基本信息卡                                                                  */
/* ========================================================================== */

export function ArchiveCard({
  label = '基本信息',
  children,
  footer,
  className,
}: {
  label?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative rounded-3xl border border-line bg-white p-5 shadow-card md:p-5',
        className,
      )}
    >
      <div className="relative">
        {label && (
          <div className="border-b border-line pb-2.5">
            <span className="field-label text-[14px]">{label}</span>
          </div>
        )}
        <dl className="mt-1">{children}</dl>
        {footer && <div className="mt-3 border-t border-line pt-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function ArchiveRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/15 py-2.5 last:border-0">
      <dt className="shrink-0 pt-0.5 font-sans text-[12px] tracking-[0.14em] text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-left font-serif text-[14px] leading-5 text-ink-soft">{children}</dd>
    </div>
  );
}

/* ========================================================================== */
/* 正文骨架                                                                     */
/* ========================================================================== */

function FieldSectionNav({ items }: { items: SectionNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="页面目录">
      <ol>
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'block border-b border-l-2 border-ink/10 py-2 pl-2.5 font-sans text-[14px] tracking-[0.04em] transition',
                  isActive
                    ? 'border-l-blue-700 bg-blue-50 text-ink'
                    : 'border-l-transparent text-ink-muted hover:text-ink',
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function DetailBody({ navItems, children }: { navItems: SectionNavItem[]; children: ReactNode }) {
  return (
    <>
      <div className="sticky top-[86px] z-30 border-b border-line bg-paper/95 backdrop-blur-md lg:hidden">
        <nav aria-label="页面目录（移动端）" className="mx-auto max-w-shell">
          <ol className="hide-scrollbar flex items-stretch overflow-x-auto px-3">
            {navItems.map((item) => (
              <li key={item.id} className="shrink-0 border-r border-ink/15 last:border-r-0">
                <a
                  href={`#${item.id}`}
                  className="flex min-h-[42px] items-center px-3 font-sans text-[13px] tracking-[0.04em] text-ink-soft transition hover:text-blue-700"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <div className="mx-auto max-w-shell px-5 md:px-8">
        <div className="grid grid-cols-1 gap-10 pb-24 pt-10 lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-16 lg:pb-28 lg:pt-12">
          <div className="min-w-0 space-y-12 md:space-y-16">{children}</div>
          <aside className="hidden lg:block" aria-label="页面目录">
            <div className="sticky top-[110px]">
              <p className="field-label mb-3 border-b border-line pb-2 text-[12px] tracking-[0.16em]">本页目录</p>
              <FieldSectionNav items={navItems} />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export function DetailSection({
  id,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      id={id}
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn('scroll-mt-36 border-t border-line pt-8 md:pt-10', className)}
    >
      <Reveal>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-serif text-[clamp(1.6rem,2.6vw,2.2rem)] font-semibold leading-[1.2] tracking-[0.02em] text-ink">
              {title}
            </h2>
            {description && (
              <p className="mt-2.5 max-w-xl font-sans text-[14px] leading-7 tracking-[0.02em] text-ink-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </Reveal>
      <div className={cn('mt-7 md:mt-8', contentClassName)}>{children}</div>
    </section>
  );
}

/** 章节导语（正文引用段落） */
export function SectionLead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'border-l-2 border-terracotta-700/70 pl-4 font-sans text-[14.5px] leading-[1.9] tracking-[0.02em] text-ink-soft md:text-[15px]',
        className,
      )}
    >
      {children}
    </p>
  );
}
