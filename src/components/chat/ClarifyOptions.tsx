import type { ClarifyQuestion } from '@shared/types';
import { cn } from '@/lib/utils';

/**
 * 追问选项：点击后以选项 label 作为下一条用户消息发送。
 * 原生 button 保证键盘可达（Tab / Enter / Space）。
 */
export function ClarifyOptions({
  clarify,
  onPick,
  disabled = false,
  className,
}: {
  clarify: ClarifyQuestion;
  onPick: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = Array.isArray(clarify.options)
    ? clarify.options.filter((o) => o && typeof o.label === 'string' && o.label.trim())
    : [];
  if (!clarify.question || options.length === 0) return null;
  const fieldLabel =
    {
      food: '食物',
      preparation: '处理方式',
      province: '地区',
      exposure: '是否已食用',
      symptoms: '症状',
    }[clarify.field] ?? '补充信息';

  return (
    <section aria-label={`追问：${clarify.question}`} className={cn('border-l-2 border-blue-700/70 pl-3.5', className)} data-testid="chat-clarify">
      <p className="font-sans text-[12px] tracking-[0.1em] text-ink-muted">需要确认：{fieldLabel}</p>
      <p className="mt-1 font-serif text-[14.5px] leading-7 text-ink">{clarify.question}</p>
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={clarify.question}>
        {options.map((option) => (
          <button
            key={`${option.label}-${option.value}`}
            type="button"
            disabled={disabled}
            data-testid="chat-clarify-option"
            onClick={() => onPick(option.label)}
            className="inline-flex min-h-[34px] max-w-full items-center gap-1.5 border border-line bg-paper-light px-3 py-1.5 text-left font-sans text-[14px] tracking-[0.03em] text-ink-soft transition hover:border-ink hover:bg-ink hover:text-paper-light disabled:pointer-events-none disabled:opacity-50"
          >
            <span>{option.label}</span>
            {option.hint && <span className="text-[12px] text-ink-muted">{option.hint}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
