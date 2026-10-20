import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  tone = 'dark',
  className,
}: {
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <details
      className={cn(
        'group rounded-xl border transition-colors open:bg-paper-light/70',
        tone === 'dark' ? 'border-line/80 open:border-line-strong/70' : 'border-paper/15 open:border-paper/25',
        className,
      )}
      open={defaultOpen}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 marker:hidden [&::-webkit-details-marker]:hidden',
          tone === 'light' ? 'text-paper-light' : 'text-ink',
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {summary && (
            <div className={cn('mt-0.5 text-xs leading-5', tone === 'light' ? 'text-paper/55' : 'text-ink-muted')}>{summary}</div>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 transition-transform duration-300 group-open:rotate-180',
            tone === 'light' ? 'text-paper/50' : 'text-ink-muted',
          )}
        />
      </summary>
      <div className={cn('border-t px-4 pb-4 pt-3.5 text-sm leading-7', tone === 'light' ? 'border-paper/10 text-paper/75' : 'border-line/60 text-ink-soft')}>
        {children}
      </div>
    </details>
  );
}
