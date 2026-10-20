import type { ReactNode } from 'react';
import type { EvidenceLevel, RegionStatus, RiskLevel, Severity } from '@shared/types';
import { cn } from '@/lib/utils';
import {
  EVIDENCE_META,
  REGION_STATUS_FALLBACK,
  RISK_META,
  SEVERITY_META,
  STATUS_TONE_BADGE,
  riskMeta,
  type RegionStatusTone,
} from '@/lib/format';
import { useAtlas } from '@/lib/atlas';

type BadgeTone = 'jade' | 'ochre' | 'terracotta' | 'neutral' | 'outline' | 'dark';

const BADGE_TONES: Record<BadgeTone, string> = {
  jade: 'border-jade-300 bg-jade-100/80 text-jade-900',
  ochre: 'border-ochre-300 bg-ochre-100 text-ochre-700',
  terracotta: 'border-terracotta-300 bg-terracotta-100 text-terracotta-800',
  neutral: 'border-line bg-paper-deep/80 text-ink-soft',
  outline: 'border-line-strong/70 bg-transparent text-ink-muted',
  dark: 'border-jade-900 bg-jade-900 text-paper-light',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[2px] border px-2.5 py-0.5 text-2xs font-medium leading-5 tracking-wide',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  active,
  className,
  children,
  ...rest
}: {
  active?: boolean;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[13px] transition duration-200',
        active
          ? 'border-jade-800 bg-jade-800 text-paper-light shadow-sm'
          : 'border-line bg-paper-light/60 text-ink-soft hover:border-ink/30 hover:bg-paper-light hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- 语义徽标 ---------------- */

export function RiskBadge({ level, className, withDot = true }: { level: RiskLevel | null | undefined; className?: string; withDot?: boolean }) {
  const meta = riskMeta(level);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-0.5 text-2xs font-semibold leading-5 tracking-wide',
        meta.className,
        className,
      )}
    >
      {withDot && <span className={cn('h-1.5 w-1.5 rounded-[2px]', meta.dotClass)} aria-hidden />}
      {meta.short}
    </span>
  );
}

export function EvidenceBadge({ level, className }: { level: EvidenceLevel; className?: string }) {
  const meta = EVIDENCE_META[level] ?? EVIDENCE_META.D;
  return (
    <span
      title={meta.description}
      className={cn('inline-flex items-center rounded-[2px] border px-2 py-0.5 text-2xs font-semibold leading-5', meta.className, className)}
    >
      {meta.short}
    </span>
  );
}

export function RegionStatusBadge({ status, className }: { status: RegionStatus; className?: string }) {
  const { taxonomy } = useAtlas();
  const meta = taxonomy.regionStatuses.find((s) => s.id === status);
  const fallback = REGION_STATUS_FALLBACK[status] ?? REGION_STATUS_FALLBACK.unknown;
  const tone = (meta?.tone ?? fallback.tone) as RegionStatusTone;
  return (
    <span
      title={meta?.description ?? fallback.description}
      className={cn(
        'inline-flex items-center gap-1 rounded-[2px] border px-2.5 py-0.5 text-2xs font-medium leading-5',
        STATUS_TONE_BADGE[tone],
        className,
      )}
    >
      {meta?.name ?? fallback.name}
    </span>
  );
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.variable;
  return (
    <span className={cn('inline-flex items-center rounded-[2px] border px-2 py-0.5 text-2xs font-medium leading-5', meta.className, className)}>
      {meta.label}
    </span>
  );
}

export function RiskLegendDot({ level }: { level: RiskLevel }) {
  const meta = RISK_META[level];
  return <span className={cn('h-2 w-2 rounded-[2px]', meta.dotClass)} aria-hidden />;
}

