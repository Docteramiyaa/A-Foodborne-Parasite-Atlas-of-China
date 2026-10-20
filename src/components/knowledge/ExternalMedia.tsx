import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { FieldDisclosure } from './Shared';
import { cn } from '@/lib/utils';

export interface ExternalMediaLink {
  label: string;
  url: string;
}

/**
 * 外部形态 / 显微图片资料（默认收起）。
 * 本站不嵌入、不转载任何图片，只提供权威机构页面的外部链接。
 */
export function ExternalMediaDisclosure({
  links,
  title = '形态与显微图片（外部链接）',
  description,
  className,
}: {
  links: readonly ExternalMediaLink[] | null | undefined;
  title?: string;
  description?: ReactNode;
  className?: string;
}) {
  const items = (links ?? []).filter((link) => Boolean(link && link.label && link.url));
  if (items.length === 0) return null;

  return (
    <FieldDisclosure title={title} summary="默认收起" defaultOpen={false} className={cn('bg-paper-light/35', className)}>
      <p className="font-kai text-[12px] leading-6 tracking-[0.02em] text-ink-muted">
        {description ?? '图片与形态资料位于外部机构页面，本站不嵌入；文字说明可独立阅读。'}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-start justify-between gap-3 border border-ink/20 bg-paper-light/40 px-3.5 py-2.5 transition hover:border-ink/45 hover:bg-paper-light/70"
            >
              <span className="min-w-0">
                <span className="block font-serif text-[12.5px] font-medium leading-5 text-ink transition group-hover:text-terracotta-700">
                  {link.label}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[9.5px] text-ink-faint">{link.url}</span>
              </span>
              <ExternalLink size={11} className="mt-1 shrink-0 text-ink-faint" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </FieldDisclosure>
  );
}
