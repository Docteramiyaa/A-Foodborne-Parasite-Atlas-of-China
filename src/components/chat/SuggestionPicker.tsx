import { cn } from '@/lib/utils';
import type { SuggestionOption } from './suggestions';

/** 建议问题：同一内容组内保持轻分隔，不与输入区争夺视觉焦点。 */
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
      <h3 className="mb-3 text-sm font-medium text-ink-muted">可以这样问</h3>

      {loading ? (
        <div className="grid overflow-hidden rounded-2xl border border-line bg-white sm:grid-cols-2" aria-busy="true" aria-label="示例问题加载中">
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
            <p className="flex flex-wrap items-center gap-1.5 border-x border-b border-line px-3 py-1.5 font-sans text-[12px] text-ink-muted">
              示例加载失败，临时使用内置问题。
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="border-b border-line-strong/60 text-terracotta-700 transition hover:border-blue-600"
                >
                  重试
                </button>
              )}
            </p>
          )}
          <div className="grid overflow-hidden rounded-2xl border border-line bg-white sm:grid-cols-2">
            {options.map((option) => (
              <button
                key={option.text}
                type="button"
                disabled={disabled}
                data-testid="chat-suggestion"
                onClick={() => onPick(option.text)}
                className={cn(
                  'group border-b border-line px-4 py-4 text-left transition hover:bg-blue-50',
                  'last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0',
                  'focus-visible:-outline-offset-4 disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <span className="block font-sans text-[12px] tracking-[0.1em] text-ink-faint">{option.tag}</span>
                <span className="mt-1 block text-sm leading-6 text-ink transition group-hover:text-blue-700">
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
