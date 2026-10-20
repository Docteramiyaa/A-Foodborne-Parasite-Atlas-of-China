import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/SectionHeading';

export type CalloutTone = 'jade' | 'ochre' | 'terracotta' | 'neutral';

const TONE_ICON: Record<CalloutTone, string> = {
  jade: 'border-jade-700/30 text-jade-700',
  ochre: 'border-ochre-400/40 text-ochre-700',
  terracotta: 'border-terracotta-400/40 text-terracotta-700',
  neutral: 'border-ink/25 text-ink-muted',
};

/** 田野说明块：方角细框纸片，用楷体正文，赤陶/苔绿只落在小图标与标签上 */
export function Callout({
  tone = 'jade',
  eyebrow,
  title,
  icon,
  children,
  className,
}: {
  tone?: CalloutTone;
  eyebrow?: string;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border border-ink/30 bg-paper-light/55 p-4 md:p-5', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span
            className={cn('mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center border sm:flex', TONE_ICON[tone])}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {title && (
            <h3 className={cn('font-serif text-base font-semibold leading-snug text-ink md:text-[17px]', eyebrow ? 'mt-1.5' : '')}>
              {title}
            </h3>
          )}
          <div className={cn('font-kai text-[12px] leading-6 text-ink-muted', title || eyebrow ? 'mt-1.5' : '')}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
