import type { ChatContext, PreparationTag } from '@shared/types';
import { useMemo, useState } from 'react';
import { useAtlas } from '@/lib/atlas';
import { MONTH_LABELS, preparationLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EXPOSURE_LABELS } from './labels';
import { hasContextConditions } from './session';

export interface ContextPanelHandlers {
  onRemoveProvince: (code: string) => void;
  onRemoveMonth: (month: number) => void;
  onRemoveFood: (id: string) => void;
  onRemovePreparation: (tag: PreparationTag) => void;
  onRemoveParasite: (id: string) => void;
  onRemoveSymptom: (symptom: string) => void;
  onClearExposure: () => void;
  onClearTime: () => void;
  onClearContext: () => void;
  onClearConversation: () => void;
}

interface ContextPanelProps {
  context: ChatContext;
  itemsCount: number;
  handlers: ContextPanelHandlers;
  className?: string;
}

interface ChipGroup {
  key: string;
  label: string;
  items: { key: string; label: string; remove: () => void }[];
}

function countConditions(context: ChatContext): number {
  return (
    context.provinceCodes.length +
    context.months.length +
    context.foodIds.length +
    context.preparationTags.length +
    context.parasiteIds.length +
    context.symptoms.length +
    (context.exposure !== 'unknown' ? 1 : 0) +
    (context.timeExpression ? 1 : 0)
  );
}

function ContextChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-[26px] items-center gap-1 border border-line/80 bg-paper-light/80 py-0.5 pl-2 pr-0.5 font-sans text-[13px] tracking-[0.02em] text-ink-soft">
      <span className="max-w-[9.5rem] truncate" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除条件：${label}`}
        title={`移除条件：${label}`}
        className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center text-[14px] leading-none text-ink-faint transition hover:text-blue-700 after:absolute after:-inset-2 after:content-['']"
      >
        <span aria-hidden>×</span>
      </button>
    </span>
  );
}

function useChipGroups(context: ChatContext, handlers: ContextPanelHandlers): { groups: ChipGroup[]; missing: string[] } {
  const { regionByCode, foodById, parasiteById, taxonomy } = useAtlas();
  const preparationNames = useMemo(() => new Map(taxonomy.preparations.map((p) => [p.id, p.name])), [taxonomy.preparations]);

  const groups: ChipGroup[] = [
    {
      key: 'province',
      label: '地区',
      items: context.provinceCodes.map((code) => ({
        key: code,
        label: regionByCode.get(code)?.name ?? code,
        remove: () => handlers.onRemoveProvince(code),
      })),
    },
    {
      key: 'month',
      label: '月份',
      items: context.months.map((month) => ({
        key: String(month),
        label: MONTH_LABELS[month - 1] ?? `${month} 月`,
        remove: () => handlers.onRemoveMonth(month),
      })),
    },
    {
      key: 'food',
      label: '食物',
      items: context.foodIds.map((id) => ({
        key: id,
        label: foodById.get(id)?.name ?? id,
        remove: () => handlers.onRemoveFood(id),
      })),
    },
    {
      key: 'preparation',
      label: '处理方式',
      items: context.preparationTags.map((tag) => ({
        key: tag,
        label: preparationLabel(tag, preparationNames),
        remove: () => handlers.onRemovePreparation(tag),
      })),
    },
    {
      key: 'parasite',
      label: '寄生虫',
      items: context.parasiteIds.map((id) => ({
        key: id,
        label: parasiteById.get(id)?.name ?? id,
        remove: () => handlers.onRemoveParasite(id),
      })),
    },
    {
      key: 'exposure',
      label: '是否已食用',
      items:
        context.exposure === 'unknown'
          ? []
          : [{ key: 'exposure', label: EXPOSURE_LABELS[context.exposure], remove: handlers.onClearExposure }],
    },
    {
      key: 'symptoms',
      label: '症状',
      items: context.symptoms.map((symptom) => ({
        key: symptom,
        label: symptom,
        remove: () => handlers.onRemoveSymptom(symptom),
      })),
    },
    {
      key: 'timeExpression',
      label: '时间',
      items: context.timeExpression ? [{ key: 'time', label: context.timeExpression, remove: handlers.onClearTime }] : [],
    },
  ];

  const missing: string[] = [];
  if (context.provinceCodes.length === 0) missing.push('地区');
  if (context.foodIds.length === 0) missing.push('食物');
  if (context.preparationTags.length === 0) missing.push('处理方式');
  if (context.months.length === 0) missing.push('月份');

  return { groups: groups.filter((group) => group.items.length > 0), missing };
}

function ContextBody({ groups, missing, hasAny }: { groups: ChipGroup[]; missing: string[]; hasAny: boolean }) {
  if (!hasAny) {
    return (
      <div>
        <p className="font-serif text-[14px] font-semibold text-ink">还没有条件</p>
        <p className="mt-1 font-sans text-[12px] leading-5 tracking-[0.02em] text-ink-muted">
          你提到的地区、月份、食物、处理方式与寄生虫会显示在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="font-sans text-[12px] tracking-[0.08em] text-ink-faint">{group.label}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {group.items.map((item) => (
              <ContextChip key={`${group.key}-${item.key}`} label={item.label} onRemove={item.remove} />
            ))}
          </div>
        </div>
      ))}
      {missing.length > 0 && (
        <p className="font-sans text-[12px] leading-4 tracking-[0.02em] text-ink-faint">
          可补充：{missing.join(' / ')}
        </p>
      )}
    </div>
  );
}

function ContextFooter({
  context,
  itemsCount,
  handlers,
  compact = false,
}: {
  context: ChatContext;
  itemsCount: number;
  handlers: ContextPanelHandlers;
  compact?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const hasAny = hasContextConditions(context);

  return (
    <div className={cn('space-y-2', compact ? 'mt-3' : '')}>
      {confirming ? (
        <div className="border border-terracotta-700/40 bg-terracotta-100/25 px-3 py-2">
          <p className="font-sans text-[12px] leading-5 text-ink-soft">清空本次对话与条件？</p>
          <div className="mt-1.5 flex gap-3">
            <button
              type="button"
              onClick={() => {
                handlers.onClearConversation();
                setConfirming(false);
              }}
              className="border-b border-terracotta-600 font-sans text-[13px] text-terracotta-700"
            >
              清空
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="font-sans text-[13px] text-ink-muted">
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={itemsCount === 0}
            onClick={() => setConfirming(true)}
            data-testid="chat-clear"
            className="border-b border-line-strong/60 font-sans text-[12px] tracking-[0.04em] text-ink-muted transition hover:border-blue-600 hover:text-blue-700 disabled:pointer-events-none disabled:opacity-45"
          >
            清空对话
          </button>
          {hasAny && (
            <button
              type="button"
              onClick={handlers.onClearContext}
              className="border-b border-transparent font-sans text-[12px] tracking-[0.04em] text-ink-muted transition hover:border-line-strong/60 hover:text-ink"
            >
              仅清除条件
            </button>
          )}
        </div>
      )}

      <p className="border-t border-ink/20 pt-2 font-sans text-[12px] leading-4 tracking-[0.02em] text-ink-faint">
        仅保存在本浏览器标签页，关闭即清除。
      </p>
    </div>
  );
}

const cardShell = 'relative rounded-2xl border border-line bg-white shadow-card';

/** 桌面右侧粘性条件面板 */
export function ContextPanel({ context, itemsCount, handlers, className }: ContextPanelProps) {
  const { groups, missing } = useChipGroups(context, handlers);
  const total = countConditions(context);

  return (
    <aside data-testid="chat-context-panel" aria-label="对话条件" className={cn(cardShell, className)}>
      <div className="relative flex items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="font-sans text-[14px] tracking-[0.1em] text-ink">对话条件</h2>
        <span className="font-sans text-[12px] tracking-[0.04em] text-ink-muted">{total} 项</span>
      </div>

      <div className="relative px-4 py-3">
        <ContextBody groups={groups} missing={missing} hasAny={hasContextConditions(context)} />
      </div>

      <div className="relative border-t border-line px-4 py-3">
        <ContextFooter context={context} itemsCount={itemsCount} handlers={handlers} />
      </div>
    </aside>
  );
}

/** 移动端：可折叠的条件面板 */
export function ContextPanelMobile({ context, itemsCount, handlers }: ContextPanelProps) {
  const { regionByCode, foodById, parasiteById, taxonomy } = useAtlas();
  const { groups, missing } = useChipGroups(context, handlers);
  const total = countConditions(context);
  const preparationNames = useMemo(() => new Map(taxonomy.preparations.map((p) => [p.id, p.name])), [taxonomy.preparations]);

  const summaryLabels = [
    ...context.provinceCodes.map((code) => regionByCode.get(code)?.shortName ?? code),
    ...context.months.map((month) => MONTH_LABELS[month - 1] ?? `${month} 月`),
    ...context.foodIds.map((id) => foodById.get(id)?.name ?? id),
    ...context.preparationTags.map((tag) => preparationLabel(tag, preparationNames)),
    ...context.parasiteIds.map((id) => parasiteById.get(id)?.name ?? id),
    ...(context.exposure !== 'unknown' ? [EXPOSURE_LABELS[context.exposure]] : []),
    ...context.symptoms,
  ];
  const summary = summaryLabels.slice(0, 4).join(' · ') + (summaryLabels.length > 4 ? ` 等 ${summaryLabels.length} 项` : '');

  return (
    <div data-testid="chat-context-panel">
      <details className={cn('group', cardShell)}>
        <summary className="relative flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="font-sans text-[13px] tracking-[0.06em] text-ink">
            对话条件 <span className="text-ink-muted">（{total} 项）</span>
          </span>
          <span className="flex min-w-0 items-baseline gap-2 font-sans text-[12px] text-ink-faint">
            <span className="max-w-[12rem] truncate">{summary || '还没有条件'}</span>
            <span className="group-open:hidden">展开</span>
            <span className="hidden group-open:inline">收起</span>
          </span>
        </summary>
        <div className="relative border-t border-line px-4 py-3">
          <ContextBody groups={groups} missing={missing} hasAny={hasContextConditions(context)} />
          <ContextFooter context={context} itemsCount={itemsCount} handlers={handlers} compact />
        </div>
      </details>
    </div>
  );
}
