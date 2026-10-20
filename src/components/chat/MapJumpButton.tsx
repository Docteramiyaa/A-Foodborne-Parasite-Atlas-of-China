import type { ChatAnswer, PreparationTag } from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { MONTH_LABELS, preparationLabel } from '@/lib/format';
import { buildMapHref, isEmptyQueryContext, seasonsFromMonths, type QueryContext } from '@/lib/query-context';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type MapQuery = NonNullable<ChatAnswer['mapQuery']>;

function uniqueStrings(values: string[] | undefined | null): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function normalizeMonths(values: number[] | undefined | null): number[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values.filter(
        (month): month is number => typeof month === 'number' && Number.isInteger(month) && month >= 1 && month <= 12,
      ),
    ),
  ).sort((a, b) => a - b);
}

/** 把回答中的条件转成跨页面共享的 QueryContext（保留全部条件，q 为空） */
function toQueryContext(query: MapQuery): QueryContext {
  const months = normalizeMonths(query.months);
  return {
    provinceCodes: uniqueStrings(query.provinceCodes),
    seasons: seasonsFromMonths(months),
    months,
    foodIds: uniqueStrings(query.foodIds),
    preparationTags: uniqueStrings(query.preparationTags) as PreparationTag[],
    parasiteIds: uniqueStrings(query.parasiteIds),
    q: '',
  };
}

/** 带着回答里的条件进入探索 */
export function MapJumpButton({ query, className }: { query: MapQuery | null | undefined; className?: string }) {
  const { regionByCode, foodById, parasiteById, taxonomy } = useAtlas();

  if (!query) return null;
  const context = toQueryContext(query);
  if (isEmptyQueryContext(context)) return null;

  const preparationNames = new Map(taxonomy.preparations.map((preparation) => [preparation.id, preparation.name]));
  const conditions: string[] = [];
  if (context.provinceCodes.length > 0) {
    conditions.push(`地区：${context.provinceCodes.map((code) => regionByCode.get(code)?.name ?? code).join('、')}`);
  }
  if (context.months.length > 0) {
    conditions.push(`月份：${context.months.map((month) => MONTH_LABELS[month - 1] ?? `${month} 月`).join('、')}`);
  }
  if (context.foodIds.length > 0) {
    conditions.push(`食物：${context.foodIds.map((id) => foodById.get(id)?.name ?? id).join('、')}`);
  }
  if (context.preparationTags.length > 0) {
    conditions.push(
      `处理方式：${context.preparationTags.map((tag) => preparationLabel(tag, preparationNames)).join('、')}`,
    );
  }
  if (context.parasiteIds.length > 0) {
    conditions.push(`寄生虫：${context.parasiteIds.map((id) => parasiteById.get(id)?.name ?? id).join('、')}`);
  }

  const href = buildMapHref(context);

  return (
    <div className={cn('mt-4', className)} data-testid="chat-jump-actions">
      <ButtonLink
        to={href}
        variant="secondary"
        size="sm"
        data-testid="chat-map-jump"
        className="!font-kai !tracking-[0.06em]"
      >
        在探索中查看
      </ButtonLink>
      {conditions.length > 0 && (
        <p className="mt-1.5 font-kai text-[10.5px] leading-5 tracking-[0.02em] text-ink-muted">{conditions.join(' · ')}</p>
      )}
    </div>
  );
}
