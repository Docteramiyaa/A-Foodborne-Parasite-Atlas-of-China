import type { Source, SourceType } from '@shared/types';
import { ExternalLink, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { SOURCE_TYPE_LABEL } from '@/components/ui/SourceList';
import { cn } from '@/lib/utils';

/** 来源类型在分组/筛选中的顺序（按资料性质排列） */
export const SOURCE_TYPE_ORDER: SourceType[] = [
  'guideline',
  'surveillance',
  'institution',
  'study',
  'review',
  'reference',
  'encyclopedia',
  'media',
];

export const SOURCE_TYPE_DESCRIPTION: Record<SourceType, string> = {
  guideline: '诊断、治疗或防控指南，通常由专业机构发布。',
  surveillance: '疫情报告、监测数据与现场调查报告。',
  institution: '权威机构的专题资料，如 CDC DPDx、WHO 事实清单。',
  study: '同行评议的原始研究或现场调查。',
  review: '综述与荟萃分析，汇总多项研究。',
  reference: '教材、手册与参考工具书。',
  encyclopedia: '百科与健康门户等二手资料。',
  media: '科普报道与新闻媒体。',
};

/** 来源的可访问链接：优先原文 URL，其次 DOI。 */
export function sourceLink(source: Source): string | null {
  if (source.url) return source.url;
  if (source.doi) {
    const doi = source.doi.replace(/^https?:\/\/doi\.org\//, '');
    return `https://doi.org/${doi}`;
  }
  return null;
}

/**
 * 来源清单行：编号（引用锚点）、题名、作者、年份、出处、类型与可访问链接。
 * 不展示可靠性分级、使用方式或注意事项。
 */
export function SourceIndexRow({ source, className }: { source: Source; className?: string }) {
  const href = sourceLink(source);
  return (
    <article
      id={source.id}
      className={cn('scroll-mt-28 border-b border-line py-4 first:border-t-0', className)}
    >
      <div className="grid gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-start sm:gap-5">
        <span className="font-mono text-[12px] leading-6 text-ink-faint">{source.id}</span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-serif text-[16px] font-semibold leading-6 text-ink underline decoration-line-strong/45 underline-offset-2 transition hover:text-blue-800 hover:decoration-terracotta-700"
              >
                {source.title}
              </a>
            ) : (
              <span className="font-serif text-[16px] font-semibold leading-6 text-ink">{source.title}</span>
            )}
            {href && <ExternalLink size={11} aria-hidden className="shrink-0 text-ink-muted" />}
          </div>

          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-sans text-[14px] leading-5 text-ink-muted">
            {source.authors && <span>{source.authors}</span>}
            {source.venue && <span>{source.venue}</span>}
            <span>{source.year}</span>
            {source.citation && <span className="text-ink-faint">{source.citation}</span>}
            <span className="text-ink-faint">{SOURCE_TYPE_LABEL[source.type] ?? source.type}</span>
          </p>
          {source.doi && (
            <p className="mt-1 font-mono text-[12px] text-ink-faint">
              DOI:{' '}
              <a
                href={`https://doi.org/${source.doi.replace(/^https?:\/\/doi\.org\//, '')}`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-line-strong/40 underline-offset-2 transition hover:text-blue-800 hover:decoration-terracotta-700"
              >
                {source.doi}
              </a>
            </p>
          )}
        </div>

        {!href && (
          <div className="font-sans text-[13px] leading-5 text-ink-faint sm:pt-0.5 sm:text-right">
            <span className="inline-flex items-center gap-1">
              <FileText size={10} aria-hidden /> 暂无公开链接
            </span>
          </div>
        )}
      </div>
    </article>
  );
}


