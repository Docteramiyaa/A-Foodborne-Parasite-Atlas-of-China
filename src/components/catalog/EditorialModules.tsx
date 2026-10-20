import { Link } from 'react-router-dom';
import type { FoodSummary, ParasiteSummary, RegionSummary } from '@shared/types';
import { paths } from '@/lib/format';
import { FieldTag } from './FieldNotes';

/* ------------------------------------------------------------------ */
/* 目录单元：独立入口卡片                        */
/* ------------------------------------------------------------------ */

const MODULE_SHELL =
  'atlas-catalog-card group flex h-full flex-col';

function ModuleHeader({ category }: { category: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <FieldTag>{category}</FieldTag>
      <span
        aria-hidden
        className="font-serif text-[15px] leading-none text-blue-700 transition-transform duration-300 group-hover:translate-x-0.5"
      >
        →
      </span>
    </div>
  );
}

/**
 * 地区简介：优先使用正文式的 tagline / intro（字段补充后自动生效）；
 * 暂缺时退回知识库摘要，并跳过带免责/证据边界说明的句子，保持目录可读。
 */
const REGION_SUMMARY_BOUNDARY =
  /资料有限|资料不足|不等于|不能直接|不能外推|不能代表|不能等同|不能简单|不能据此|个体风险|本知识库未|未单列|未收录|不能比较|不能加总|不作为|上述资料均/;

/** 把证据摘要收敛成一句地区知识；数据补齐 tagline / intro 后直接使用新字段。 */
export function regionDescription(region: RegionSummary): string {
  const extra = region as RegionSummary & { tagline?: string; intro?: string };
  if (extra.tagline) return extra.tagline;
  if (extra.intro) return extra.intro;

  const clauses = region.evidenceSummary
    .split(/[，；。]/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const clause of clauses) {
    if (REGION_SUMMARY_BOUNDARY.test(clause) || /^但/.test(clause)) continue;
    const softened = clause
      .replace(/同时属于文献所述的/g, '同时属于')
      .replace(/属于文献所述的/g, '属于')
      .replace(/属于文献所述/g, '属于')
      .replace(/文献所述的/g, '')
      .replace(/文献所列的/g, '')
      .replace(/文献记载的/g, '')
      .replace(/文献明确/g, '');
    if (softened.length >= 4) kept.push(softened);
    if (kept.join('，').length >= 65) break;
  }
  return kept.length > 0 ? `${kept.slice(0, 2).join('，')}。` : region.evidenceSummary;
}

/* ------------------------------------------------------------------ */
/* 寄生虫                                                              */
/* ------------------------------------------------------------------ */

export function ParasiteGridModule({ parasite }: { parasite: ParasiteSummary }) {
  return (
    <Link
      to={paths.parasite(parasite.id)}
      aria-label={`查看寄生虫：${parasite.name}`}
      data-testid="parasite-module"
      className={MODULE_SHELL}
    >
      <ModuleHeader category={parasite.categoryLabel} />
      <h3 className="mt-3 font-serif text-[21px] font-semibold leading-tight tracking-[0.01em] text-ink transition-colors group-hover:text-blue-800">
        {parasite.name}
      </h3>
      <p className="mt-1 font-serif text-[12px] italic tracking-[0.05em] text-ink-faint">{parasite.latinName}</p>
      <p className="mt-2.5 line-clamp-3 flex-1 font-sans text-[14px] leading-6 text-ink-muted">{parasite.tagline}</p>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* 食物                                                                */
/* ------------------------------------------------------------------ */

export function FoodGridModule({ food }: { food: FoodSummary }) {
  return (
    <Link
      to={paths.food(food.id)}
      aria-label={`查看食物：${food.name}`}
      data-testid="food-module"
      className={MODULE_SHELL}
    >
      <ModuleHeader category={food.categoryLabel} />
      <h3 className="mt-3 font-serif text-[21px] font-semibold leading-tight tracking-[0.01em] text-ink transition-colors group-hover:text-blue-800">
        {food.name}
      </h3>
      <p className="mt-2.5 line-clamp-3 flex-1 font-sans text-[14px] leading-6 text-ink-muted">{food.tagline}</p>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* 地区                                                                */
/* ------------------------------------------------------------------ */

export function RegionGridModule({ region }: { region: RegionSummary }) {
  return (
    <Link
      to={paths.region(region.code)}
      aria-label={`查看地区：${region.name}`}
      data-testid="region-module"
      className={MODULE_SHELL}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-[12px] tracking-[0.04em] text-ink-muted">{region.name}</span>
        <span
          aria-hidden
          className="font-serif text-[15px] leading-none text-blue-700 transition-transform duration-300 group-hover:translate-x-0.5"
        >
          →
        </span>
      </div>
      <h3 className="mt-2.5 font-serif text-[21px] font-semibold leading-tight tracking-[0.01em] text-ink transition-colors group-hover:text-blue-800">
        {region.shortName}
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 font-sans text-[14px] leading-6 text-ink-muted">
        {regionDescription(region)}
      </p>
    </Link>
  );
}
