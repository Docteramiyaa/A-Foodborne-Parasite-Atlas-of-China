import type { ChatCitation } from '@shared/types';
import { ChevronDown } from 'lucide-react';
import { useAtlas } from '@/lib/atlas';
import { cn } from '@/lib/utils';

/**
 * 回答来源：折叠列表。
 * 有外部链接的引用直达原文/摘要页；没有链接时只显示题名与出处，不跳内部转载页。
 */
export function CitationList({ citations, className }: { citations: ChatCitation[]; className?: string }) {
  const { sourceById } = useAtlas();
  const list = Array.isArray(citations) ? citations.filter((c) => c && typeof c.sourceId === 'string') : [];
  if (list.length === 0) return null;

  return (
    <details className={cn('group border-t border-line', className)}>
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="font-sans text-[13px] tracking-[0.06em] text-ink-soft">来源（{list.length}）</span>
        <ChevronDown size={13} className="translate-y-0.5 text-ink-faint transition-transform duration-300 group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="border-t border-ink/20">
        {list.map((citation, index) => {
          const source = sourceById.get(citation.sourceId) ?? null;
          const externalUrl = citation.url || source?.url;
          const title = citation.title || source?.title || citation.sourceId;
          const venue = citation.venue || source?.venue;
          const year = citation.year ?? source?.year;
          const meta = [venue, year].filter(Boolean).join(' · ');

          return (
            <li
              key={`${citation.sourceId}-${index}`}
              className="border-b border-ink/15 py-2.5 last:border-b-0"
              data-testid="chat-citation"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="border border-line/80 px-1.5 py-px font-mono text-xs text-ink-muted">{citation.sourceId}</span>
                {externalUrl ? (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-serif text-[14px] leading-5 text-ink underline decoration-line-strong/50 underline-offset-2 transition hover:text-blue-700 hover:decoration-terracotta-600"
                  >
                    {title}
                  </a>
                ) : (
                  <span className="font-serif text-[14px] leading-5 text-ink">{title}</span>
                )}
                {meta && <span className="font-sans text-[12px] tracking-[0.02em] text-ink-muted">{meta}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
