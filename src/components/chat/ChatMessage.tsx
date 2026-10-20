import type { ErrorChatItem, UserChatItem } from './session';
import type { Ref } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingDots } from '@/components/ui/States';

/** 用户消息：一张贴在纸页上的便条 */
export function UserMessage({ item, liRef }: { item: UserChatItem; liRef?: Ref<HTMLLIElement> }) {
  return (
    <li ref={liRef} className="flex justify-end" data-testid="chat-message-user">
      <div className="relative max-w-[88%] md:max-w-[76%]">
        <span
          aria-hidden
          className="absolute -top-[7px] left-1/2 h-3.5 w-16 -translate-x-1/2 rotate-[-1.5deg] bg-ochre-300/55"
        />
        <div className="relative rotate-[-0.25deg] border border-ink/45 bg-paper-light px-4 py-2.5 shadow-[4px_4px_0_rgba(37,54,45,0.08)]">
          <p className="whitespace-pre-wrap break-words font-kai text-[14px] leading-6 tracking-[0.02em] text-ink">{item.content}</p>
        </div>
        {item.failed && <p className="mt-1 pr-1 text-right font-kai text-[10px] text-terracotta-700">未送达</p>}
      </div>
    </li>
  );
}

/** 请求失败：可重试 */
export function ErrorMessage({
  item,
  onRetry,
  disabled = false,
  liRef,
}: {
  item: ErrorChatItem;
  onRetry: (item: ErrorChatItem) => void;
  disabled?: boolean;
  liRef?: Ref<HTMLLIElement>;
}) {
  return (
    <li ref={liRef} data-testid="chat-error">
      <div className="border border-terracotta-700/45 border-l-[3px] bg-terracotta-100/25 px-4 py-3.5" role="alert">
        <p className="font-serif text-[14px] font-semibold text-ink">没有得到回答</p>
        <p className="mt-1 font-serif text-[13.5px] leading-6 text-ink-soft">{item.message}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRetry(item)}
            disabled={disabled}
            data-testid="chat-retry"
            className="!font-kai !tracking-[0.06em]"
          >
            重试
          </Button>
          <span className="font-kai text-[10.5px] text-ink-muted">也可以补充地区、食物或做法后重试。</span>
        </div>
      </div>
    </li>
  );
}

/** 检索中指示 */
export function TypingMessage() {
  return (
    <li data-testid="chat-typing" aria-hidden="true">
      <div className="inline-flex border border-ink/35 bg-paper-light/80 px-3.5 py-2.5">
        <LoadingDots label="正在检索知识库…" className="font-kai text-[11.5px] tracking-[0.04em]" />
      </div>
    </li>
  );
}
