import type { Measure } from '@shared/types';
import { cn } from '@/lib/utils';

/** 措施清单：横线条目，关键措施用朱砂边线标记 */
export function MeasureList({
  measures,
  variant = 'prevention',
  className,
}: {
  measures: readonly Measure[] | null | undefined;
  variant?: 'prevention' | 'post-exposure';
  className?: string;
}) {
  const list = [...(measures ?? [])].sort((a, b) => Number(Boolean(b.key)) - Number(Boolean(a.key)));
  if (list.length === 0) {
    return (
      <p className="font-sans text-[14px] text-ink-muted">
        {variant === 'prevention' ? '预防资料尚未收录。' : '已食用后的资料尚未收录。'}
      </p>
    );
  }
  return (
    <ol className={cn('border-t border-line', className)}>
      {list.map((measure, index) => {
        const isKey = Boolean(measure.key) && variant === 'prevention';
        const isPost = variant === 'post-exposure';
        return (
          <li
            key={`${measure.title}-${index}`}
            className={cn('border-b border-ink/20 py-4 pl-4', isKey ? 'border-l-2 border-l-terracotta-700 bg-paper-light/30' : 'border-l-2 border-l-transparent')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-[15px] font-semibold leading-snug tracking-[0.01em] text-ink">{measure.title}</h3>
              {isKey && (
                <span className="border border-terracotta-700 px-1.5 py-0.5 font-sans text-xs tracking-[0.08em] text-terracotta-700">
                  关键
                </span>
              )}
              {isPost && <span className="font-sans text-xs tracking-[0.08em] text-ink-faint">食后</span>}
            </div>
            <p className="mt-1.5 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-muted">{measure.detail}</p>
          </li>
        );
      })}
    </ol>
  );
}
