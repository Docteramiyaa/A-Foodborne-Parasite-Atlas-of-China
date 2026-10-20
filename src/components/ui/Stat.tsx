import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Stat({
  value,
  label,
  note,
  tone = 'dark',
  size = 'md',
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  note?: ReactNode;
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div
        className={cn(
          'serif-num font-semibold leading-none',
          tone === 'light' ? 'text-paper-light' : 'text-ink',
          size === 'sm' && 'text-2xl',
          size === 'md' && 'text-[2rem]',
          size === 'lg' && 'text-[clamp(2.4rem,4vw,3.4rem)]',
        )}
      >
        {value}
      </div>
      <div className={cn('mt-2 text-2xs font-medium tracking-wider', tone === 'light' ? 'text-paper/65' : 'text-ink-muted')}>{label}</div>
      {note && <div className={cn('mt-1 text-2xs leading-4', tone === 'light' ? 'text-paper/40' : 'text-ink-faint')}>{note}</div>}
    </div>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-start gap-x-8 gap-y-5', className)}>{children}</div>;
}
