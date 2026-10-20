import type { RiskLevel, RiskVerdict } from '@shared/types';
import { Link } from 'react-router-dom';
import { useAtlas } from '@/lib/atlas';
import { paths, riskMeta } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RiskBadge } from '@/components/ui/Badge';

const TONE_RULE: Record<string, string> = {
  danger: 'border-terracotta-600',
  warning: 'border-ochre-500',
  safe: 'border-jade-700',
  neutral: 'border-line-strong',
  muted: 'border-line',
};

/** 用自然说法表达风险等级，不展示内部术语 */
const HEADLINE: Record<RiskLevel, string> = {
  high: '值得认真对待',
  moderate: '需要多留意',
  low: '风险较低',
  contextual: '取决于具体情况',
  unknown: '资料不足',
};

/** 风险判断：左侧色标 + 简短理由 */
export function VerdictBanner({ verdict, className }: { verdict: RiskVerdict; className?: string }) {
  const { parasiteById } = useAtlas();
  const tone = riskMeta(verdict.level).tone;
  const rationale = Array.isArray(verdict.rationale) ? verdict.rationale.filter((r) => typeof r === 'string' && r.trim()) : [];
  const parasiteIds = Array.isArray(verdict.parasiteIds) ? verdict.parasiteIds : [];

  return (
    <section
      aria-label={`风险判断：${HEADLINE[verdict.level] ?? '需要留意'}`}
      className={cn('border-l-[3px] pl-3.5', TONE_RULE[tone] ?? TONE_RULE.neutral, className)}
      data-testid="chat-verdict"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <RiskBadge level={verdict.level} />
        <h3 className="font-serif text-[16px] font-semibold leading-snug text-ink">
          {HEADLINE[verdict.level] ?? '需要留意'}
        </h3>
      </div>

      {rationale.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-soft">
          {rationale.map((item, index) => (
            <li key={`${index}-${item.slice(0, 12)}`} className="flex gap-2">
              <span className="mt-[11px] h-px w-2.5 shrink-0 bg-terracotta-600/60" aria-hidden />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      )}

      {parasiteIds.length > 0 && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {parasiteIds.map((id) => (
            <Link
              key={id}
              to={paths.parasite(id)}
              className="border-b border-line-strong/50 font-sans text-[12px] tracking-[0.03em] text-ink-soft transition hover:border-blue-600 hover:text-blue-700"
            >
              {parasiteById.get(id)?.name ?? id}
            </Link>
          ))}
        </p>
      )}
    </section>
  );
}
