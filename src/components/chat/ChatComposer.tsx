import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const MAX_LENGTH = 1000;
const MAX_TEXTAREA_HEIGHT = 200;

/** 输入区：画线纸面 + 发送 */
export function ChatComposer({
  onSend,
  sending,
  textareaRef,
  placeholder = '例如：明天在广州吃鱼生，准备生吃。',
  quickPrompts = [],
  onQuickPrompt,
}: {
  onSend: (text: string) => void;
  sending: boolean;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  quickPrompts?: string[];
  onQuickPrompt?: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = textareaRef.current ?? localRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  };

  useEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const length = value.length;
  const nearLimit = length >= MAX_LENGTH - 100;
  const canSend = !sending && value.trim().length > 0 && length <= MAX_LENGTH;

  const submit = () => {
    const text = value.trim();
    if (!text || sending || text.length > MAX_LENGTH) return;
    onSend(text);
    setValue('');
    requestAnimationFrame(() => {
      const el = textareaRef.current ?? localRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.focus();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // 中文输入法组合过程中的 Enter 不发送
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const setRefs = (node: HTMLTextAreaElement | null) => {
    localRef.current = node;
    textareaRef.current = node;
  };

  return (
    <div>
      {quickPrompts.length > 0 && onQuickPrompt && (
        <div className="mb-2 flex flex-wrap items-center gap-2" data-testid="chat-quick-prompts">
          <span className="font-kai text-[10px] tracking-[0.06em] text-ink-faint">接着问</span>
          {quickPrompts.slice(0, 3).map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={sending}
              onClick={() => onQuickPrompt(prompt)}
              className="border-b border-line-strong/50 font-kai text-[11px] text-ink-soft transition hover:border-terracotta-600 hover:text-terracotta-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="relative border border-ink/50 bg-paper-light/80 shadow-[6px_6px_0_rgba(37,54,45,0.07)]">
        <span className="pointer-events-none absolute inset-[5px] border border-ink/12" aria-hidden />
        <div className="relative flex items-stretch">
          <textarea
            ref={setRefs}
            data-testid="chat-input"
            value={value}
            rows={1}
            maxLength={MAX_LENGTH}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="描述情况或提出问题"
            aria-describedby="chat-input-hint"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, rgba(37,54,45,0.05) 0 1px, transparent 1px 28px)',
              backgroundPosition: '0 8px',
            }}
            className="max-h-[200px] min-h-[46px] w-full flex-1 resize-none bg-transparent px-3.5 py-1.5 text-[14px] leading-7 text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <div className="flex shrink-0 items-end border-l border-ink/25 px-2 py-2">
            <Button
              data-testid="chat-send"
              type="button"
              size="sm"
              variant="primary"
              onClick={submit}
              disabled={!canSend}
              aria-label={sending ? '正在检索知识库' : '发送'}
              aria-busy={sending}
              className="!h-9 !px-3.5"
            >
              {sending ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" aria-hidden />
                  <span>检索中</span>
                </>
              ) : (
                '发送'
              )}
            </Button>
          </div>
        </div>

        <div className="relative flex items-center justify-between gap-3 border-t border-ink/20 px-3 py-1.5">
          <p id="chat-input-hint" className="font-kai text-[10px] tracking-[0.04em] text-ink-muted">
            Enter 发送 · Shift + Enter 换行
          </p>
          <span
            id="chat-input-count"
            aria-live="polite"
            className={cn(
              'shrink-0 font-serif text-[10px] tabular-nums tracking-[0.06em]',
              nearLimit ? 'text-terracotta-700' : 'text-ink-faint',
            )}
          >
            {length}/{MAX_LENGTH}
            {length >= MAX_LENGTH && <span className="ml-1 font-kai">已达上限</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
