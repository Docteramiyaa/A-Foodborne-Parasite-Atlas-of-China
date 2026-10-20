import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command, Loader2, MapPin, Microscope, Search, UtensilsCrossed, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { SearchHit, SearchKind } from '@shared/types';
import { cn } from '@/lib/utils';
import { useSearch } from './search-context';

const GROUP_LABEL: Record<SearchKind, string> = {
  parasite: '寄生虫',
  food: '食物',
  region: '地区',
  source: '来源',
};

const GROUP_ORDER: SearchKind[] = ['parasite', 'food', 'region', 'source'];

const KIND_ICON = {
  parasite: Microscope,
  food: UtensilsCrossed,
  region: MapPin,
  source: Command,
} as const;

const QUICK_LINKS = [
  { label: '华支睾吸虫', url: '/parasites/clonorchis-sinensis', hint: '生食淡水鱼' },
  { label: '深圳', url: '/regions/440000', hint: '城市 → 广东省' },
  { label: '成都', url: '/regions/510000', hint: '城市 → 四川省' },
  { label: '生食的淡水鱼', url: '/foods/freshwater-fish', hint: '食物与做法' },
];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-ochre-200/80 px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function SearchDialog({ open, onClose, initialQuery = '' }: { open: boolean; onClose: () => void; initialQuery?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      api
        .search(trimmed)
        .then((res) => {
          if (requestId.current !== id) return;
          setHits(res.hits.slice(0, 24));
          setActiveIndex(0);
        })
        .catch(() => {
          if (requestId.current === id) setHits([]);
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
    }, 170);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const go = useCallback(
    (url: string) => {
      onClose();
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      navigate(url);
    },
    [navigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) go(hit.url);
    }
  };

  if (!open) return null;

  const grouped = GROUP_ORDER.map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) })).filter((g) => g.items.length > 0);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="全站搜索">
      <button className="absolute inset-0 bg-ink/25" onClick={onClose} aria-label="关闭搜索" tabIndex={-1} />
      <div className="relative w-full max-w-2xl animate-fade-up overflow-hidden rounded-3xl border border-line bg-white shadow-lift">
        <div className="flex items-center gap-3 border-b border-line px-4 focus-within:bg-blue-50">
          <Search size={17} className="shrink-0 text-ink-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索寄生虫、食物、地区、城市或文献…"
            className="h-14 w-full bg-transparent font-sans text-[15px] tracking-[0.03em] text-ink outline-none placeholder:text-ink-faint"
            aria-label="搜索关键词"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <Loader2 size={15} className="animate-spin text-ink-muted" aria-label="搜索中" />}
          <button onClick={onClose} className="p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto overscroll-contain p-2.5">
          {!hasQuery && (
            <div className="px-2 py-2">
              <p className="mb-2 px-2 font-sans text-2xs font-medium uppercase tracking-[0.16em] text-ink-faint">快速进入</p>
              <div className="space-y-0.5">
                {QUICK_LINKS.map((link) => (
                  <button
                    key={`${link.label}:${link.url}`}
                    onClick={() => go(link.url)}
                    className="flex w-full items-center justify-between border-b border-line/40 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-ink/[0.04]"
                  >
                    <span className="font-sans text-sm tracking-[0.02em] text-ink">{link.label}</span>
                    <span className="text-[13px] text-ink-muted">{link.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-4 border-t border-line/70 px-2 pt-3 text-[13px] leading-5 text-ink-faint">
                例如：“三文鱼”“华支睾吸虫”“广东”。
              </p>
            </div>
          )}

          {hasQuery && !loading && hits.length === 0 && (
            <div className="px-3 py-10 text-center">
              <p className="font-serif text-base text-ink">没有找到“{query.trim()}”</p>
              <p className="mt-2 font-sans text-xs leading-6 text-ink-muted">试试更短的词，如“鱼生”“福寿螺”“云南”；也可以直接搜城市，如“深圳”“成都”。</p>
            </div>
          )}

          {grouped.map((group) => {
            const Icon = KIND_ICON[group.kind];
            return (
              <div key={group.kind} className="mb-1">
                <p className="px-3 pb-1 pt-2 font-sans text-2xs font-medium uppercase tracking-[0.16em] text-ink-faint">
                  {GROUP_LABEL[group.kind]}
                </p>
                {group.items.map((hit) => {
                  const index = hits.indexOf(hit);
                  const active = index === activeIndex;
                  return (
                    <button
                      key={`${hit.kind}-${hit.id}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(hit.url)}
                      className={cn(
                        'flex w-full items-start gap-3 border-b border-line/35 px-3 py-2.5 text-left transition last:border-b-0',
                        active ? 'bg-ink text-paper-light' : 'hover:bg-ink/[0.04]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border',
                          active ? 'border-paper/25 text-paper/80' : 'border-line text-ink-muted',
                        )}
                      >
                        <Icon size={12} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={cn('text-sm font-medium', active ? 'text-paper-light' : 'text-ink')}>
                            <Highlight text={hit.title} query={query} />
                          </span>
                          {hit.badges.slice(0, 2).map((b) => (
                            <span
                              key={b}
                              className={cn(
                                'border px-1.5 py-px text-[12px]',
                                active ? 'border-paper/25 text-paper/70' : 'border-line text-ink-muted',
                              )}
                            >
                              {b}
                            </span>
                          ))}
                        </span>
                        <span className={cn('mt-0.5 block truncate text-[13px] leading-5', active ? 'text-paper/60' : 'text-ink-muted')}>
                          <Highlight text={hit.excerpt || hit.subtitle} query={query} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-line/80 px-4 py-2.5 font-sans text-[12px] text-ink-faint">
          <span>输入食物、寄生虫或地区名称</span>
          <span>食源虫谱</span>
        </div>
      </div>
    </div>
  );
}



