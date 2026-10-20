import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Menu, MessageSquareText, Search, X } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/brand/LogoMark';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV, ROUTES, isPrimaryNavActive } from '@/lib/site-nav';
import { useSearch } from './search-context';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuPanel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
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
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
      if (e.key !== 'Tab') return;
      const items = menuPanel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    closeButton.current?.focus();
    window.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onResize);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onResize);
      document.body.style.overflow = previousOverflow;
      if (!desktop.matches) previousFocus?.focus();
    };
  }, [menuOpen]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-300',
        scrolled ? 'border-line/80 bg-white/95 backdrop-blur-md' : 'border-line/60 bg-white/90 backdrop-blur-sm',
      )}
    >
      <div className="mx-auto flex h-[80px] max-w-shell items-center gap-3 px-5 sm:gap-7 md:px-8">
        <Link to={ROUTES.home} className="group flex shrink-0 items-center gap-3" aria-label="食源虫谱首页">
          <LogoMark size={42} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span className="sm:hidden"><Wordmark compact /></span>
          <span className="hidden sm:block"><Wordmark /></span>
        </Link>

        <nav aria-label="主导航" className="ml-4 hidden items-center gap-7 lg:flex">
          {PRIMARY_NAV.map((item) => {
            const active = isPrimaryNavActive(item, location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'relative py-2 font-sans text-[15px] tracking-[0.08em] transition-colors',
                  active ? 'text-blue-700' : 'text-ink-muted hover:text-ink',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
                <span
                  className={cn(
                    'absolute inset-x-0 bottom-0 h-px origin-left bg-blue-500 transition-transform duration-300',
                    active ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
          <button
            type="button"
            onClick={openSearch}
            className="hidden min-h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink-soft transition hover:border-blue-300 hover:text-blue-700 sm:flex"
            aria-label="搜索"
          >
            <Search size={14} />
            <span className="font-sans tracking-[0.06em]">搜索</span>
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
            className="hidden min-h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-medium text-white transition hover:bg-blue-900 md:flex"
          >
            <MessageSquareText size={14} />
            提问
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center text-ink transition hover:text-blue-700 lg:hidden"
            aria-label="打开菜单"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            <Menu size={19} />
          </button>
        </div>
      </div>

      {/* Keep the viewport overlay outside the header's backdrop-filter containing block. */}
      {menuOpen && createPortal(
        <div className="fixed inset-0 z-[90] h-dvh lg:hidden">
          <button className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" tabIndex={-1} />
          <div
            ref={menuPanel}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm animate-fade-in flex-col bg-paper-light shadow-lift"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
              <span className="flex items-center gap-2">
                <LogoMark size={34} />
                <Wordmark compact />
              </span>
              <button
                ref={closeButton}
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-2 text-ink-muted hover:text-ink"
                aria-label="关闭菜单"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label="移动端导航">
              {PRIMARY_NAV.map((item) => {
                const active = isPrimaryNavActive(item, location.pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center justify-between rounded-xl px-3 py-3.5 font-sans text-[15px] tracking-[0.08em] transition',
                      active ? 'bg-blue-100 text-blue-800' : 'text-ink-soft hover:bg-blue-50 hover:text-blue-800',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                    <span aria-hidden="true" className="font-mono text-[12px] opacity-50">
                      →
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className="shrink-0 border-t border-line px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <Link to={ROUTES.chat} onClick={() => setMenuOpen(false)} className="atlas-action w-full">
                <MessageSquareText size={15} /> 提问
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
}


