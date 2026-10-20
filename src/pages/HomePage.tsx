import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MessageCircle, Search } from 'lucide-react';
import type { SearchHit, SearchKind } from '@shared/types';
import { api, ApiError } from '@/lib/api';
import { ROUTES } from '@/lib/site-nav';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';

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

/**
 * 首页只负责两件事：说清网站用途，并提供两个不同入口。
 * 名称搜索只在名称层面查找；完整情况交给对话入口。
 */
export function HomePage() {
  useDocumentTitle();

  const navigate = useNavigate();
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
    <div className="field-paper">
      <div className="mx-auto max-w-shell px-5 pb-16 pt-7 md:px-8 md:pt-14">
        <header className="grid gap-7 border-b border-ink/25 pb-6 md:pb-9 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:items-end lg:gap-16">
          <div>
            <p className="font-kai text-[13px] tracking-[0.12em] text-ink-muted">中国食源性寄生虫知识</p>
            <h1 className="mt-3 max-w-[720px] font-serif text-[clamp(2.3rem,5.2vw,4.6rem)] font-semibold leading-[1.1] tracking-[0.01em] text-ink">
              吃之前，
              <br />
              先查清楚。
            </h1>
          </div>
          <div className="max-w-[440px] lg:pb-2">
            <p className="font-kai text-[16px] leading-[1.95] text-ink-soft">
              查一种食物、一种寄生虫或一个地方，了解可能的风险、后果和更安全的做法；
              也可以直接说说你遇到的情况。
            </p>
            <p className="mt-3 hidden font-kai text-[12px] leading-6 text-ink-muted sm:block md:mt-4">
              下面的两个入口不一样：一个查名称，一个问具体情况。
            </p>
          </div>
        </header>

        <main className="mt-6 grid gap-5 md:mt-10 lg:grid-cols-2">
          {/* 入口一：按名称查 */}
          <section
            aria-labelledby="home-name-search"
            className="flex flex-col border border-ink/40 bg-paper-light/75 p-5 shadow-[6px_6px_0_rgba(37,54,45,0.07)] sm:min-h-[330px] md:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-kai text-[11px] tracking-[0.14em] text-ink-muted">入口一</p>
                <h2 id="home-name-search" className="mt-2 font-serif text-[1.65rem] font-semibold text-ink">
                  按名称查
                </h2>
                <p className="mt-2 font-kai text-[13px] leading-6 text-ink-muted">
                  已经知道要找什么，直接查食物、寄生虫或地区。
                </p>
              </div>
              <Search size={22} aria-hidden className="mt-1 shrink-0 text-terracotta-700" />
            </div>

            <form onSubmit={handleNameSubmit} className="mt-6 flex border border-ink/45 bg-paper" role="search">
              <label htmlFor="home-name-input" className="sr-only">
                输入食物、寄生虫或地区名称
              </label>
              <input
                id="home-name-input"
                value={nameQuery}
                onChange={(event) => setNameQuery(event.target.value)}
                placeholder="输入名称，如猪肉、华支睾吸虫、广东"
                className="h-12 w-full bg-transparent px-3.5 font-kai text-[14px] tracking-[0.02em] text-ink outline-none placeholder:text-ink-faint"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!nameQuery.trim() || searching}
                className="shrink-0 bg-ink px-5 font-kai text-[13px] tracking-[0.04em] text-paper-light transition hover:bg-terracotta-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {searching ? '查找中' : '查找'}
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-kai text-[11.5px] text-ink-muted">
              <span>可以查：</span>
              {NAME_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void runNameSearch(example)}
                  className="border-b border-line-strong/70 pb-0.5 transition hover:border-terracotta-700 hover:text-terracotta-700"
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="mt-5 flex-1" aria-live="polite">
              {searchError && <p className="font-kai text-[12px] leading-6 text-terracotta-700">{searchError}</p>}
              {!searchError && searchAttempted && !searching && searchHits.length === 0 && (
                <p className="font-kai text-[12px] leading-6 text-ink-muted">没有找到这个名称，试试更短的词。</p>
              )}
              {searchHits.length > 0 && (
                <ul className="border-t border-ink/20">
                  {searchHits.map((hit) => (
                    <li key={`${hit.kind}-${hit.id}`} className="border-b border-ink/15">
                      <Link
                        to={searchHref(hit)}
                        className="group flex items-baseline justify-between gap-4 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="font-serif text-[15px] font-semibold text-ink group-hover:text-terracotta-700">
                            {hit.title}
                          </span>
                          <span className="ml-2 font-kai text-[10.5px] text-ink-faint">
                            {hit.kind === 'source' ? '来源' : KIND_LABEL[hit.kind]}
                          </span>
                        </span>
                        <ArrowRight size={13} aria-hidden className="shrink-0 text-ink-muted transition group-hover:text-terracotta-700" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* 入口二：描述情况问 */}
          <section
            aria-labelledby="home-ask"
            className="flex flex-col border border-ink/40 bg-ink p-5 text-paper-light shadow-[6px_6px_0_rgba(37,54,45,0.1)] sm:min-h-[330px] md:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-kai text-[11px] tracking-[0.14em] text-paper/55">入口二</p>
                <h2 id="home-ask" className="mt-2 font-serif text-[1.65rem] font-semibold">
                  描述情况问
                </h2>
                <p className="mt-2 font-kai text-[13px] leading-6 text-paper/65">
                  不知道从哪个名称查，或情况比较具体，就用一段话说明。
                </p>
              </div>
              <MessageCircle size={22} aria-hidden className="mt-1 shrink-0 text-terracotta-300" />
            </div>

            <form onSubmit={handleAskSubmit} className="mt-6 flex flex-1 flex-col">
              <label htmlFor="home-ask-input" className="sr-only">
                描述你的饮食情况
              </label>
              <textarea
                id="home-ask-input"
                value={situation}
                onChange={(event) => setSituation(event.target.value)}
                rows={4}
                placeholder="例如：昨晚吃了生腌虾，现在有点担心。"
                className="min-h-[92px] w-full resize-none border border-paper/25 bg-paper/[0.06] p-3.5 font-kai text-[14px] leading-6 text-paper placeholder:text-paper/35 focus:border-paper/60 focus:outline-none"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="font-kai text-[10.5px] text-paper/45">可以补充地点、时间与做法</span>
                <button
                  type="submit"
                  disabled={!situation.trim()}
                  className="inline-flex items-center gap-2 bg-paper px-4 py-2 font-kai text-[13px] tracking-[0.04em] text-ink transition hover:bg-terracotta-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  提问 <ArrowRight size={13} aria-hidden />
                </button>
              </div>
            </form>

            <div className="mt-4 border-t border-paper/15 pt-3">
              <p className="font-kai text-[10.5px] text-paper/45">不知道怎么问？可以从这些开始：</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ASK_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setSituation(example)}
                    className="max-w-full border border-paper/20 px-2.5 py-1.5 text-left font-kai text-[11.5px] leading-5 text-paper/75 transition hover:border-paper/50 hover:text-paper"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </main>

        <section className="mt-8 flex flex-col gap-4 border-t border-ink/20 pt-5 font-kai text-[12.5px] leading-6 text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>想按地区、季节、食物和做法浏览，去探索；想系统阅读，去图鉴。</p>
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
            <Link to={ROUTES.explore} className="border-b border-ink/35 pb-0.5 text-ink transition hover:border-terracotta-700 hover:text-terracotta-700">
              按条件探索
            </Link>
            <Link to={ROUTES.atlas} className="border-b border-ink/35 pb-0.5 text-ink transition hover:border-terracotta-700 hover:text-terracotta-700">
              浏览图鉴
            </Link>
            <Link to={ROUTES.sources} className="border-b border-ink/35 pb-0.5 text-ink transition hover:border-terracotta-700 hover:text-terracotta-700">
              查看来源
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

