import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, MessageCircle, Search, type LucideIcon } from 'lucide-react';
import type { SearchHit, SearchKind } from '@shared/types';
import { api, ApiError } from '@/lib/api';
import { ROUTES } from '@/lib/site-nav';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { ExploreMap, SMALL_PROVINCES } from '@/components/map/ExploreMap';
import { ProvincePicker } from '@/components/explore/Conditions';
import { AccentDots } from '@/components/ui/AccentDots';
import { useAtlas } from '@/lib/atlas';

const NAME_EXAMPLES = ['猪肉', '淡水鱼', '华支睾吸虫', '广东'] as const;
const ASK_EXAMPLES = [
  '昨晚吃了生腌虾，现在有点担心。',
  '涮羊肉只烫了几秒，需要做什么？',
  '孕妇吃水果要注意弓形虫吗？',
] as const;

const KIND_LABEL: Record<Exclude<SearchKind, 'source'>, string> = {
  parasite: '寄生虫',
  food: '食物',
  region: '地区',
};

const KIND_PATH: Record<Exclude<SearchKind, 'source'>, string> = {
  parasite: '/parasites/',
  food: '/foods/',
  region: '/regions/',
};

function searchHref(hit: SearchHit): string {
  if (hit.kind === 'source') return hit.url;
  if (hit.kind === 'region') {
    const code = hit.url.split('/').filter(Boolean).pop() ?? hit.id;
    return `${ROUTES.regions}/${code}`;
  }
  return `${KIND_PATH[hit.kind]}${encodeURIComponent(hit.id)}`;
}

function QueryCard({ id, title, description, icon: Icon, children }: {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="atlas-panel p-5 md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <Icon size={21} strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 id={id} className="text-lg font-semibold text-blue-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * 首页提供地图入口、名称查询和自然语言提问；完整条件与结果留在探索页。
 * 名称搜索只在名称层面查找；完整情况交给对话入口。
 */
export function HomePage() {
  useDocumentTitle();

  const navigate = useNavigate();
  const { regions } = useAtlas();
  const [pickerOpen, setPickerOpen] = useState(false);
  const openProvince = (code: string) => navigate(`${ROUTES.explore}?province=${code}`);
  const [nameQuery, setNameQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [situation, setSituation] = useState('');

  async function runNameSearch(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setNameQuery(value);
    setSearchAttempted(true);
    setSearching(true);
    setSearchError(null);
    try {
      const response = await api.search(value);
      setSearchHits(response.hits.filter((hit) => hit.kind !== 'source').slice(0, 6));
    } catch (error) {
      setSearchHits([]);
      setSearchError(error instanceof ApiError ? error.message : '暂时无法搜索，请稍后再试。');
    } finally {
      setSearching(false);
    }
  }

  function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runNameSearch(nameQuery);
  }

  function handleAskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = situation.trim();
    if (!value) return;
    navigate(`${ROUTES.chat}?q=${encodeURIComponent(value)}`);
  }

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-shell px-5 pb-12 pt-8 md:px-8 md:pt-12">
        <header className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 text-sm font-medium text-blue-700">中国食源性寄生虫图谱</p>
            <h1 className="font-serif text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-tight text-ink">
              吃之前，先查清楚。
            </h1>
          </div>
          <p className="max-w-[340px] text-sm leading-7 text-ink-muted">
            从一个地方、一种食物开始，<br className="hidden lg:block" />了解寄生虫与饮食之间的联系。
          </p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-labelledby="home-map-title" className="atlas-panel order-2 overflow-hidden lg:order-1">
            <div className="flex items-center justify-between gap-3 bg-blue-700 px-5 py-5 text-white md:px-7">
              <div>
                <h2 id="home-map-title" className="inline-flex items-center gap-2 text-xl font-semibold">
                  从一个地方开始
                  <AccentDots />
                </h2>
                <p className="mt-2 text-sm text-blue-100">点击省份，探索当地的饮食与寄生虫知识。</p>
              </div>
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white sm:flex"><MapPin size={20} aria-hidden /></span>
            </div>
            <ExploreMap selectedCode={null} onSelect={openProvince} className="h-[350px] w-full bg-blue-50 sm:h-[440px] lg:h-[450px]" />
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-5 py-3 md:px-7" aria-label="小省份索引">
              {SMALL_PROVINCES.map((province) => <button key={province.code} type="button" onClick={() => openProvince(province.code)} className="inline-flex min-h-8 items-center gap-1.5 text-xs text-ink-muted hover:text-blue-700">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[10px] text-blue-800">{province.number}</span>{province.name}
              </button>)}
            </div>
            <div className="mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-line py-4 text-sm md:mx-7">
              <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-2 font-medium text-blue-800 hover:text-blue-950"><MapPin size={15} aria-hidden />按省份查找</button>
              <Link to={ROUTES.explore} className="inline-flex items-center gap-2 font-medium text-blue-800 hover:text-blue-950">进入探索 <ArrowRight size={16} aria-hidden /></Link>
            </div>
          </section>

          <div className="order-1 grid min-w-0 gap-5 lg:order-2">
            <QueryCard id="home-name-search" title="按名称查" description="查找食物、寄生虫或地区。" icon={Search}>
              <form onSubmit={handleNameSubmit} className="query-composer mt-5" role="search">
                <label htmlFor="home-name-input" className="sr-only">输入食物、寄生虫或地区名称</label>
                <input id="home-name-input" value={nameQuery} onChange={(event) => setNameQuery(event.target.value)} placeholder="如：猪肉、华支睾吸虫" className="query-entry" autoComplete="off" />
                <div className="query-actions">
                  <span className="text-xs text-ink-muted">找到对应的图鉴条目</span>
                  <button type="submit" disabled={!nameQuery.trim() || searching} className="atlas-action shrink-0">{searching ? '查找中' : '查找'} <ArrowRight size={16} aria-hidden /></button>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-ink-muted">
                {NAME_EXAMPLES.map((example) => <button key={example} type="button" onClick={() => void runNameSearch(example)} className="py-1 hover:text-blue-700">{example}</button>)}
              </div>
              <div aria-live="polite">
                {searchError && <p className="mt-3 text-sm leading-6 text-terracotta-700">{searchError}</p>}
                {!searchError && searchAttempted && !searching && searchHits.length === 0 && <p className="mt-3 text-sm leading-6 text-ink-muted">没有找到这个名称，试试更短的词。</p>}
                {searchHits.length > 0 && <ul className="mt-4 divide-y divide-line border-t border-line">
                  {searchHits.map((hit) => <li key={`${hit.kind}-${hit.id}`}>
                    <Link to={searchHref(hit)} className="group flex items-center justify-between gap-3 py-3 text-sm">
                      <span><span className="font-medium group-hover:text-blue-700">{hit.title}</span><span className="ml-2 text-xs text-ink-muted">{hit.kind === 'source' ? '来源' : KIND_LABEL[hit.kind]}</span></span>
                      <ArrowRight size={15} aria-hidden className="shrink-0 text-blue-700" />
                    </Link>
                  </li>)}
                </ul>}
              </div>
            </QueryCard>

            <QueryCard id="home-ask" title="描述情况问" description="说说在哪里、吃什么、准备怎么吃。" icon={MessageCircle}>
              <form onSubmit={handleAskSubmit} className="query-composer mt-5">
                <label htmlFor="home-ask-input" className="sr-only">描述你的饮食情况</label>
                <textarea id="home-ask-input" value={situation} onChange={(event) => setSituation(event.target.value)} rows={2} placeholder="如：昨晚吃了生腌虾，现在有点担心。" className="query-entry" />
                <div className="query-actions">
                  <span className="text-xs text-ink-muted">进入对话，继续聊聊</span>
                  <button type="submit" disabled={!situation.trim()} className="atlas-action shrink-0">提问 <ArrowRight size={16} aria-hidden /></button>
                </div>
              </form>
              <div className="mt-3 flex min-h-6 items-center">
                <button type="button" onClick={() => setSituation(ASK_EXAMPLES[1])} className="py-1 text-left text-xs leading-5 text-ink-muted hover:text-blue-700">试着问：{ASK_EXAMPLES[1]}</button>
              </div>
            </QueryCard>
          </div>
        </div>

        <section className="mt-7 flex flex-wrap items-center justify-between gap-4 px-1 text-sm text-ink-muted">
          <p>想系统了解食物、寄生虫和地区知识？</p>
          <div className="flex items-center gap-6">
            <Link to={ROUTES.atlas} className="inline-flex items-center gap-2 font-medium text-blue-700 hover:text-blue-950">浏览图鉴 <ArrowRight size={16} aria-hidden /></Link>
            <Link to={ROUTES.sources} className="hover:text-blue-700">查看来源</Link>
          </div>
        </section>
      </div>
      <ProvincePicker open={pickerOpen} onClose={() => setPickerOpen(false)} regions={regions} selectedCode={null} onSelect={openProvince} />
    </div>
  );
}
