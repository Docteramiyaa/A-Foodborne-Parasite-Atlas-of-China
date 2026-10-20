import { Clock } from 'lucide-react';
import type { Consequence, RiskScenario } from '@shared/types';
import { RiskBadge, SeverityBadge } from '@/components/ui/Badge';
import { riskMeta } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FoodLinks, PreparationTags, severityRank } from './Shared';

/* ========================================================================== */
/* 风险情形                                                                     */
/* ========================================================================== */

export function RiskScenarioCard({
  scenario,
  className,
}: {
  scenario: RiskScenario;
  className?: string;
}) {
  const meta = riskMeta(scenario.riskLevel);
  const examples = scenario.examples ?? [];
  return (
    <article
      className={cn('border border-l-[3px] border-line bg-paper-light/45 p-5', className)}
      style={{ borderLeftColor: meta.fill }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-serif text-[17px] font-semibold leading-snug tracking-[0.01em] text-ink">{scenario.title}</h3>
        <RiskBadge level={scenario.riskLevel} />
      </div>

      {examples.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="常见情形">
          {examples.map((example) => (
            <li key={example} className="border-b border-dashed border-line font-sans text-[13px] leading-5 tracking-[0.02em] text-ink-muted">
              {example}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3.5 font-sans text-[14px] leading-7 tracking-[0.02em] text-ink-soft">{scenario.explanation}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink/20 pt-3">
        <PreparationTags tags={scenario.preparationTags} withIcon />
        <FoodLinks ids={scenario.foodIds} prefix="关联食物" />
      </div>
    </article>
  );
}

/* ========================================================================== */
/* 可能后果                                                                     */
/* ========================================================================== */

export function ConsequenceList({
  consequences,
  className,
}: {
  consequences: readonly Consequence[] | null | undefined;
  className?: string;
}) {
  const list = [...(consequences ?? [])].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  if (list.length === 0) {
    return <p className="font-sans text-[14px] text-ink-muted">后果资料尚未收录。</p>;
  }
  return (
    <ol className={cn('border-t border-line', className)}>
      {list.map((consequence) => (
        <li key={consequence.id} className="border-b border-ink/20 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="font-serif text-[16.5px] font-semibold leading-snug tracking-[0.01em] text-ink">
              {consequence.title}
            </h3>
            <SeverityBadge severity={consequence.severity} />
          </div>
          <p className="mt-2 font-sans text-[14px] leading-7 tracking-[0.02em] text-ink-soft">{consequence.description}</p>
          {consequence.onset && (
            <p className="mt-2.5 inline-flex items-center gap-1.5 font-sans text-[12px] tracking-[0.02em] text-ink-muted">
              <Clock size={11} aria-hidden />
              {consequence.onset}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
