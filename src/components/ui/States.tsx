import type { ReactNode } from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

export function LoadingDots({ label = '正在加载', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-ink-muted', className)} role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-jade-500"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

export function PageLoading({ label = '正在加载知识库' }: { label?: string }) {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-5 py-20">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-line" />
        <span className="absolute inset-2 animate-pulse-soft rounded-full border border-jade-400/60" />
        <span className="h-2 w-2 rounded-full bg-terracotta-600" />
      </div>
      <LoadingDots label={label} />
    </div>
  );
}

export function ErrorState({
  title = '加载失败',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-line bg-paper-light/60 px-6 py-16 text-center', className)}>
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-100 text-terracotta-700">
        <AlertCircle size={20} />
      </span>
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      {message && <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry} iconLeft={<RefreshCw size={14} />}>
          重新加载
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
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
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong/60 bg-paper-light/40 px-6 py-16 text-center',
        className,
      )}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper text-ink-muted">
        {icon ?? <Inbox size={20} />}
      </span>
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      {description && <div className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-paper-deep/80', className)} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-line bg-paper-light/60 p-5">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-4 h-6 w-2/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-6 h-3 w-1/3" />
    </div>
  );
}
