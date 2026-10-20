import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Compass, MessageSquareText } from 'lucide-react';
import type { FoodDetail } from '@shared/types';
import type { SectionNavItem } from '@/components/ui/SectionNav';
import { ButtonLink } from '@/components/ui/Button';
import { ApiError, api } from '@/lib/api';
import { paths } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import {
  ArchiveCard,
  ArchiveRow,
  DetailBody,
  DetailSection,
  HeroFact,
  HeroFacts,
  KnowledgeHero,
  SectionLead,
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
import { DishCard, FoodRegions, PreparationMatrix } from '@/components/knowledge/FoodSections';
import { MeasureList } from '@/components/knowledge/MeasureSections';

const NAV_ITEMS: SectionNavItem[] = [
  { id: 'preparations', label: '处理方式' },
  { id: 'dishes', label: '常见吃法' },
  { id: 'tips', label: '选购与处理' },
  { id: 'regions', label: '涉及地区' },
  { id: 'parasites', label: '相关寄生虫' },
  { id: 'sources', label: '来源' },
];

export function FoodPage() {
  const { id } = useParams<{ id: string }>();
  const fetcher = useCallback(() => {
    if (!id) return Promise.reject(new ApiError('缺少食物 id', 404, 'NOT_FOUND'));
    return api.food(id);
  }, [id]);
  const { data, error, loading, reload } = useAsync(fetcher, [id]);

  useDocumentTitle(data?.name ?? (loading ? '食物' : '未找到'), data?.tagline);

  if (loading) {
    return (
      <div data-testid="food-detail" className="field-paper">
        <DetailLoading />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div data-testid="food-detail" className="field-paper">
        <NotFoundDetail kindLabel="食物" identifier={id ?? ''} indexTo={paths.foods} indexLabel="返回食物图鉴" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="food-detail" className="field-paper">
        <DetailError
          title="无法加载食物资料"
          message={error?.message}
          onRetry={reload}
          backTo={paths.foods}
          backLabel="返回食物图鉴"
        />
      </div>
    );
  }

  return (
    <div data-testid="food-detail" className="field-paper">
      <FoodDetailView detail={data} />
    </div>
  );
}

function FoodDetailView({ detail }: { detail: FoodDetail }) {
  const parasites = detail.parasites ?? [];
  const preparations = detail.preparations ?? [];
  const dishes = detail.exampleDishes ?? [];
  const tips = detail.tips ?? [];
  const regions = detail.regions ?? [];

  const sourcesAll = useMemo(
    () =>
      collectSourceIds(
        detail.sourceIds,
        ...preparations.map((item) => item.sourceIds),
        ...dishes.map((item) => item.sourceIds),
        ...tips.map((item) => item.sourceIds),
      ),
    [detail.sourceIds, preparations, dishes, tips],
  );

  const aliasText = (detail.aliases ?? []).filter((alias) => alias !== detail.name).slice(0, 4).join('、');
  const preparationLabels = preparations.map((item) => item.label.split(' / ')[0]).filter(Boolean).slice(0, 3);
  const dishNames = dishes.map((dish) => dish.name).slice(0, 3);

  return (
    <>
      <KnowledgeHero
        breadcrumbs={[
          { label: '首页', to: paths.home },
          { label: '图鉴', to: paths.atlas },
          { label: '食物', to: paths.foods },
          { label: detail.name },
        ]}
        eyebrow={detail.categoryLabel !== detail.name ? detail.categoryLabel : '食物'}
        title={detail.name}
        subtitle={<MetaDotList items={[aliasText ? `又称 ${aliasText}` : null]} />}
        tagline={detail.tagline}
        lead={detail.summary}
        facts={
          <HeroFacts>
            <HeroFact
              label="关联寄生虫"
              value={parasites.length > 0 ? previewNames(parasites.map((item) => item.name)) : '未收录'}
            />
            <HeroFact label="常见做法" value={preparationLabels.length > 0 ? preparationLabels.join('、') : '未收录'} />
            <HeroFact label="常见吃法" value={dishNames.length > 0 ? dishNames.join('、') : '未收录'} />
          </HeroFacts>
        }
        actions={
          <>
            <ButtonLink to={`/chat?food=${encodeURIComponent(detail.id)}`} iconLeft={<MessageSquareText size={15} />}>
              带着这个问题提问
            </ButtonLink>
            <ButtonLink
              to={`${paths.explore}?food=${encodeURIComponent(detail.id)}`}
              variant="secondary"
              iconLeft={<Compass size={15} />}
            >
              在探索中查看
            </ButtonLink>
            <ButtonLink to={paths.foods} variant="ghost" size="sm" className="min-h-[40px]" iconRight={<ArrowRight size={13} />}>
              全部食物
            </ButtonLink>
          </>
        }
        notice={
          detail.seasonNote ? (
            <p className="font-sans text-[13px] leading-6 tracking-[0.02em] text-ink-muted">
              <span className="text-ink-faint">季节提示：</span>
              {detail.seasonNote}
            </p>
          ) : undefined
        }
        aside={
          <ArchiveCard label="基本信息">
            <ArchiveRow label="分类">{detail.categoryLabel}</ArchiveRow>
            <ArchiveRow label="关联寄生虫">
              {parasites.length > 0 ? previewNames(parasites.map((item) => item.name)) : '—'}
            </ArchiveRow>
            <ArchiveRow label="常见吃法">{dishNames.length > 0 ? dishNames.join('、') : '—'}</ArchiveRow>
          </ArchiveCard>
        }
      />

      <DetailBody navItems={NAV_ITEMS}>
        <DetailSection id="preparations" title="处理方式与风险">
          <div className="space-y-5">
            {parasites.length > 0 ? (
              <SectionLead>同一种食物，处理方式不同，风险也不同。</SectionLead>
            ) : (
              <SectionLead>暂未建立与特定寄生虫的明确关联，以下为一般处理方式说明。</SectionLead>
            )}
            <PreparationMatrix preparations={preparations} />
          </div>
        </DetailSection>

        <DetailSection id="dishes" title="常见吃法">
          {dishes.length > 0 ? (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {dishes.map((dish) => (
                <DishCard key={dish.name} dish={dish} />
              ))}
            </div>
          ) : (
            <p className="font-sans text-[14px] text-ink-muted">暂未收录常见吃法。</p>
          )}
        </DetailSection>

        <DetailSection id="tips" title="选购与处理建议">
          <MeasureList measures={tips} />
        </DetailSection>

        <DetailSection id="regions" title="涉及地区">
          <FoodRegions regions={regions} />
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
            empty="暂未收录明确关联的寄生虫。"
          />
        </DetailSection>

        <DetailSection id="sources" title="来源">
          <FieldSourceList sourceIds={sourcesAll} />
        </DetailSection>
      </DetailBody>
    </>
  );
}
