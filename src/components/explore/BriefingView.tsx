import type { ReactNode } from 'react';
import type { ExploreBriefing, ExploreRiskItem, SeasonId } from '@shared/types';
import { SEASON_LABELS } from '@/lib/query-context';
import { cn } from '@/lib/utils';

const RISK_LABEL: Record<ExploreRiskItem['riskLevel'], string> = {
  high: '需要留意',
  moderate: '值得注意',
  contextual: '取决于具体做法',
  low: '风险较低',
  unknown: '资料不足',
};

function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('font-serif text-[17px] font-semibold tracking-[0.02em] text-ink', className)}>{children}</h3>
  );
}

function SourceList({ sources }: { sources: ExploreBriefing['sources'] }) {
  if (sources.length === 0) return null;
  return (
    <section aria-label="来源" className="border-t border-ink/20 pt-4">
      <SectionTitle className="text-[15px]">来源</SectionTitle>
      <ol className="mt-2 space-y-2">
        {sources.map((source, index) => {
          const href = source.doi
            ? `https://doi.org/${encodeURIComponent(source.doi)}`
            : source.url
              ? source.url
              : null;
          return (
            <li key={source.id} className="flex gap-2.5 font-sans text-[13px] leading-5 text-ink-muted">
              <span className="shrink-0 pt-px text-[12px] text-ink-faint">{index + 1}.</span>
              <div className="min-w-0">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="border-b border-line-strong/70 text-ink-soft transition hover:border-blue-700 hover:text-blue-700"
                  >
                    {source.title}
                  </a>
                ) : (
                  <span className="text-ink-soft">{source.title}</span>
                )}
                <span className="ml-1.5 text-ink-faint">
                  {source.venue ? `${source.venue} · ` : ''}
                  {source.year}
                  {source.doi ? ` · DOI ${source.doi}` : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RiskBlock({ risks }: { risks: ExploreRiskItem[] }) {
  return (
    <section
      aria-label="当前风险"
      className="rounded-r-xl border-l-2 border-terracotta-700 bg-terracotta-100/25 py-3.5 pl-4 pr-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[20px] font-semibold text-terracotta-800">当前风险</h2>
        <span className="font-sans text-[12px] tracking-[0.08em] text-terracotta-700">当前做法下仍存在</span>
      </div>
      <ul className="mt-3 space-y-4">
        {risks.map((risk) => (
          <li key={risk.parasite.id}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-serif text-[15px] font-semibold text-ink">{risk.parasite.name}</span>
              <span className="border border-terracotta-700/50 px-1.5 py-px font-sans text-[12px] text-terracotta-800">
                {RISK_LABEL[risk.riskLevel]}
              </span>
              {risk.conditions && risk.conditions.length > 0 && (
                <span className="font-sans text-[12px] text-ink-faint">{risk.conditions.join(' · ')}</span>
              )}
            </div>
            <p className="mt-1.5 font-sans text-[14px] leading-6 text-ink-soft">{risk.explanation}</p>
            {(risk.seasonNote || risk.regionNote) && (
              <p className="mt-1 font-sans text-[13px] leading-5 text-ink-muted">
                {[risk.seasonNote, risk.regionNote].filter(Boolean).join(' ')}
              </p>
            )}
            {risk.consequences.length > 0 && (
              <div className="mt-2 border-t border-terracotta-700/20 pt-2">
                <p className="font-sans text-[12px] tracking-[0.12em] text-terracotta-700">可能后果</p>
                {risk.consequences.slice(0, 2).map((item) => (
                  <p key={item.id} className="mt-1 font-sans text-[13px] leading-5 text-ink-muted">
                    {item.description}
                  </p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EffectiveBlock({ briefing }: { briefing: ExploreBriefing }) {
  return (
    <section aria-label="处理有效" className="rounded-r-xl border-l-2 border-jade-700 bg-jade-100/40 py-3.5 pl-4 pr-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-jade-900">处理有效</h2>
        <span className="font-sans text-[12px] tracking-[0.08em] text-blue-800">当前做法已经足够</span>
      </div>
      <ul className="mt-3 space-y-3">
        {briefing.effectiveProtections.map((protection, index) => (
          <li key={`${protection.title}-${index}`}>
            <p className="font-sans text-[14px] font-medium leading-6 text-ink">{protection.title}</p>
            <p className="mt-0.5 font-sans text-[14px] leading-6 text-ink-soft">{protection.detail}</p>
            {protection.parasiteNames.length > 0 && (
              <p className="mt-1 font-sans text-[12px] leading-5 text-ink-muted">
                涉及：{protection.parasiteNames.join('、')}
              </p>
            )}
          </li>
        ))}
      </ul>
      {briefing.relatedParasites.length > 0 && (
        <p className="mt-3 border-t border-blue-700/20 pt-2 font-sans text-[13px] leading-5 text-ink-muted">
          与该食物有关、但不在当前做法风险判断中的寄生虫见下方“相关知识”。
        </p>
      )}
    </section>
  );
}

function IncompleteBlock({ briefing }: { briefing: ExploreBriefing }) {
  const food = briefing.selection.foods[0];
  const heading = food ? '还缺一个做法' : '还缺一种食物';
  const message = food
    ? `选择“${food.name}”是怎么做的之后，才能判断哪些风险仍然存在。`
    : '先选择一种食物；如果已经选了做法，也要让食物与做法对应起来。';
  return (
    <section aria-label="信息不足" className="border border-dashed border-line-strong/70 bg-paper-light/40 px-4 py-3.5">
      <h2 className="font-serif text-[18px] font-semibold text-ink">{heading}</h2>
      <p className="mt-1.5 font-sans text-[14px] leading-6 text-ink-soft">{message}</p>
    </section>
  );
}

function ContextBlock({ briefing }: { briefing: ExploreBriefing }) {
  return (
    <section aria-label="背景资料" className="border-l-2 border-line-strong/60 py-2 pl-4">
      <h2 className="font-serif text-[19px] font-semibold text-ink">背景资料</h2>
      <p className="mt-1.5 font-sans text-[14px] leading-6 text-ink-soft">
        {briefing.selection.foods.length === 0
          ? '先看所选地区与季节的背景；选择食物和做法后，才会给出针对当前情况的风险判断。'
          : '当前只选择了食物；选择做法后，才会给出针对当前情况的风险判断。'}
      </p>
    </section>
  );
}

function ProtectionSection({ risks, briefing }: { risks: ExploreRiskItem[]; briefing: ExploreBriefing }) {
  const items = new Map<string, { title: string; detail: string }>();
  for (const risk of risks) {
    for (const item of risk.prevention) items.set(item.title, { title: item.title, detail: item.detail });
  }
  for (const protection of briefing.effectiveProtections) {
    items.set(protection.title, { title: protection.title, detail: protection.detail });
  }
  if (items.size === 0) return null;
  return (
    <section aria-label="可采取的做法" className="border-t border-ink/20 pt-4">
      <SectionTitle>可采取的做法</SectionTitle>
      <ul className="mt-2 space-y-2.5">
        {Array.from(items.values())
          .slice(0, 5)
          .map((item) => (
            <li key={item.title} className="border-l border-line pl-3">
              <p className="font-sans text-[14px] font-medium leading-6 text-ink">{item.title}</p>
              <p className="mt-0.5 font-sans text-[13px] leading-5 text-ink-muted">{item.detail}</p>
            </li>
          ))}
      </ul>
    </section>
  );
}

function SeasonBackground({ briefing }: { briefing: ExploreBriefing }) {
  if (briefing.seasonGroups.length === 0) return null;
  const seasonLabel = briefing.selection.season?.label ?? '这个季节';
  const sentenceFor = (group: ExploreBriefing['seasonGroups'][number]) => {
    const names = group.parasites.map((item) => item.name).join('、');
    switch (group.relation) {
      case 'peak':
        return `${names}在${seasonLabel}有文献报告高峰。`;
      case 'all-year':
        return `${names}全年都有相关记录。`;
      case 'off-peak':
        return `${names}的文献报告高峰不在${seasonLabel}。`;
      case 'not-recorded':
        return `现有资料暂未收录${names}的明确季节资料。`;
      default:
        return `${names}的季节资料不足。`;
    }
  };
  return (
    <section aria-label="季节背景" className="border-t border-ink/20 pt-4">
      <SectionTitle>季节背景</SectionTitle>
      <ul className="mt-2 space-y-1.5">
        {briefing.seasonGroups.map((group) => (
          <li key={group.relation} className="font-sans text-[13px] leading-6 text-ink-muted">
            {sentenceFor(group)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RegionKnowledge({ briefing }: { briefing: ExploreBriefing }) {
  const region = briefing.regionKnowledge;
  if (!region) return null;
  return (
    <section aria-label="地区资料" className="border-t border-ink/20 pt-4">
      <SectionTitle>{region.name}的本地资料</SectionTitle>
      <p className="mt-1.5 font-sans text-[14px] leading-6 text-ink-soft">{region.intro}</p>
      {region.foodCulture.length > 0 && (
        <p className="mt-1 font-sans text-[13px] leading-5 text-ink-muted">饮食特点：{region.foodCulture.join('；')}</p>
      )}
      {region.entries.length > 0 ? (
        <ul className="mt-2.5 space-y-2">
          {region.entries.slice(0, 3).map((entry) => (
            <li key={entry.id} className="border-l border-line pl-3">
              <p className="font-sans text-[14px] font-medium leading-5 text-ink">{entry.headline}</p>
              <p className="mt-0.5 line-clamp-2 font-sans text-[13px] leading-5 text-ink-muted">{entry.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 font-sans text-[13px] leading-5 text-ink-muted">本地资料暂未收录与当前条件对应的具体记录。</p>
      )}
    </section>
  );
}

function RelatedKnowledge({ items }: { items: ExploreBriefing['relatedParasites'] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="相关知识" className="border-t border-ink/20 pt-4">
      <SectionTitle>相关知识</SectionTitle>
      <p className="mt-1.5 font-sans text-[13px] leading-5 text-ink-muted">
        下面这些内容与所选食物或地区有关，但不属于当前做法的风险判断。
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.parasite.id} className="font-sans text-[13px] leading-5 text-ink-muted">
            <span className="font-medium text-ink-soft">{item.parasite.name}</span>：{item.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface BriefingViewProps {
  briefing: ExploreBriefing;
  className?: string;
}

/**
 * 探索页唯一的结果阅读区：
 * 当前情况 → 当前风险 / 处理有效 / 信息不足 → 原因与后果 → 可采取的做法 → 本地资料/季节背景 → 来源。
 */
export function BriefingView({ briefing, className }: BriefingViewProps) {
  const hasRisk = briefing.situation === 'risk' && briefing.currentRisks.length > 0;
  const isEffective = briefing.situation === 'effective';
  const isIncomplete = briefing.situation === 'incomplete';
  const isUncertain = briefing.situation === 'uncertain';
  const isContext = briefing.situation === 'context';
  const isEmpty = briefing.situation === 'empty';

  return (
    <article
      data-testid="explore-briefing"
      aria-live="polite"
      className={cn('min-w-0', className)}
    >
      <header className="border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {hasRisk && (
            <span className="rounded-md border border-terracotta-700 bg-terracotta-700 px-2 py-1 text-xs text-white">
              需要注意
            </span>
          )}
          {isEffective && (
            <span className="rounded-md border border-jade-700 bg-jade-700 px-2 py-1 text-xs text-white">
              处理有效
            </span>
          )}
          {isIncomplete && (
            <span className="border border-line-strong/80 px-2 py-0.5 font-sans text-[12px] tracking-[0.08em] text-ink-muted">
              信息不足
            </span>
          )}
          {isUncertain && (
            <span className="border border-line-strong/80 px-2 py-0.5 font-sans text-[12px] tracking-[0.08em] text-ink-muted">
              资料不足
            </span>
          )}
          {isContext && (
            <span className="border border-line-strong/80 px-2 py-0.5 font-sans text-[12px] tracking-[0.08em] text-ink-muted">
              背景资料
            </span>
          )}
          {isEmpty && (
            <span className="border border-line-strong/80 px-2 py-0.5 font-sans text-[12px] tracking-[0.08em] text-ink-muted">
              先选条件
            </span>
          )}
        </div>
        <h2 className="mt-3 text-[clamp(1.4rem,2.2vw,1.8rem)] font-semibold leading-snug text-ink">
          {briefing.headline}
        </h2>
        <p className="mt-2 max-w-[46rem] font-sans text-[14px] leading-7 tracking-[0.02em] text-ink-soft">
          {briefing.summary}
        </p>
        {briefing.notices.length > 0 && (
          <p className="mt-2 border-l border-line-strong/60 pl-3 font-sans text-[13px] leading-5 text-ink-muted">
            {briefing.notices.join(' ')}
          </p>
        )}
      </header>

      <div className="mt-4 space-y-4">
        {hasRisk && <RiskBlock risks={briefing.currentRisks} />}
        {isEffective && <EffectiveBlock briefing={briefing} />}
        {isIncomplete && <IncompleteBlock briefing={briefing} />}
        {isContext && briefing.seasonGroups.length === 0 && !briefing.regionKnowledge && <ContextBlock briefing={briefing} />}
        {isUncertain && (
          <section aria-label="资料不足" className="border border-dashed border-line-strong/70 px-4 py-3">
            <p className="font-sans text-[14px] leading-6 text-ink-muted">
              现有资料不足以判断这种做法下是否存在需要调整的风险。可以换一种做法，或查看下面的地区与季节背景。
            </p>
          </section>
        )}

        {hasRisk && <ProtectionSection risks={briefing.currentRisks} briefing={briefing} />}
        <RelatedKnowledge items={briefing.relatedParasites} />
        <SeasonBackground briefing={briefing} />
        <RegionKnowledge briefing={briefing} />
        <SourceList sources={briefing.sources} />
      </div>
    </article>
  );
}

export function seasonLabelOf(season: SeasonId | null): string {
  return season ? SEASON_LABELS[season] : '不限季节';
}



