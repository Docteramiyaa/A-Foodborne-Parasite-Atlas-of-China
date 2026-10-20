import { Link } from 'react-router-dom';
import { useAtlas } from '@/lib/atlas';
import { paths } from '@/lib/format';
import { cn } from '@/lib/utils';

/** 回答关联的页面：名称来自 atlas，缺失时以 id 兜底 */
export function RelatedEntities({
  parasiteIds,
  foodIds,
  regionCodes,
  className,
}: {
  parasiteIds?: string[];
  foodIds?: string[];
  regionCodes?: string[];
  className?: string;
}) {
  const { parasiteById, foodById, regionByCode } = useAtlas();
  const parasites = (parasiteIds ?? []).filter(Boolean);
  const foods = (foodIds ?? []).filter(Boolean);
  const regions = (regionCodes ?? []).filter(Boolean);
  if (parasites.length === 0 && foods.length === 0 && regions.length === 0) return null;

  const linkClass =
    'border-b border-line-strong/50 font-sans text-[13px] tracking-[0.03em] text-ink-soft transition hover:border-blue-600 hover:text-blue-700';

  return (
    <div className={cn('', className)} data-testid="chat-related">
      <p className="font-sans text-[12px] tracking-[0.1em] text-ink-faint">相关页面</p>
      <ul className="mt-1.5 space-y-1">
        {parasites.length > 0 && (
          <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex w-[3.4rem] shrink-0 font-sans text-[12px] tracking-[0.06em] text-ink-faint">寄生虫</span>
            {parasites.map((id) => (
              <Link key={id} to={paths.parasite(id)} className={linkClass}>
                {parasiteById.get(id)?.name ?? id}
              </Link>
            ))}
          </li>
        )}
        {foods.length > 0 && (
          <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex w-[3.4rem] shrink-0 font-sans text-[12px] tracking-[0.06em] text-ink-faint">食物</span>
            {foods.map((id) => (
              <Link key={id} to={paths.food(id)} className={linkClass}>
                {foodById.get(id)?.name ?? id}
              </Link>
            ))}
          </li>
        )}
        {regions.length > 0 && (
          <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex w-[3.4rem] shrink-0 font-sans text-[12px] tracking-[0.06em] text-ink-faint">地区</span>
            {regions.map((code) => (
              <Link key={code} to={paths.region(code)} className={linkClass}>
                {regionByCode.get(code)?.name ?? code}
              </Link>
            ))}
          </li>
        )}
      </ul>
    </div>
  );
}
