import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, ExternalLink, Info, RefreshCw } from 'lucide-react';
import type { PreparationTag, RegionSummary, Severity } from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { MONTH_LABELS, SEVERITY_META, formatMonths, paths, preparationLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, ButtonLink } from '@/components/ui/Button';
import { LoadingDots, Skeleton } from '@/components/ui/States';

/* ========================================================================== */
/* 数据边界工具                                                                */
/* ========================================================================== */

export function asIdList(value: readonly string[] | string | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (typeof value === 'string') return value.split(/[\s,，、]+/).filter(Boolean);
  return [];
}

export function compareSourceIds(a: string, b: string): number {
  const na = Number(a.replace(/\D/g, ''));
  const nb = Number(b.replace(/\D/g, ''));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/** 合并、去重并按照来源编号排序（来源区不显示编号，仅用于稳定顺序） */
export function collectSourceIds(...groups: Array<readonly string[] | string | null | undefined>): string[] {
  const all = groups.flatMap((group) => asIdList(group));
  return Array.from(new Set(all)).sort(compareSourceIds);
}

export function formatCoord(geo: readonly [number, number]): string {
  const [lng, lat] = geo;
  return `经度 ${lng.toFixed(3)}° · 纬度 ${lat.toFixed(3)}°`;
}

export function severityRank(severity: Severity | undefined | null): number {
  return severity ? SEVERITY_META[severity]?.rank ?? 0 : 0;
}

/** 名称列表预览：最多展示 limit 项，其余以“等”略去（详情正文仍完整展示） */
export function previewNames(items: readonly string[] | null | undefined, limit = 3): string {
  const list = (items ?? []).filter(Boolean);
  if (list.length === 0) return '';
  const head = list.slice(0, limit).join('、');
  return list.length > limit ? `${head} 等` : head;
}

export interface NearbyRegion {
  code: string;
  name: string;
  distanceKm: number;
}

/** 邻近省份：按地理中心点直线距离计算（仅地理数据） */
export function nearestRegions(
  regions: RegionSummary[],
  center: readonly [number, number],
  excludeCode: string,
  limit = 5,
): NearbyRegion[] {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const distanceKm = (a: readonly [number, number], b: readonly [number, number]) => {
    const radius = 6371;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * radius * Math.asin(Math.min(1, Math.sqrt(h))));
  };
  return regions
    .filter((region) => region.code !== excludeCode && Array.isArray(region.center))
    .map((region) => ({
      code: region.code,
      name: region.shortName || region.name,
      distanceKm: distanceKm(center, region.center),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/* ========================================================================== */
/* 链接与标签                                                                  */
/* ========================================================================== */

export function PreparationTags({
  tags,
  className,
  withIcon = false,
}: {
  tags: readonly PreparationTag[] | null | undefined;
  className?: string;
  withIcon?: boolean;
}) {
  const { taxonomy } = useAtlas();
  const names = new Map<string, string>(taxonomy.preparations.map((item) => [item.id, item.name]));
  if (!tags || tags.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 border border-ink/25 bg-paper-light/40 px-2 py-0.5 font-kai text-[10.5px] leading-4 tracking-[0.03em] text-ink-muted"
        >
          {withIcon && <span className="h-1 w-1 bg-terracotta-600" aria-hidden />}
          {preparationLabel(tag, names)}
        </span>
      ))}
    </span>
  );
}

export function ParasiteLinks({ ids, className, prefix }: { ids: readonly string[] | null | undefined; className?: string; prefix?: ReactNode }) {
  const { parasiteById } = useAtlas();
  const items = asIdList(ids)
    .map((id) => parasiteById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (items.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {prefix && <span className="font-kai text-[10px] tracking-[0.06em] text-ink-faint">{prefix}</span>}
      {items.map((item) => (
        <a
          key={item.id}
          href={paths.parasite(item.id)}
          className="inline-flex items-center gap-1 border border-jade-700/35 bg-jade-50/50 px-2 py-1 font-kai text-[11px] leading-4 tracking-[0.03em] text-jade-900 transition hover:border-jade-700 hover:bg-jade-100/60"
          title={`${item.name}（${item.latinName}）`}
        >
          {item.name}
        </a>
      ))}
    </span>
  );
}

export function FoodLinks({ ids, className, prefix }: { ids: readonly string[] | null | undefined; className?: string; prefix?: ReactNode }) {
  const { foodById } = useAtlas();
  const items = asIdList(ids)
    .map((id) => foodById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (items.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {prefix && <span className="font-kai text-[10px] tracking-[0.06em] text-ink-faint">{prefix}</span>}
      {items.map((item) => (
        <a
          key={item.id}
          href={paths.food(item.id)}
          className="inline-flex items-center gap-1 border border-ink/25 bg-paper-light/50 px-2 py-1 font-kai text-[11px] leading-4 tracking-[0.03em] text-ink-soft transition hover:border-ink/60 hover:text-ink"
        >
          {item.name}
        </a>
      ))}
    </span>
  );
}

/** Hero 副标题的信息行（以 · 分隔，自动省略空项） */
export function MetaDotList({ items, className }: { items: Array<ReactNode>; className?: string }) {  const parts = items.filter((item) => item !== null && item !== undefined && item !== false && item !== '');
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-kai tracking-[0.04em]', className)}>
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 && (
            <span className="text-ink-faint" aria-hidden>
              ·
            </span>
          )}
          <span>{part}</span>
        </span>
      ))}
    </span>
  );
}

/* ========================================================================== */
/* 月份与说明盒子                                                              */
/* ========================================================================== */

export function MonthStrip({
  months,
  className,
  caption = true,
}: {
  months: readonly number[] | null | undefined;
  className?: string;
  caption?: boolean;
}) {
  const list = (months ?? []).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  const active = new Set(list);
  return (
    <div className={className}>
      <ol className="grid grid-cols-12 border border-ink/25" aria-label="月份分布">
        {MONTH_LABELS.map((label, index) => {
          const month = index + 1;
          const isActive = active.has(month);
          return (
            <li
              key={month}
              title={isActive ? `${label}：文献记载的季节高峰` : label}
              className={cn(
                'flex h-8 items-center justify-center border-r border-ink/15 font-mono text-[10px] tabular-nums transition-colors last:border-r-0',
                isActive ? 'bg-terracotta-700 font-semibold text-paper-light' : 'bg-paper-light/40 text-ink-faint',
              )}
            >
              {month}
            </li>
          );
        })}
      </ol>
      {caption && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-kai text-[10.5px] tracking-[0.03em] text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 bg-terracotta-700" aria-hidden />
            {list.length > 0 ? `文献记载高峰：${formatMonths(list)}` : '文献未给出明确月份'}
          </span>
          <span>未标记者不代表无风险</span>
        </p>
      )}
    </div>
  );
}

type NoteTone = 'info' | 'caution' | 'warning' | 'neutral';

const NOTE_TONES: Record<NoteTone, { rule: string; icon: string }> = {
  info: { rule: 'border-l-jade-700', icon: 'text-jade-700' },
  caution: { rule: 'border-l-terracotta-700', icon: 'text-terracotta-700' },
  warning: { rule: 'border-l-ochre-500', icon: 'text-ochre-600' },
  neutral: { rule: 'border-l-ink/40', icon: 'text-ink-muted' },
};

export function NoteBox({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: NoteTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const toneMeta = NOTE_TONES[tone];
  return (
    <div className={cn('flex items-start gap-3 border border-ink/20 border-l-2 bg-paper-light/45 px-4 py-3.5', toneMeta.rule, className)}>
      <span className={cn('mt-0.5 shrink-0', toneMeta.icon)} aria-hidden>
        <Info size={14} />
      </span>
      <div className="min-w-0 font-kai text-[12.5px] leading-6 tracking-[0.02em] text-ink-soft">
        {title && <p className="mb-1 font-serif text-[13.5px] font-semibold text-ink">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function FinePrint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-kai text-[10.5px] leading-5 tracking-[0.03em] text-ink-faint', className)}>{children}</p>;
}

/* ========================================================================== */
/* 折叠说明（外部图片资料）                                                      */
/* ========================================================================== */

export function FieldDisclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={cn('group border border-ink/25 bg-paper-light/40', className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2.5 font-kai text-[12.5px] tracking-[0.05em] text-ink">{title}</span>
        <span className="hidden shrink-0 font-kai text-[10px] tracking-[0.04em] text-ink-faint sm:block">{summary}</span>
        <ChevronDown size={15} className="shrink-0 text-ink-muted transition-transform duration-300 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-ink/20 px-4 pb-4 pt-3.5 font-kai text-[12.5px] leading-6 tracking-[0.02em] text-ink-soft">
        {children}
      </div>
    </details>
  );
}

/* ========================================================================== */
/* 外部链接                                                                    */
/* ========================================================================== */

export function ExternalLinks({
  links,
  className,
}: {
  links: readonly { label: string; url: string }[] | null | undefined;
  className?: string;
}) {
  if (!links || links.length === 0) return null;
  return (
    <ul className={cn('space-y-2', className)}>
      {links.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-start gap-1.5 border-b border-ink/30 pb-0.5 font-kai text-[11.5px] leading-5 tracking-[0.02em] text-ink-soft transition hover:border-terracotta-700 hover:text-terracotta-700"
          >
            <ExternalLink size={11} className="mt-1 shrink-0" aria-hidden />
            <span>{link.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ========================================================================== */
/* 相关条目（无等级、数量等内部指标）                                            */
/* ========================================================================== */

export interface RelatedEntityItem {
  to: string;
  title: string;
  latin?: string;
  subtitle?: string;
  category?: string;
}

export function RelatedEntityGrid({
  items,
  empty,
  className,
}: {
  items: readonly RelatedEntityItem[];
  empty?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="font-kai text-[13px] text-ink-muted">{empty ?? '暂未收录相关条目。'}</p>;
  }
  return (
    <ul className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {items.map((item) => (
        <li key={item.to}>
          <Link
            to={item.to}
            className="group flex h-full flex-col border border-ink/25 bg-paper-light/45 p-4 transition hover:border-ink/50 hover:bg-paper-light/70"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {item.category && <p className="font-kai text-[9.5px] tracking-[0.1em] text-ink-faint">{item.category}</p>}
                <p className="mt-1 font-serif text-[15px] font-semibold leading-snug tracking-[0.01em] text-ink transition group-hover:text-terracotta-700">
                  {item.title}
                </p>
                {item.latin && <p className="mt-0.5 font-serif text-[11px] italic leading-5 text-ink-faint">{item.latin}</p>}
              </div>
              <ArrowUpRight size={13} className="mt-0.5 shrink-0 text-ink-faint transition group-hover:text-terracotta-700" aria-hidden />
            </div>
            {item.subtitle && (
              <p className="mt-2.5 line-clamp-2 font-kai text-[11.5px] leading-5 tracking-[0.02em] text-ink-muted">{item.subtitle}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ========================================================================== */
/* 来源清单                                                                    */
/* ========================================================================== */

/**
 * 来源清单：题名、作者、年份、出处与可访问原文。
 * 不链接到站内来源详情页；没有 URL 的来源不提供伪造链接。
 */
export function FieldSourceList({ sourceIds, className }: { sourceIds: string[]; className?: string }) {
  const { sourceById } = useAtlas();
  const sources = sourceIds
    .map((id) => sourceById.get(id))
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
  if (sources.length === 0) {
    return <p className="font-kai text-sm text-ink-muted">暂无来源。</p>;
  }
  return (
    <ol className={cn('', className)}>
      {sources.map((source) => (
        <li key={source.id} className="border-b border-ink/20 py-3.5 last:border-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-serif text-[14px] leading-6 text-ink">{source.title}</p>
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-0.5 border-b border-ink/30 font-kai text-[10.5px] leading-4 text-ink-soft transition hover:border-terracotta-700 hover:text-terracotta-700"
              >
                原文 <ExternalLink size={10} aria-hidden />
              </a>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-kai text-[10.5px] leading-5 tracking-[0.02em] text-ink-muted">
            {source.authors && <span>{source.authors}</span>}
            {source.year && <span>{source.year}</span>}
            {source.venue && <span>{source.venue}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ========================================================================== */
/* 状态页（loading / 404 / error）                                              */
/* ========================================================================== */

export function DetailLoading({ label = '正在加载' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="border-b border-ink/25">
        <div className="mx-auto max-w-shell px-5 py-12 md:px-8 md:py-16">
          <Skeleton className="h-3 w-56 rounded-none" />
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <Skeleton className="h-3 w-24 rounded-none" />
              <Skeleton className="mt-5 h-12 w-72 max-w-full rounded-none" />
              <Skeleton className="mt-3 h-5 w-52 rounded-none" />
              <Skeleton className="mt-7 h-4 w-full max-w-2xl rounded-none" />
              <Skeleton className="mt-2.5 h-3 w-11/12 max-w-2xl rounded-none" />
              <Skeleton className="mt-2.5 h-3 w-4/5 max-w-2xl rounded-none" />
              <div className="mt-8 flex gap-3">
                <Skeleton className="h-11 w-36 rounded-none" />
                <Skeleton className="h-11 w-32 rounded-none" />
              </div>
            </div>
            <Skeleton className="h-72 w-full rounded-none" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-shell px-5 py-12 md:px-8">
        <LoadingDots label={label} />
      </div>
    </div>
  );
}

export function NotFoundDetail({
  kindLabel,
  identifier,
  indexTo,
  indexLabel,
}: {
  kindLabel: string;
  identifier: string;
  indexTo: string;
  indexLabel: string;
}) {
  return (
    <div className="mx-auto max-w-shell px-5 py-16 md:px-8 md:py-24">
      <div className="max-w-2xl border-l-2 border-terracotta-700 pl-6 md:pl-8">
        <p className="field-label text-[11px]">{kindLabel}不存在</p>
        <h1 className="mt-4 font-serif text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.2] tracking-[0.02em] text-ink">
          没有找到这份资料。
        </h1>
        <p className="mt-4 font-kai text-[14px] leading-7 tracking-[0.02em] text-ink-muted">
          编号「{identifier}」没有对应的{kindLabel}，可能尚未收录或链接已失效。
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink to={indexTo}>{indexLabel}</ButtonLink>
          <ButtonLink to={paths.explore} variant="secondary">
            去探索
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

export function DetailError({
  title,
  message,
  onRetry,
  backTo,
  backLabel,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
  backTo: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto max-w-shell px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-xl border border-ink/25 bg-paper-light/40 p-6 md:p-8">
        <h2 className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-semibold text-ink">{title}</h2>
        {message && <p className="mt-3 font-kai text-[13px] leading-7 text-ink-muted">{message}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} iconLeft={<RefreshCw size={14} />}>
              重新加载
            </Button>
          )}
          <ButtonLink to={backTo} variant="ghost" size="sm">
            {backLabel}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
