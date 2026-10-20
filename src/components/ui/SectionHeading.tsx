import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Eyebrow({ children, className, tone = 'muted' }: { children: ReactNode; className?: string; tone?: 'muted' | 'jade' | 'paper' }) {
  return (
    <p
      className={cn(
        'font-kai text-2xs font-medium uppercase tracking-[0.16em]',
        tone === 'muted' && 'text-ink-muted',
        tone === 'jade' && 'text-jade-700',
        tone === 'paper' && 'text-paper/60',
      )}
      style={{ letterSpacing: '0.16em' }}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  align = 'left',
  tone = 'dark',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  align?: 'left' | 'center';
  tone?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 md:flex-row md:items-end md:justify-between',
        align === 'center' && 'items-center text-center md:flex-col md:items-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && (
          <div className={cn('mb-3 flex items-center gap-3', align === 'center' && 'justify-center')}>
            <span className={cn('h-px w-8', tone === 'light' ? 'bg-paper/40' : 'bg-jade-700/50')} />
            <Eyebrow tone={tone === 'light' ? 'paper' : 'jade'}>{eyebrow}</Eyebrow>
          </div>
        )}
        <h2
          className={cn(
            'font-serif text-[clamp(1.65rem,2.8vw,2.4rem)] font-semibold leading-[1.2] tracking-[0.02em]',
            tone === 'light' ? 'text-paper-light' : 'text-ink',
          )}
        >
          {title}
        </h2>
        {description && (
          <div className={cn('mt-3 font-kai text-[14.5px] leading-7', tone === 'light' ? 'text-paper/70' : 'text-ink-muted')}>{description}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  aside,
  breadcrumbs,
  className,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn('relative border-b border-line/70 pb-10 pt-8 md:pb-14 md:pt-12', className)}>
      <div className="mx-auto max-w-shell px-5 md:px-8">
        {breadcrumbs && <div className="mb-6">{breadcrumbs}</div>}
        <div className={cn('flex flex-col gap-8', aside && 'md:flex-row md:items-end md:justify-between')}>
          <div className="max-w-3xl">
            {eyebrow && (
              <div className="mb-4 flex items-center gap-3">
                <span className="h-px w-8 bg-jade-700/50" />
                <Eyebrow tone="jade">{eyebrow}</Eyebrow>
              </div>
            )}
            <h1 className="font-serif text-[clamp(2.1rem,4vw,3.4rem)] font-semibold leading-[1.12] tracking-tight text-ink">{title}</h1>
            {lead && <div className="mt-5 max-w-2xl text-[15px] leading-7 text-ink-muted md:text-base md:leading-8">{lead}</div>}
            {children}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      </div>
    </header>
  );
}

