import { useId, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* 搜索框                                                              */
/* ------------------------------------------------------------------ */

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Search
        size={14}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
      />
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="atlas-input h-12 !pl-9 !pr-9 hover:border-blue-700 [&::-webkit-search-cancel-button]:hidden"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="清除搜索关键词"
          className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center border border-transparent text-ink-muted transition hover:border-line hover:text-ink"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 筛选分组与筛选 chip                                                  */
/* ------------------------------------------------------------------ */

export function FilterGroup({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('min-w-0', className)}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="field-label text-[12px]">{label}</span>
        {hint && <span className="font-sans text-[12px] text-ink-faint">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** 带计数的筛选 chip（计数只说明资料量，不代表风险） */
export function FilterChip({
  active,
  onClick,
  count,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-2 font-sans text-[14px] leading-none tracking-[0.03em] transition duration-200',
        active
          ? 'border-blue-700 bg-blue-700 text-white'
          : 'border-line-strong bg-white text-ink-soft hover:border-blue-700 hover:bg-blue-50 hover:text-blue-700',
        className,
      )}
    >
      {children}
      {typeof count === 'number' && (
        <span
          className={cn(
            'font-mono text-xs leading-4 tabular-nums',
            active ? 'text-paper/70' : 'text-ink-faint',
          )}
          aria-hidden
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 已选筛选                                                            */
/* ------------------------------------------------------------------ */

export interface ActiveFilterItem {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({
  items,
  onClear,
  className,
}: {
  items: ActiveFilterItem[];
  onClear?: () => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="field-label text-[12px]">已选条件</span>
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-blue-50 px-2 py-0.5 font-sans text-[12px] text-ink-soft"
        >
          {item.label}
          <button
            type="button"
            onClick={item.onRemove}
            aria-label={`移除筛选：${item.label}`}
            className="-mr-0.5 inline-flex h-4 w-4 items-center justify-center text-ink-faint transition hover:text-blue-700"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 border-b border-line pb-0.5 font-sans text-[12px] text-ink-muted transition hover:border-blue-600 hover:text-blue-700"
        >
          清除全部
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 结果计数                                                            */
/* ------------------------------------------------------------------ */

export function ResultSummary({
  shown,
  total,
  unit,
  className,
}: {
  shown: number;
  total: number;
  unit: string;
  className?: string;
}) {
  const filtered = shown !== total;
  return (
    <p className={cn('font-sans text-[12px] tracking-[0.04em] text-ink-muted', className)} aria-live="polite">
      共 <span className="font-serif text-[14px] text-blue-700">{shown}</span> {unit}
      {filtered && <span className="text-ink-faint">（全部 {total}）</span>}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* 移动端可折叠的筛选面板                                                */
/* ------------------------------------------------------------------ */

export function FilterPanel({
  id,
  summary,
  activeCount,
  children,
  className,
}: {
  id: string;
  summary?: ReactNode;
  activeCount: number;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={id}
          className="inline-flex h-9 items-center gap-1.5 border border-line bg-paper-light/60 px-3.5 font-sans text-[14px] tracking-[0.04em] text-ink-soft transition hover:border-ink/60 hover:text-ink"
        >
          <SlidersHorizontal size={13} aria-hidden />
          {open ? '收起筛选' : '筛选'}
          {activeCount > 0 && (
            <span className="font-mono text-xs text-blue-700">{activeCount}</span>
          )}
        </button>
        {summary && <span className="font-sans text-[12px] text-ink-faint">{summary}</span>}
      </div>
      <div id={id} className={cn('mt-4 lg:mt-0', !open && 'hidden lg:block')}>
        {children}
      </div>
    </div>
  );
}
