import type { ReactNode } from 'react';
import type { SuggestionOption } from './suggestions';
import { SuggestionPicker } from './SuggestionPicker';

/** 对话空状态：一句提示 + 输入 + 示例问题 */
export function WelcomePanel({
  suggestions,
  loading,
  error,
  onPick,
  onRetry,
  disabled = false,
  composer,
}: {
  suggestions: SuggestionOption[];
  loading: boolean;
  error?: string | null;
  onPick: (text: string) => void;
  onRetry?: () => void;
  disabled?: boolean;
  composer?: ReactNode;
}) {
  return (
    <div>
      <section aria-labelledby="chat-welcome-title" className="relative border border-ink/40 bg-paper-light/55 px-4 py-3">
        <span className="pointer-events-none absolute inset-[5px] border border-ink/12" aria-hidden />
        <h2
          id="chat-welcome-title"
          className="relative font-serif text-[17px] font-semibold leading-snug text-ink md:text-[18px]"
        >
          说清地区、时间、食物与做法。
        </h2>
        <p className="relative mt-1 font-kai text-[11.5px] leading-5 tracking-[0.02em] text-ink-muted">
          可以直接说：明天在广州吃鱼生，准备生吃。
        </p>
      </section>

      {composer && <div className="mt-3">{composer}</div>}

      <SuggestionPicker
        className="mt-6"
        options={suggestions}
        loading={loading}
        error={error}
        onPick={onPick}
        onRetry={onRetry}
        disabled={disabled}
      />
    </div>
  );
}
