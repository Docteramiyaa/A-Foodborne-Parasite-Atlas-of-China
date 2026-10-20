import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Compass, MessageSquareText } from 'lucide-react';
import type { RegionDetail } from '@shared/types';
import type { SectionNavItem } from '@/components/ui/SectionNav';
import { ButtonLink } from '@/components/ui/Button';
import { ProvinceMiniMap } from '@/components/map/ChinaMap';
import { ApiError, api } from '@/lib/api';
import { paths } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import {
  ArchiveCard,
  DetailBody,
  DetailSection,
  HeroFact,
  HeroFacts,
  KnowledgeHero,
} from '@/components/knowledge/DetailChrome';
import {
  DetailError,
  DetailLoading,
  FieldSourceList,
  MetaDotList,
  NotFoundDetail,
  RelatedEntityGrid,
  collectSourceIds,
  previewNames,
} from '@/components/knowledge/Shared';
import {
  NeighborLinks,
  RegionMaterialCard,
  RegionSeasonalNotes,
  StudySiteList,
} from '@/components/knowledge/RegionSections';

const NAV_ITEMS: SectionNavItem[] = [
  { id: 'materials', label: '本地资料' },
  { id: 'sites', label: '研究地点' },
  { id: 'season', label: '季节' },
  { id: 'parasites', label: '相关寄生虫' },
  { id: 'foods', label: '相关食物' },
  { id: 'sources', label: '来源' },
];

const REGION_TYPE_LABEL: Record<RegionDetail['type'], string> = {
  province: '省级地区',
  municipality: '直辖市',
  'autonomous-region': '自治区',
  sar: '特别行政区',
  special: '地区',
};

export function RegionPage() {
  const { code } = useParams<{ code: string }>();
  const fetcher = useCallback(() => {
    if (!code) return Promise.reject(new ApiError('缺少地区代码', 404, 'NOT_FOUND'));
    return api.region(code);
  }, [code]);
  const { data, error, loading, reload } = useAsync(fetcher, [code]);

  useDocumentTitle(data ? `${data.shortName}地区资料` : loading ? '地区' : '未找到', data?.tagline);

  if (loading) {
    return (
      <div data-testid="region-detail" className="field-paper">
        <DetailLoading />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div data-testid="region-detail" className="field-paper">
        <NotFoundDetail kindLabel="地区" identifier={code ?? ''} indexTo={paths.regions} indexLabel="返回地区图鉴" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="region-detail" className="field-paper">
        <DetailError
          title="无法加载地区资料"
          message={error?.message}
          onRetry={reload}
          backTo={paths.regions}
          backLabel="返回地区图鉴"
        />
      </div>
    );
  }

  return (
    <div data-testid="region-detail" className="field-paper">
      <RegionDetailView detail={data} />
    </div>
  );
}

function RegionDetailView({ detail }: { detail: RegionDetail }) {
  const entries = detail.entries ?? [];
  const studySites = detail.studySites ?? [];
  const seasonalNotes = detail.seasonalNotes ?? [];
  const parasites = detail.parasites ?? [];
  const foods = detail.foods ?? [];
  const foodCulture = detail.foodCulture ?? [];

  const neighbors = detail.neighbors ?? [];

  const sourcesAll = useMemo(
    () =>
      collectSourceIds(
        detail.sourceIds,
        ...entries.map((entry) => entry.sourceIds),
        ...studySites.map((site) => site.sourceIds),
        ...seasonalNotes.map((note) => note.sourceIds),
      ),
    [detail.sourceIds, entries, studySites, seasonalNotes],
  );

  const aliasText = (detail.aliases ?? []).filter((alias) => alias !== detail.shortName && alias !== detail.name);

  return (
    <>
      <KnowledgeHero
        breadcrumbs={[
          { label: '首页', to: paths.home },
          { label: '图鉴', to: paths.atlas },
          { label: '地区', to: paths.regions },
          { label: detail.shortName },
        ]}
        eyebrow={REGION_TYPE_LABEL[detail.type]}
        title={detail.shortName}
        subtitle={
          <MetaDotList
            items={[
              detail.name !== detail.shortName ? detail.name : null,
              aliasText.length > 0 ? `又称 ${aliasText.slice(0, 3).join('、')}` : null,
            ]}
          />
        }
        tagline={detail.tagline}
        lead={detail.intro}
        facts={
          <HeroFacts>
            <HeroFact
              label="相关寄生虫"
              value={parasites.length > 0 ? previewNames(parasites.map((item) => item.name)) : '未收录'}
            />
            <HeroFact
              label="相关食物"
              value={foods.length > 0 ? previewNames(foods.map((item) => item.name)) : '未收录'}
            />
            <HeroFact
              label="饮食特点"
              value={foodCulture.length > 0 ? previewNames(foodCulture, 2) : '未收录'}
            />
          </HeroFacts>
        }
        actions={
          <>
            <ButtonLink
              to={`/chat?province=${encodeURIComponent(detail.code)}`}
              iconLeft={<MessageSquareText size={15} />}
            >
              带着这个问题提问
            </ButtonLink>
            <ButtonLink
              to={`${paths.explore}?province=${encodeURIComponent(detail.code)}`}
              variant="secondary"
              iconLeft={<Compass size={15} />}
            >
              在探索中查看
            </ButtonLink>
            <ButtonLink to={paths.regions} variant="ghost" size="sm" className="min-h-[40px]" iconRight={<ArrowRight size={13} />}>
              全部地区
            </ButtonLink>
          </>
        }
        aside={
          <div className="space-y-4">
            <ArchiveCard label="位置">
              <div className="mt-1 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.5),transparent_65%)]">
                <ProvinceMiniMap code={detail.code} neighborCodes={neighbors.map((item) => item.code)} height={210} />
              </div>
              <p className="mt-2.5 border-t border-ink/20 pt-2.5 font-kai text-[10px] leading-5 tracking-[0.02em] text-ink-faint">
                深色为本省，浅色为邻近省份。
              </p>
            </ArchiveCard>
            <NeighborLinks neighbors={neighbors} />
          </div>
        }
      />

      <DetailBody navItems={NAV_ITEMS}>
        <DetailSection id="materials" title="本地资料">
          {foodCulture.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 font-kai text-[10px] tracking-[0.12em] text-ink-faint">饮食特点</p>
              <ul className="flex flex-wrap gap-1.5">
                {foodCulture.map((item) => (
                  <li
                    key={item}
                    className="border border-ink/20 bg-paper-light/40 px-2 py-1 font-kai text-[10.5px] leading-5 tracking-[0.02em] text-ink-soft"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {entries.length > 0 ? (
            <div className="space-y-3">
              {entries.map((entry) => (
                <RegionMaterialCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <p className="font-kai text-[13px] text-ink-muted">暂未收录本地资料。</p>
          )}
        </DetailSection>

        <DetailSection id="sites" title="研究地点">
          <StudySiteList sites={studySites} />
        </DetailSection>

        <DetailSection id="season" title="季节">
          <RegionSeasonalNotes notes={seasonalNotes} />
        </DetailSection>

        <DetailSection id="parasites" title="相关寄生虫">
          <RelatedEntityGrid
            items={parasites.map((parasite) => ({
              to: paths.parasite(parasite.id),
              title: parasite.name,
              latin: parasite.latinName,
              subtitle: parasite.tagline,
              category: parasite.categoryLabel,
            }))}
            empty="暂未收录相关寄生虫。"
          />
        </DetailSection>

        <DetailSection id="foods" title="相关食物">
          <RelatedEntityGrid
            items={foods.map((food) => ({
              to: paths.food(food.id),
              title: food.name,
              subtitle: food.tagline,
              category: food.categoryLabel,
            }))}
            empty="暂未收录相关食物。"
          />
        </DetailSection>

        <DetailSection id="sources" title="来源">
          <FieldSourceList sourceIds={sourcesAll} />
        </DetailSection>
      </DetailBody>
    </>
  );
}
