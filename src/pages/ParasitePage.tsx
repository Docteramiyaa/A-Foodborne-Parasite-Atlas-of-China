import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Compass, MessageSquareText } from 'lucide-react';
import type { ParasiteDetail } from '@shared/types';
import type { SectionNavItem } from '@/components/ui/SectionNav';
import { ButtonLink } from '@/components/ui/Button';
import { ApiError, api } from '@/lib/api';
import { useAtlas } from '@/lib/atlas';
import { paths } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
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
  ExternalLinks,
  FieldSourceList,
  MetaDotList,
  NotFoundDetail,
  RelatedEntityGrid,
  collectSourceIds,
  severityRank,
} from '@/components/knowledge/Shared';
import { ExternalMediaDisclosure } from '@/components/knowledge/ExternalMedia';
import { HostRelations, LifecycleDiagram, TransmissionFacts } from '@/components/knowledge/TransmissionSections';
import { ConsequenceList, RiskScenarioCard } from '@/components/knowledge/RiskSections';
import { MeasureList } from '@/components/knowledge/MeasureSections';
import { RegionMaterials, SeasonPanel } from '@/components/knowledge/EvidenceSections';

const NAV_ITEMS: SectionNavItem[] = [
  { id: 'overview', label: '概览' },
  { id: 'transmission', label: '传播与生活史' },
  { id: 'risk', label: '常见风险情形' },
  { id: 'consequences', label: '可能后果' },
  { id: 'prevention', label: '预防' },
  { id: 'post-exposure', label: '已食用后' },
  { id: 'treatment', label: '治疗与就医' },
  { id: 'geography', label: '地区与季节' },
  { id: 'related', label: '相关寄生虫' },
  { id: 'sources', label: '来源' },
];

export function ParasitePage() {
  const { id } = useParams<{ id: string }>();
  const fetcher = useCallback(() => {
    if (!id) return Promise.reject(new ApiError('缺少寄生虫 id', 404, 'NOT_FOUND'));
    return api.parasite(id);
  }, [id]);
  const { data, error, loading, reload } = useAsync(fetcher, [id]);

  useDocumentTitle(data?.name ?? (loading ? '寄生虫' : '未找到'), data?.tagline);

  if (loading) {
    return (
      <div data-testid="parasite-detail" className="field-paper">
        <DetailLoading />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div data-testid="parasite-detail" className="field-paper">
        <NotFoundDetail
          kindLabel="寄生虫"
          identifier={id ?? ''}
          indexTo={paths.parasites}
          indexLabel="返回寄生虫图鉴"
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="parasite-detail" className="field-paper">
        <DetailError
          title="无法加载寄生虫资料"
          message={error?.message}
          onRetry={reload}
          backTo={paths.parasites}
          backLabel="返回寄生虫图鉴"
        />
      </div>
    );
  }

  return (
    <div data-testid="parasite-detail" className="field-paper">
      <ParasiteDetailView detail={data} />
    </div>
  );
}

function ParasiteDetailView({ detail }: { detail: ParasiteDetail }) {
  const { parasiteById } = useAtlas();

  const foods = detail.foods ?? [];
  const regionMaterials = detail.regionEvidence ?? [];
  const riskScenarios = detail.riskScenarios ?? [];
  const consequences = detail.consequences ?? [];
  const prevention = detail.prevention ?? [];
  const postExposure = detail.postExposure ?? [];
  const treatment = detail.treatment;
  const seasonality = detail.seasonality;
  const distribution = detail.distribution;
  const transmission = detail.transmission;

  const relatedParasites = useMemo(
    () =>
      (detail.relatedParasiteIds ?? [])
        .map((relatedId) => parasiteById.get(relatedId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [detail.relatedParasiteIds, parasiteById],
  );

  const primaryConsequence = useMemo(
    () => [...consequences].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0],
    [consequences],
  );

  const sourcesAll = useMemo(
    () =>
      collectSourceIds(
        transmission?.sourceIds,
        ...riskScenarios.map((item) => item.sourceIds),
        ...consequences.map((item) => item.sourceIds),
        ...prevention.map((item) => item.sourceIds),
        ...postExposure.map((item) => item.sourceIds),
        treatment?.sourceIds,
        seasonality?.sourceIds,
        distribution?.sourceIds,
        ...(distribution?.stats ?? []).map((stat) => stat.sourceIds),
        ...regionMaterials.map((item) => item.sourceIds),
      ),
    [transmission, riskScenarios, consequences, prevention, postExposure, treatment, seasonality, distribution, regionMaterials],
  );

  const stats = (distribution?.stats ?? []).filter((stat) => stat && stat.value);
  const drugs = treatment?.drugs ?? [];
  const aliasText = (detail.aliases ?? []).filter((alias) => alias !== detail.name).slice(0, 4).join('、');

  return (
    <>
      <KnowledgeHero
        breadcrumbs={[
          { label: '首页', to: paths.home },
          { label: '图鉴', to: paths.atlas },
          { label: '寄生虫', to: paths.parasites },
          { label: detail.name },
        ]}
        eyebrow={detail.categoryLabel}
        title={detail.name}
        latin={detail.latinName}
        subtitle={<MetaDotList items={[aliasText ? `又称 ${aliasText}` : null]} />}
        tagline={detail.tagline}
        lead={detail.summary}
        facts={
          <HeroFacts>
            <HeroFact
              label="关联食物"
              value={foods.length > 0 ? foods.map((food) => food.name).join('、') : '未收录'}
            />
            <HeroFact
              label="主要后果"
              value={primaryConsequence?.title ?? '未收录'}
              hint={primaryConsequence ? undefined : '资料未收录'}
            />
            <HeroFact label="季节" value={seasonality?.pattern || '未给出明确季节'} />
          </HeroFacts>
        }
        actions={
          <>
            <ButtonLink
              to={`/chat?parasite=${encodeURIComponent(detail.id)}`}
              iconLeft={<MessageSquareText size={15} />}
            >
              带着这个问题提问
            </ButtonLink>
            <ButtonLink
              to={`${paths.explore}?parasite=${encodeURIComponent(detail.id)}`}
              variant="secondary"
              iconLeft={<Compass size={15} />}
            >
              在探索中查看
            </ButtonLink>
            <ButtonLink to={paths.parasites} variant="ghost" size="sm" className="min-h-[40px]" iconRight={<ArrowRight size={13} />}>
              全部寄生虫
            </ButtonLink>
          </>
        }
        aside={
          <ArchiveCard
            label="基本信息"
            footer={detail.externalLinks && detail.externalLinks.length > 0 ? <ExternalLinks links={detail.externalLinks} /> : undefined}
          >
            <ArchiveRow label="学名">
              <span className="font-serif italic">{detail.latinName}</span>
            </ArchiveRow>
            <ArchiveRow label="分类">{detail.categoryLabel}</ArchiveRow>
            <ArchiveRow label="关联食物">{foods.map((food) => food.name).join('、') || '—'}</ArchiveRow>
            <ArchiveRow label="季节">{seasonality?.pattern || '未给出明确季节'}</ArchiveRow>
          </ArchiveCard>
        }
      />

      <DetailBody navItems={NAV_ITEMS}>
        <DetailSection id="overview" title="概览">
          <div className="space-y-6">
            {distribution?.summary && <SectionLead>{distribution.summary}</SectionLead>}

            {stats.length > 0 && (
              <div className="grid grid-cols-2 gap-px border-y border-ink/25 bg-ink/20 lg:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex flex-col bg-paper px-4 py-4">
                    <p
                      className={cn(
                        'font-serif font-semibold leading-tight text-terracotta-700',
                        stat.value.length > 10 ? 'text-[16px] leading-6' : 'serif-num text-[1.6rem]',
                      )}
                    >
                      {stat.value}
                    </p>
                    <p className="mt-2 font-kai text-[10px] font-medium tracking-[0.12em] text-ink-muted">{stat.label}</p>
                    {stat.note && <p className="mt-1 font-kai text-[10px] leading-4 tracking-[0.02em] text-ink-faint">{stat.note}</p>}
                  </div>
                ))}
              </div>
            )}

            {detail.externalLinks && detail.externalLinks.length > 0 && (
              <div data-testid="external-media">
                <ExternalMediaDisclosure links={detail.externalLinks} />
              </div>
            )}
          </div>
        </DetailSection>

        <DetailSection id="transmission" title="传播与生活史">
          <div className="space-y-6">
            {transmission?.summary && <SectionLead>{transmission.summary}</SectionLead>}
            {transmission && <TransmissionFacts transmission={transmission} />}

            {transmission?.stages && transmission.stages.length > 0 && (
              <div className="border border-ink/25 bg-paper-light/40 p-5 md:p-6">
                <h3 className="border-b border-ink/20 pb-2.5 font-kai text-[10px] tracking-[0.16em] text-ink-faint">生活史阶段</h3>
                <LifecycleDiagram
                  stages={transmission.stages}
                  infectiveStage={transmission.infectiveStage}
                  className="mt-5"
                />
              </div>
            )}

            <HostRelations hosts={transmission?.hosts} />
          </div>
        </DetailSection>

        <DetailSection id="risk" title="常见风险情形">
          {riskScenarios.length > 0 ? (
            <div className="space-y-3">
              {riskScenarios.map((scenario) => (
                <RiskScenarioCard key={scenario.id} scenario={scenario} />
              ))}
            </div>
          ) : (
            <p className="font-kai text-[13px] text-ink-muted">暂未收录风险资料。</p>
          )}
        </DetailSection>

        <DetailSection id="consequences" title="可能后果">
          <ConsequenceList consequences={consequences} />
        </DetailSection>

        <DetailSection id="prevention" title="预防">
          <MeasureList measures={prevention} />
        </DetailSection>

        <section id="post-exposure" aria-label="已食用后" className="scroll-mt-36 border-y border-ink/25 bg-terracotta-100/20 px-5 py-8 md:px-8">
          <h2 className="font-serif text-[clamp(1.5rem,2.6vw,2.15rem)] font-semibold leading-tight tracking-[0.02em] text-ink">
            已经吃了，接下来怎么办？
          </h2>
          <p className="mt-3 max-w-2xl font-kai text-[13px] leading-7 tracking-[0.02em] text-ink-muted">
            如已食用并出现不适，请及时就医，并告知医生食用时间与食物种类。
          </p>
          <div className="mt-5">
            <MeasureList measures={postExposure} variant="post-exposure" />
          </div>
        </section>

        <DetailSection id="treatment" title="治疗与就医">
          {treatment ? (
            <div className="border border-ink/25 bg-paper-light/40 p-5 md:p-6">
              <p className="font-kai text-[13.5px] leading-7 tracking-[0.02em] text-ink-soft">{treatment.summary}</p>
              {drugs.length > 0 && (
                <div className="mt-4">
                  <p className="font-kai text-[9.5px] tracking-[0.14em] text-ink-faint">资料提及的药物（仅为转述）</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {drugs.map((drug) => (
                      <li key={drug} className="border border-ink/25 bg-paper/60 px-2.5 py-1 font-kai text-[11.5px] leading-5 tracking-[0.02em] text-ink-soft">
                        {drug}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 border-t border-ink/20 pt-3 font-kai text-[12px] leading-6 tracking-[0.02em] text-ink-muted">
                {treatment.note}
              </p>
            </div>
          ) : (
            <p className="font-kai text-[13px] text-ink-muted">暂无治疗资料。</p>
          )}
        </DetailSection>

        <DetailSection id="geography" title="地区与季节">
          <div className="space-y-8">
            <div>
              <h3 className="mb-3 border-b border-ink/25 pb-2 font-kai text-[10px] tracking-[0.16em] text-ink-faint">各地资料</h3>
              <RegionMaterials materials={regionMaterials} />
            </div>
            <div>
              <h3 className="mb-3 border-b border-ink/25 pb-2 font-kai text-[10px] tracking-[0.16em] text-ink-faint">季节</h3>
              <SeasonPanel seasonality={seasonality} />
            </div>
          </div>
        </DetailSection>

        {relatedParasites.length > 0 && (
          <DetailSection id="related" title="相关寄生虫">
            <RelatedEntityGrid
              items={relatedParasites.map((parasite) => ({
                to: paths.parasite(parasite.id),
                title: parasite.name,
                latin: parasite.latinName,
                subtitle: parasite.tagline,
                category: parasite.categoryLabel,
              }))}
            />
          </DetailSection>
        )}

        <DetailSection id="sources" title="来源">
          <FieldSourceList sourceIds={sourcesAll} />
        </DetailSection>
      </DetailBody>
    </>
  );
}
