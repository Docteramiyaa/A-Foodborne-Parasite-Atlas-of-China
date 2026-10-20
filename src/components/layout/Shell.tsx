import { useEffect, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAtlas } from '@/lib/atlas';
import { Header } from './Header';
import { Footer } from './Footer';
import { useSearch } from './search-context';
import { LogoMark, Wordmark } from '@/components/brand/LogoMark';
import { LoadingDots, PageLoading } from '@/components/ui/States';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function AtlasGate({ children }: { children: React.ReactNode }) {
  const { loading, error, reload, meta } = useAtlas();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-paper px-6">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full border border-jade-300/40" style={{ animationDuration: '2.6s' }} />
          <span className="absolute inset-3 rounded-full border border-line" />
          <LogoMark size={56} />
        </div>
        <div className="text-center">
          <Wordmark />
          <div className="mt-5 flex justify-center">
            <LoadingDots label="正在加载知识库…" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-paper px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-terracotta-100 text-terracotta-700">
          <AlertTriangle size={22} />
        </span>
        <h1 className="font-serif text-2xl text-ink">知识服务暂时不可用</h1>
        <p className="max-w-md text-sm leading-6 text-ink-muted">
          无法读取知识库数据。请确认后端服务已启动（开发环境运行 <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-xs">npm run dev</code>）。
        </p>
        {error?.message && <p className="max-w-md font-mono text-[11px] text-ink-faint">{error.message}</p>}
        <button
          type="button"
          onClick={reload}
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-jade-800 px-5 py-2.5 text-sm text-paper-light hover:bg-jade-900"
        >
          <RefreshCw size={14} /> 重新加载
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export function Shell() {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const { openSearch } = useSearch();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  return (
    <AtlasGate>
      <ScrollToTop />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-jade-800 focus:px-4 focus:py-2 focus:text-sm focus:text-paper-light"
      >
        跳到主要内容
      </a>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main id="main-content" className="flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<PageLoading label="正在打开页面" />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
      </div>
    </AtlasGate>
  );
}

