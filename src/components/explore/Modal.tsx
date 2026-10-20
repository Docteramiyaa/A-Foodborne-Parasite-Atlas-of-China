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
          'relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-white shadow-lift animate-fade-in sm:rounded-3xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-2xl',
          size === 'lg' && 'sm:max-w-4xl',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight text-ink">{title}</h2>
            {description && <div className="mt-1 font-sans text-[13px] leading-5 text-ink-muted">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="关闭对话框"
            className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-blue-700 transition hover:border-blue-700 hover:bg-blue-50"
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
