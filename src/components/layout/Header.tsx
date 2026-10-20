import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, MessageSquareText, Search, X } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/brand/LogoMark';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV, ROUTES, isPrimaryNavActive } from '@/lib/site-nav';
import { useSearch } from './search-context';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { openSearch } = useSearch();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-300',
        scrolled ? 'border-line/80 bg-paper/95 backdrop-blur-md' : 'border-line/60 bg-paper/80 backdrop-blur-sm',
      )}
    >
      <div className="mx-auto flex h-[86px] max-w-shell items-center gap-7 px-5 md:px-8">
        <Link to={ROUTES.home} className="group flex shrink-0 items-center gap-3" aria-label="食源虫谱首页">
          <LogoMark size={42} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
          <Wordmark />
        </Link>

        <nav aria-label="主导航" className="ml-4 hidden items-center gap-7 lg:flex">
          {PRIMARY_NAV.map((item) => {
            const active = isPrimaryNavActive(item, location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'relative pb-1 font-kai text-[15px] tracking-[0.08em] transition-colors',
                  active ? 'text-terracotta-700' : 'text-ink-muted hover:text-ink',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
                <span
                  className={cn(
                    'absolute inset-x-0 bottom-0 h-px origin-left bg-terracotta-600 transition-transform duration-300',
                    active ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={openSearch}
            className="hidden items-center gap-2 border-b border-transparent px-1 py-1 text-[12.5px] text-ink-muted transition hover:border-line-strong hover:text-ink sm:flex"
            aria-label="搜索"
          >
            <Search size={14} />
            <span className="font-kai tracking-[0.06em]">搜索</span>
          </button>
          <button
            type="button"
            onClick={openSearch}
            className="inline-flex h-9 w-9 items-center justify-center text-ink-muted transition hover:text-ink sm:hidden"
            aria-label="搜索"
          >
            <Search size={17} />
          </button>

          <Link
            to={ROUTES.chat}
            className="hidden items-center gap-2 border border-ink/60 px-3.5 py-2 font-kai text-[13px] tracking-[0.06em] text-ink transition hover:border-ink hover:bg-ink hover:text-paper-light md:flex"
          >
            <MessageSquareText size={14} />
            提问
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center text-ink transition hover:text-terracotta-700 lg:hidden"
            aria-label="打开菜单"
            aria-expanded={menuOpen}
          >
            <Menu size={19} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" tabIndex={-1} />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm animate-fade-in flex-col bg-paper-light shadow-lift">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="flex items-center gap-2">
                <LogoMark size={34} />
                <Wordmark compact />
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-2 text-ink-muted hover:text-ink"
                aria-label="关闭菜单"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="移动端导航">
              {PRIMARY_NAV.map((item) => {
                const active = isPrimaryNavActive(item, location.pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'flex items-center justify-between border-b border-line/50 px-3 py-3.5 font-kai text-[15px] tracking-[0.08em] transition',
                      active ? 'text-terracotta-700' : 'text-ink-soft hover:text-ink',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                    <span aria-hidden="true" className="font-mono text-[10px] opacity-50">
                      →
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-line px-5 py-5">
              <Link to={ROUTES.chat} className="flex w-full items-center justify-center gap-2 border border-ink/60 px-4 py-3 font-kai text-sm tracking-[0.08em] text-ink">
                <MessageSquareText size={15} /> 提问
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}


