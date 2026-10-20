import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from './useFocusTrap';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  testId?: string;
  className?: string;
}

/** 轻量对话框：移动端底部面板、桌面居中；Esc / 背景点击 / 焦点限制在面板内。 */
export function Modal({ open, onClose, title, description, children, size = 'md', testId, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="关闭对话框"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/35"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          'relative flex max-h-[88vh] w-full flex-col overflow-hidden border-t-2 border-ink/60 bg-paper-light shadow-[10px_10px_0_rgba(37,54,45,.14)] animate-fade-in sm:border sm:border-t-2',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-2xl',
          size === 'lg' && 'sm:max-w-4xl',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/20 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-semibold leading-tight text-ink">{title}</h2>
            {description && <div className="mt-1 font-kai text-[11.5px] leading-5 text-ink-muted">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="关闭对话框"
            className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center border border-line text-ink-muted transition hover:border-ink hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
