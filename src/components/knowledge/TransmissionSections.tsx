import type { ReactNode } from 'react';
import type { HostRelation, LifecycleStage, Transmission } from '@shared/types';
import { cn } from '@/lib/utils';

/* ========================================================================== */
/* 传播要点                                                                    */
/* ========================================================================== */

function FactCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border border-line bg-paper-light/45 px-4 py-3.5">
      <p className="font-sans text-[12px] tracking-[0.12em] text-ink-muted">{label}</p>
      <div className="mt-1.5 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-soft">{children}</div>
    </div>
  );
}

export function TransmissionFacts({ transmission, className }: { transmission: Transmission; className?: string }) {
  const vehicles = transmission.vehicles ?? [];
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2', className)}>
      <FactCard label="感染性阶段">{transmission.infectiveStage || '资料未注明'}</FactCard>
      <FactCard label="侵入方式">{transmission.entryMode || '资料未注明'}</FactCard>
      {vehicles.length > 0 && (
        <div className="border border-line bg-paper-light/45 px-4 py-3.5 sm:col-span-2">
          <p className="font-sans text-[12px] tracking-[0.12em] text-ink-muted">可被摄入的载体</p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {vehicles.map((vehicle) => (
              <li
                key={vehicle}
                className="border border-ink/20 bg-paper/60 px-2 py-0.5 font-sans text-[12px] leading-5 tracking-[0.02em] text-ink-soft"
              >
                {vehicle}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* 生活史阶段链                                                                 */
/* ========================================================================== */

export function LifecycleDiagram({
  stages,
  infectiveStage,
  className,
}: {
  stages: readonly LifecycleStage[] | null | undefined;
  infectiveStage?: string;
  className?: string;
}) {
  const list = stages ?? [];
  if (list.length === 0) {
    return <p className="font-sans text-[14px] text-ink-muted">生活史资料尚未收录。</p>;
  }
  return (
    <ol className={cn('relative', className)}>
      <span
        className="pointer-events-none absolute left-[4%] right-[4%] top-[18px] hidden border-t border-dashed border-line lg:block"
        aria-hidden
      />
      <div className="flex flex-col gap-0 lg:flex-row lg:items-stretch lg:gap-4">
        {list.map((stage, index) => {
          const isInfective = Boolean(infectiveStage && stage.name && infectiveStage.includes(stage.name));
          const isLast = index === list.length - 1;
          return (
            <li key={`${stage.name}-${index}`} className="relative flex min-w-0 flex-1 gap-4 lg:flex-col lg:gap-0 lg:px-1">
              {!isLast && <span className="absolute bottom-0 left-[17px] top-10 w-px bg-ink/20 lg:hidden" aria-hidden />}
              <span
                className={cn(
                  'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center border font-serif text-[14px] tabular-nums',
                  isInfective
                    ? 'border-terracotta-700 bg-terracotta-700 text-paper-light'
                    : 'border-line bg-paper-light text-ink-soft',
                )}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1 pb-7 lg:pb-0 lg:pt-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-serif text-[16px] font-semibold leading-snug tracking-[0.01em] text-ink">{stage.name}</h3>
                  {isInfective && <span className="font-sans text-[12px] tracking-[0.06em] text-terracotta-700">感染阶段</span>}
                </div>
                <p className="mt-1.5 font-sans text-[12px] leading-5 tracking-[0.04em] text-ink-faint">
                  宿主 / 环境 <span className="ml-1 text-[13px] text-ink-muted">{stage.host}</span>
                </p>
                <p className="mt-2 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-muted">{stage.description}</p>
              </div>
            </li>
          );
        })}
      </div>
    </ol>
  );
}

/* ========================================================================== */
/* 宿主关系                                                                     */
/* ========================================================================== */

const HOST_GROUPS: { key: keyof HostRelation; label: string; description: string }[] = [
  { key: 'definitive', label: '终宿主', description: '成虫或有性繁殖阶段寄生的宿主' },
  { key: 'intermediate', label: '中间宿主', description: '幼虫或无性繁殖阶段寄生的宿主' },
  { key: 'paratenic', label: '转续宿主', description: '幼虫可在体内存活、但不继续发育的宿主' },
  { key: 'accidental', label: '偶然宿主', description: '可被感染，但通常不参与常规传播循环的宿主' },
];

export function HostRelations({
  hosts,
  className,
}: {
  hosts: HostRelation | null | undefined;
  className?: string;
}) {
  const groups = HOST_GROUPS.map((group) => ({
    ...group,
    items: (hosts?.[group.key] ?? []) as string[],
  })).filter((group) => group.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className={className}>
      <h3 className="mb-3 border-b border-line pb-2 font-sans text-[12px] tracking-[0.16em] text-ink-faint">宿主关系</h3>
      <div className="grid border border-line sm:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.key}
            className="border-b border-ink/20 bg-paper-light/35 px-4 py-4 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0"
          >
            <p className="font-serif text-[14px] font-semibold text-ink">{group.label}</p>
            <p className="mt-1 font-sans text-[12px] leading-4 tracking-[0.02em] text-ink-faint">{group.description}</p>
            <ul className="mt-2.5 space-y-1.5">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2 font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-soft">
                  <span className="mt-[0.62rem] h-1 w-1 shrink-0 bg-terracotta-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
