import type { SourceType } from '@shared/types';
import { ExternalLink } from 'lucide-react';
import { useAtlas } from '@/lib/atlas';
import { cn } from '@/lib/utils';

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  guideline: '指南',
  surveillance: '监测 / 疫情',
  study: '研究',
  review: '综述',
  institution: '机构资料',
  encyclopedia: '百科',
  media: '媒体',
  reference: '参考 / 教材',
};

function sourceLink(source: { id: string; url?: string; doi?: string }): string | null {
  if (source.url) return source.url;
  if (source.doi) return `https://doi.org/${source.doi.replace(/^https?:\/\/doi.org\//, '')}`;
  return null;
}

/** 行内来源引用：[S06] [S39]；有外链时直达，没有时落到来源清单锚点。 */
export function SourceRefs({ sourceIds, max, className }: { sourceIds: string[]; max?: number; className?: string }) {
  const { sourceById } = useAtlas();
  const ids = max ? sourceIds.slice(0, max) : sourceIds;
  const rest = max ? sourceIds.length - ids.length : 0;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1 align-middle', className)}>
      {ids.map((id) => {
        const source = sourceById.get(id);
        const href = source ? sourceLink(source) : null;
        return (
          <a
            key={id}
            href={href ?? `/sources#${id}`}
            target={href ? '_blank' : undefined}
            rel={href ? 'noreferrer noopener' : undefined}
            title={source ? source.title : id}
            className="border border-line-strong/60 bg-paper/60 px-1.5 py-px font-mono text-[10px] font-medium text-ink-soft transition hover:border-ink/50 hover:bg-paper-light hover:text-ink"
          >
            {id}
          </a>
        );
      })}
      {rest > 0 && <span className="text-2xs text-ink-faint">+{rest}</span>}
    </span>
  );
}

/** 详情页来源清单：题名、作者、年份、出处与直达链接；不展示可靠性分级。 */
export function SourceList({
  sourceIds,
  title,
  compact = false,
  className,
}: {
  sourceIds: string[];
  title?: string;
  compact?: boolean;
  className?: string;
}) {
  const { sourceById } = useAtlas();
  const sources = sourceIds.map((id) => sourceById.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (sources.length === 0) {
    return <p className="font-kai text-sm text-ink-muted">本条目暂未关联来源。</p>;
  }
  return (
    <div className={className}>
      {title && <h3 className="mb-3 font-serif text-base font-semibold text-ink">{title}</h3>}
      <ol className={cn('divide-y divide-line/60 border-y border-line/60', compact && 'text-[12px]')}>
        {sources.map((source) => {
          const href = sourceLink(source);
          return (
            <li key={source.id} className="py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 font-mono text-[10px] text-ink-faint">{source.id}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-serif text-[13px] font-semibold leading-5 text-ink underline decoration-line-strong/50 underline-offset-2 hover:decoration-terracotta-700 hover:text-terracotta-800"
                      >
                        {source.title}
                      </a>
                    ) : (
                      <span className="font-serif text-[13px] font-semibold leading-5 text-ink">{source.title}</span>
                    )}
                    {href && <ExternalLink size={11} aria-hidden className="shrink-0 text-ink-muted" />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-kai text-[11px] text-ink-muted">
                    {source.authors && <span>{source.authors}</span>}
                    {source.venue && <span>{source.venue}</span>}
                    <span>{source.year}</span>
                    <span className="text-ink-faint">{SOURCE_TYPE_LABEL[source.type] ?? source.type}</span>
                    {!href && <span className="text-ink-faint">暂无公开链接</span>}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
