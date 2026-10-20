import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/brand/LogoMark';
import { ROUTES } from '@/lib/site-nav';

/** 页脚只保留品牌、三个主入口和版权，不重复免责声明或内部统计。 */
export function Footer() {
  return (
    <footer className="mt-20 border-t border-line-strong/50 bg-paper-deep/40">
      <div className="mx-auto flex max-w-shell flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <Link to={ROUTES.home} className="flex items-center gap-3" aria-label="食源虫谱首页">
          <LogoMark size={34} />
          <span>
            <span className="font-serif text-[18px] font-semibold tracking-[0.14em] text-ink">食源虫谱</span>
            <span className="mt-0.5 block font-kai text-[9px] tracking-[0.18em] text-ink-muted">
              FOODBORNE PARASITE ATLAS
            </span>
          </span>
        </Link>

        <nav aria-label="页脚导航" className="flex flex-wrap items-center gap-x-6 gap-y-2 font-kai text-[12.5px] text-ink-soft">
          <Link to={ROUTES.explore} className="border-b border-transparent pb-0.5 transition hover:border-ink/40 hover:text-ink">
            探索
          </Link>
          <Link to={ROUTES.atlas} className="border-b border-transparent pb-0.5 transition hover:border-ink/40 hover:text-ink">
            图鉴
          </Link>
          <Link to={ROUTES.sources} className="border-b border-transparent pb-0.5 transition hover:border-ink/40 hover:text-ink">
            依据
          </Link>
        </nav>

        <p className="font-kai text-[10.5px] text-ink-faint">© {new Date().getFullYear()} 食源虫谱</p>
      </div>
    </footer>
  );
}

