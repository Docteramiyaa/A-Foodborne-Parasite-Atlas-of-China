import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  AtlasPayload,
  ExploreBriefing,
  ExplorePreparationOption,
  FoodDetail,
  PreparationTag,
  RegionDetail,
  SeasonId,
} from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { api, type ExploreParams } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import {
  EMPTY_QUERY_CONTEXT,
  parseQueryContext,
  seasonsFromMonths,
  serializeExploreContext,
  type QueryContext,
} from '@/lib/query-context';
import { PREPARATION_FALLBACK } from '@/lib/format';
import { ROUTES } from '@/lib/site-nav';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { AccentDots } from '@/components/ui/AccentDots';
import { ErrorState, PageLoading } from '@/components/ui/States';
import { Conditions, ProvincePicker } from '@/components/explore/Conditions';
import { BriefingView } from '@/components/explore/BriefingView';
import { useDebouncedValue } from '@/components/explore/useDebouncedValue';
import {
  MAP_CATEGORY_LABEL,
  ExploreMap,
  SMALL_PROVINCES,
  mapEvidenceCategory,
  type MapEvidenceCategory,
} from '@/components/map/ExploreMap';
import { cn } from '@/lib/utils';

const MAP_CATEGORY_STYLE: Record<MapEvidenceCategory, string> = {
  local: 'bg-blue-200',
  limited: 'bg-[#E2EBF5]',
  none: 'bg-[#F4F6FA]',
};

const GENERIC_PREP_TAGS: PreparationTag[] = ['raw', 'undercooked', 'cured-smoked', 'grilled', 'fully-cooked'];

interface ExploreSelection {
  provinceCode: string | null;
  season: SeasonId | null;
  foodId: string | null;
  preparationTag: PreparationTag | null;
}

function normalizeSelection(
  context: QueryContext,
  regions: { code: string }[],
  foods: { id: string }[],
): ExploreSelection {
  const provinceCode = context.provinceCodes.find((code) => regions.some((region) => region.code === code)) ?? null;
  const season = context.seasons[0] ?? seasonsFromMonths(context.months)[0] ?? null;
  const foodId = context.foodIds.find((id) => foods.some((food) => food.id === id)) ?? null;
  const preparationTag = context.preparationTags[0] ?? null;
  return { provinceCode, season, foodId, preparationTag };
}

function selectionToContext(selection: ExploreSelection): QueryContext {
  return {
    ...EMPTY_QUERY_CONTEXT,
    provinceCodes: selection.provinceCode ? [selection.provinceCode] : [],
    seasons: selection.season ? [selection.season] : [],
    foodIds: selection.foodId ? [selection.foodId] : [],
    preparationTags: selection.preparationTag ? [selection.preparationTag] : [],
  };
}

function selectionToParams(selection: ExploreSelection): ExploreParams {
  const params: ExploreParams = {};
  if (selection.provinceCode) params.province = [selection.provinceCode];
  if (selection.season) params.season = [selection.season];
  if (selection.foodId) params.food = [selection.foodId];
  if (selection.preparationTag) params.prep = [selection.preparationTag];
  return params;
}

function foodPreparationOptions(foodDetail: FoodDetail | null): ExplorePreparationOption[] {
  if (!foodDetail) return [];
  return foodDetail.preparations.map((prep) => ({
    tag: prep.tag,
    label: prep.label,
    risk: prep.risk,
    parasiteIds: prep.parasiteIds,
    explanation: prep.explanation,
    saferAlternative: prep.saferAlternative,
    sourceIds: prep.sourceIds,
  }));
}

function genericPreparationOptions(
  taxonomy: ReturnType<typeof useAtlas>['taxonomy'],
): ExplorePreparationOption[] {
  return GENERIC_PREP_TAGS.map((tag) => {
    const meta = taxonomy.preparations.find((item) => item.id === tag);
    return {
      tag,
      label: meta?.name ?? PREPARATION_FALLBACK[tag]?.name ?? tag,
      risk: (meta?.riskTendency ?? 'unknown') as ExplorePreparationOption['risk'],
      parasiteIds: [],
      explanation: meta?.description ?? PREPARATION_FALLBACK[tag]?.description ?? '',
      sourceIds: [],
    };
  });
}

/**
 * 探索页：一套条件 + 一份连贯结果。
 * URL 是条件的唯一来源；地区/季节/食物/做法可以单独或组合选择。
 */
export function ExplorePage() {
  useDocumentTitle(
    '探索',
    '按地区、季节、食物和处理方式，查看当前需要留意的食源性寄生虫风险，以及哪些做法已经足够。',
  );

  const { regions, foods, parasites, sources, taxonomy, meta, loading, error, reload } = useAtlas();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  const parsedContext = useMemo(() => parseQueryContext(searchParams), [searchParams]);
  const selection = useMemo(
    () => normalizeSelection(parsedContext, regions, foods),
    [parsedContext, regions, foods],
  );

  const atlasPayload = useMemo<AtlasPayload | null>(() => {
    if (!meta) return null;
    return { meta, taxonomy, parasites, foods, regions, sources };
  }, [meta, taxonomy, parasites, foods, regions, sources]);

  /* URL 规范化：旧 month/q 折算为季节，多余条件收敛为单选 */
  useEffect(() => {
    if (regions.length === 0 || foods.length === 0) return;
    const canonical = serializeExploreContext(selectionToContext(selection));
    if (searchParams.toString() !== canonical.toString()) {
      setSearchParams(canonical, { replace: true });
    }
  }, [selection, regions.length, foods.length, searchParams, setSearchParams]);

  const writeSelection = useCallback(
    (patch: Partial<ExploreSelection>) => {
      const next = { ...selection, ...patch };
      setSearchParams(serializeExploreContext(selectionToContext(next)), { replace: true });
    },
    [selection, setSearchParams],
  );

  /* 食物 / 地区详情：真实接口和本地占位都依赖它们 */
  const foodDetailState = useAsync<FoodDetail | null>(
    () => (selection.foodId ? api.food(selection.foodId) : Promise.resolve(null)),
    [selection.foodId],
  );
  const regionDetailState = useAsync<RegionDetail | null>(
    () => (selection.provinceCode ? api.region(selection.provinceCode) : Promise.resolve(null)),
    [selection.provinceCode],
  );

  /* 旧链接或手动改 URL 带来的“不适用于该食物”的做法：食物选项加载后清掉 */
  useEffect(() => {
    if (!selection.foodId || !selection.preparationTag || !foodDetailState.data) return;
    const valid = foodDetailState.data.preparations.some((prep) => prep.tag === selection.preparationTag);
    if (!valid) writeSelection({ preparationTag: null });
  }, [selection.foodId, selection.preparationTag, foodDetailState.data, writeSelection]);

  const params = useMemo(() => selectionToParams(selection), [selection]);
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const debouncedParamsKey = useDebouncedValue(paramsKey, 200);
  const currentParams = useMemo(() => JSON.parse(debouncedParamsKey) as ExploreParams, [debouncedParamsKey]);

  const [briefing, setBriefing] = useState<ExploreBriefing | null>(null);
  const [briefingKey, setBriefingKey] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!atlasPayload) return;
    const key = debouncedParamsKey;
    const query = currentParams;
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    let cancelled = false;
    setBriefingLoading(true);
    setBriefingError(null);

    api
      .exploreBriefing(query)
      .then((result) => {
        if (cancelled || seq !== requestSeqRef.current) return;
        setBriefing(result);
        setBriefingKey(key);
        setBriefingLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled || seq !== requestSeqRef.current) return;
        setBriefing(null);
        setBriefingKey(key);
        setBriefingError(error instanceof Error ? error.message : '暂时无法读取结果，请稍后再试。');
        setBriefingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [atlasPayload, debouncedParamsKey, currentParams]);

  const isStale = briefingKey !== paramsKey;
  const displayBriefing = isStale ? null : briefing;
  const activePreparationOptions: ExplorePreparationOption[] = selection.foodId
    ? foodPreparationOptions(foodDetailState.data)
    : genericPreparationOptions(taxonomy);
  const preparationOptionsLoading = Boolean(selection.foodId) && foodDetailState.loading && activePreparationOptions.length === 0;

  const selectedRegion = selection.provinceCode
    ? regions.find((region) => region.code === selection.provinceCode) ?? null
    : null;

  const hasAnyCondition = Boolean(
    selection.provinceCode || selection.season || selection.foodId || selection.preparationTag,
  );

  const groupedSmallProvinces = useMemo(
    () =>
      SMALL_PROVINCES.map((small) => {
        const region = regions.find((item) => item.code === small.code);
        return {
          ...small,
          category: region ? mapEvidenceCategory(region) : ('none' as MapEvidenceCategory),
        };
      }),
    [regions],
  );

  return (
    <div data-testid="explore-page" className="field-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto w-full max-w-shell px-5 pb-4 pt-4 md:px-8 md:pt-5">
          <Breadcrumbs items={[{ label: '首页', to: ROUTES.home }, { label: '探索' }]} />
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
            <div>
              <h1 className="font-serif text-[1.9rem] font-semibold leading-none tracking-tight text-ink md:text-[2.1rem]">
                探索
              </h1>
              <p className="mt-2 max-w-2xl font-sans text-[14px] leading-6 tracking-[0.02em] text-ink-soft">
                选定地区、季节、食物和做法，看看当前需要留意什么，以及哪些做法已经足够。
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-shell px-5 py-4 md:px-8 md:py-5">
        {error && !loading ? (
          <ErrorState
            title="探索数据暂不可用"
            message="未能读取地区与食物数据。请稍后重试，或确认知识服务是否正常。"
            onRetry={reload}
          />
        ) : loading && !atlasPayload ? (
          <PageLoading label="正在准备地区与食物资料" />
        ) : (
          <>
            <Conditions
              provinceName={selectedRegion?.shortName ?? null}
              season={selection.season}
              foodId={selection.foodId}
              preparationTag={selection.preparationTag}
              preparationOptions={activePreparationOptions}
              preparationOptionsLoading={preparationOptionsLoading}
              onOpenProvince={() => setPickerOpen(true)}
              onSeasonChange={(season) => writeSelection({ season })}
              onFoodChange={(foodId) => writeSelection({ foodId })}
              onPreparationChange={(tag) => writeSelection({ preparationTag: tag })}
              onClear={() => setSearchParams(new URLSearchParams(), { replace: true })}
              hasAny={hasAnyCondition}
            />

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              {/* ---------------- 地图 ---------------- */}
              <section
                data-testid="explore-map"
                aria-label="地图选省"
                className="atlas-panel overflow-hidden lg:sticky lg:top-24"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-blue-700 px-5 py-4">
                  <h2 className="inline-flex items-center gap-2 text-base font-semibold text-white">
                    在图上选一个省份
                    <AccentDots />
                  </h2>
                  <span className="text-xs text-blue-100">
                    {selectedRegion ? `已选：${selectedRegion.shortName}` : '也可以直接按省份定位'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line/45 px-4 py-2" aria-label="小省份固定索引">
                  <span className="font-sans text-[12px] tracking-[0.08em] text-ink-faint">小省份</span>
                  {groupedSmallProvinces.map((small) => {
                    const active = small.code === selection.provinceCode;
                    return (
                      <button
                        key={small.code}
                        type="button"
                        onClick={() => writeSelection({ provinceCode: small.code })}
                        title={MAP_CATEGORY_LABEL[small.category]}
                        className={cn(
                          'inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 py-1 font-sans text-[12px] transition',
                          active
                            ? 'border-blue-700 bg-blue-700 text-white'
                            : 'border-line bg-white text-ink-muted hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700',
                        )}
                      >
                        <span className={cn('flex h-3.5 w-3.5 items-center justify-center text-[8.5px]', active ? 'text-paper-light' : 'text-ink-faint')}>
                          {small.number}
                        </span>
                        {small.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="ml-auto inline-flex items-center border-b border-line pb-px font-sans text-[12px] text-ink-soft transition hover:border-blue-700 hover:text-blue-700"
                  >
                    按省份定位 →
                  </button>
                </div>

                <div className="bg-blue-50/60 px-2 pt-2">
                  <ExploreMap
                    selectedCode={selection.provinceCode}
                    onSelect={(code) => writeSelection({ provinceCode: code })}
                    className="h-[340px] w-full sm:h-[420px] lg:h-[460px]"
                  />
                </div>

                <div className="space-y-2 px-4 pb-3 pt-1">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/45 pt-2">
                    {(Object.keys(MAP_CATEGORY_LABEL) as MapEvidenceCategory[]).map((category) => (
                      <span key={category} className="inline-flex items-center gap-1.5 font-sans text-[12px] text-ink-muted">
                        <span className={cn('inline-block h-2.5 w-2.5 border border-ink/15', MAP_CATEGORY_STYLE[category])} aria-hidden />
                        {MAP_CATEGORY_LABEL[category]}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5 font-sans text-[12px] text-ink-muted">
                      <span className="inline-block h-2.5 w-2.5 border border-ink/15 bg-blue-700" aria-hidden />
                      当前选中
                    </span>
                  </div>

                  <p className="font-sans text-[12px] leading-4 text-ink-faint">
                    滚轮缩放、拖拽平移；选中省份后可点“定位”放大。
                  </p>
                </div>
              </section>

              {/* ---------------- 结果 ---------------- */}
              <section
                data-testid="explore-result"
                aria-label="结果"
                className="atlas-panel px-5 py-6 md:px-7 md:py-7"
              >
                {briefingError ? (
                  <div role="alert" className="border-l-2 border-terracotta-700 pl-3">
                    <p className="font-serif text-base font-semibold text-ink">暂时无法读取结果</p>
                    <p className="mt-1.5 font-sans text-[14px] leading-6 text-ink-muted">{briefingError}</p>
                    <p className="mt-2 font-sans text-[13px] text-ink-faint">请稍后重试，或先调整一个条件。</p>
                  </div>
                ) : displayBriefing ? (
                  <>
                    <BriefingView briefing={displayBriefing} />
                    {briefingLoading && (
                      <p className="mt-3 font-sans text-[12px] text-ink-faint" role="status">
                        正在更新结果…
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-3" role="status" aria-live="polite">
                    <div className="h-4 w-1/3 animate-pulse bg-paper-deep/70" />
                    <div className="h-7 w-2/3 animate-pulse bg-paper-deep/60" />
                    <div className="h-24 w-full animate-pulse bg-paper-deep/40" />
                    <p className="font-sans text-[13px] text-ink-faint">正在整理当前结果…</p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <ProvincePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        regions={regions}
        selectedCode={selection.provinceCode}
        onSelect={(code) => writeSelection({ provinceCode: code })}
      />
    </div>
  );
}


