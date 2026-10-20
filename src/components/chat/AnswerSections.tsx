import type { ChatSection, ChatSectionKind } from '@shared/types';
import { Link } from 'react-router-dom';
import { useAtlas } from '@/lib/atlas';
import { paths } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SECTION_LABELS } from './labels';

/** 阅读顺序：原因/后果 → 做法 → 补充背景 → 资料说明；来源在回答末尾统一列出 */
const ORDER: Record<ChatSectionKind, number> = {
  why: 0,
  consequence: 1,
  prevention: 2,
  'post-exposure': 3,
  treatment: 4,
  note: 5,
  region: 6,
  season: 7,
  evidence: 8,
};

/** 回答分段：细线分隔，无编号无图标 */
export function AnswerSections({ sections, className }: { sections: ChatSection[]; className?: string }) {
  const list = Array.isArray(sections) ? sections.filter((s) => s && typeof s.kind === 'string') : [];
  if (list.length === 0) return null;
  const ordered = [...list].sort((a, b) => (ORDER[a.kind] ?? 99) - (ORDER[b.kind] ?? 99));
  return (
    <div className={cn('mt-5 border-t border-ink/30', className)}>
      {ordered.map((section, index) => (
        <AnswerSection key={`${section.kind}-${index}`} section={section} />
      ))}
    </div>
  );
}

/** 分段内的来源引用：有外部链接时直达原文，否则只显示编号 */
function SectionSources({ sourceIds }: { sourceIds: string[] }) {
  const { sourceById } = useAtlas();
  const items = sourceIds
    .map((id) => ({ id, source: sourceById.get(id) ?? null }))
    .filter((item) => item.source !== null || item.id);
  if (items.length === 0) return null;

  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-kai text-[10px] tracking-[0.03em] text-ink-faint">
      来源
      {items.map(({ id, source }) =>
        source?.url ? (
          <a
            key={id}
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            title={source.title}
            className="text-ink-muted underline decoration-line-strong/50 underline-offset-2 transition hover:text-terracotta-700 hover:decoration-terracotta-600"
          >
            {id}
          </a>
        ) : (
          <span key={id} title={source?.title}>
            {id}
          </span>
        ),
      )}
    </p>
  );
}

function AnswerSection({ section }: { section: ChatSection }) {
  const { parasiteById } = useAtlas();
  const kind = section.kind as ChatSectionKind;
  const title = section.title || SECTION_LABELS[kind] || '说明';
  const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs.filter((p) => typeof p === 'string' && p.trim()) : [];
  const bullets = Array.isArray(section.bullets) ? section.bullets.filter((b) => typeof b === 'string' && b.trim()) : [];
  const parasiteIds = Array.isArray(section.parasiteIds) ? section.parasiteIds : [];
  const sourceIds = Array.isArray(section.sourceIds) ? section.sourceIds : [];
  const isCare = kind === 'post-exposure' || kind === 'treatment';

  return (
    <section
      data-testid="chat-section"
      data-section-kind={section.kind}
      className={cn(
        'border-b border-ink/15 py-3.5 last:border-b-0',
        isCare && 'border-l-2 pl-3.5',
        kind === 'post-exposure' && 'border-l-terracotta-600/70',
        kind === 'treatment' && 'border-l-ochre-500/70',
      )}
    >
      <h3 className="font-serif text-[15px] font-semibold leading-snug text-ink">{title}</h3>

      {(paragraphs.length > 0 || bullets.length > 0) && (
        <div className="mt-2 space-y-2 font-serif text-[14px] leading-7 text-ink-soft">
          {paragraphs.map((paragraph, idx) => (
            <p key={idx} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
          {bullets.length > 0 && (
            <ul className="space-y-1.5">
              {bullets.map((bullet, idx) => (
                <li key={`${idx}-${bullet.slice(0, 12)}`} className="flex gap-2">
                  <span className="mt-[11px] h-px w-2.5 shrink-0 bg-terracotta-600/60" aria-hidden />
                  <span className="min-w-0">{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {parasiteIds.length > 0 && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {parasiteIds.map((id) => (
            <Link
              key={id}
              to={paths.parasite(id)}
              className="border-b border-line-strong/50 font-kai text-[10.5px] tracking-[0.03em] text-ink-soft transition hover:border-terracotta-600 hover:text-terracotta-700"
            >
              {parasiteById.get(id)?.name ?? id}
            </Link>
          ))}
        </p>
      )}

      {sourceIds.length > 0 && <SectionSources sourceIds={sourceIds} />}
    </section>
  );
}
