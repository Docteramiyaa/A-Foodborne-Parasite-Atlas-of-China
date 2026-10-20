import { cn } from '@/lib/utils';

/** 回答底部的接着问问题 */
export function FollowUps({
  followUps,
  onPick,
  disabled = false,
  className,
}: {
  followUps: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const list = Array.isArray(followUps) ? followUps.filter((q) => typeof q === 'string' && q.trim()) : [];
  if (list.length === 0) return null;
  return (
    <div className={cn('mt-4', className)} data-testid="chat-followups">
      <p className="font-kai text-[10px] tracking-[0.1em] text-ink-faint">接着问</p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        {list.map((question) => (
          <button
            key={question}
            type="button"
            disabled={disabled}
            data-testid="chat-followup"
            onClick={() => onPick(question)}
            className="border-b border-line-strong/60 pb-0.5 text-left font-kai text-[12px] leading-5 tracking-[0.03em] text-ink-soft transition hover:border-terracotta-600 hover:text-terracotta-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
