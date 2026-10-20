import { cn } from '@/lib/utils';
import type { SuggestionOption } from './suggestions';

/** 建议问题：细线表格，无编号无图标 */
export function SuggestionPicker({
  options,
  loading,
  error,
  onPick,
  onRetry,
  disabled = false,
  className,
}: {
  options: SuggestionOption[];
  loading: boolean;
  error?: string | null;
  onPick: (text: string) => void;
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <section aria-label="示例问题" data-testid="chat-suggestions" className={className}>
      <h3 className="border-b border-ink/30 pb-1 font-kai text-[12px] tracking-[0.08em] text-ink-muted">可以这样问</h3>

      {loading ? (
        <div className="grid border-x border-b border-ink/25 sm:grid-cols-2" aria-busy="true" aria-label="示例问题加载中">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'h-[58px] animate-pulse border-b border-ink/15 bg-paper-deep/30',
                'last:border-b-0 sm:odd:border-r',
                index >= 4 && 'sm:border-b-0',
              )}
            />
          ))}
        </div>
      ) : (
        <>
          {error && (
            <p className="flex flex-wrap items-center gap-1.5 border-x border-b border-ink/25 px-3 py-1.5 font-kai text-[10.5px] text-ink-muted">
              示例加载失败，临时使用内置问题。
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="border-b border-line-strong/60 text-terracotta-700 transition hover:border-terracotta-600"
                >
                  重试
                </button>
              )}
            </p>
          )}
          <div className="grid border-x border-b border-ink/25 sm:grid-cols-2">
            {options.map((option) => (
              <button
                key={option.text}
                type="button"
                disabled={disabled}
                data-testid="chat-suggestion"
                onClick={() => onPick(option.text)}
                className={cn(
                  'group border-b border-ink/20 px-3 py-2.5 text-left transition hover:bg-paper-light/70',
                  'last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0',
                  'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <span className="block font-kai text-[10px] tracking-[0.1em] text-ink-faint">{option.tag}</span>
                <span className="mt-0.5 block font-serif text-[13.5px] leading-5 text-ink transition group-hover:text-terracotta-700">
                  {option.text}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
