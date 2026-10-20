import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Microscope, Utensils } from 'lucide-react';
import { useAtlas } from '@/lib/atlas';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { ROUTES } from '@/lib/site-nav';
import { FieldPageHeader, FieldTag } from '@/components/catalog/FieldNotes';

/** 三个知识目录入口；完整内容在各自的图鉴中阅读。 */
export function AtlasHubPage() {
  useDocumentTitle('图鉴', '寄生虫、食物与处理方式、省级地区三类知识目录。');
  const { taxonomy } = useAtlas();
  return (
    <div data-testid="atlas-page" className="field-paper pb-16">
      <FieldPageHeader breadcrumbs={[{ label: '首页', to: ROUTES.home }, { label: '图鉴' }]}
        title="从熟悉的食物，认识微小的世界。" lead="浏览寄生虫、食物和地区知识，沿着你感兴趣的线索读下去。" />
      <div className="mx-auto grid max-w-shell gap-5 px-5 pt-6 md:px-8 lg:grid-cols-[1.15fr_1fr]">
        <Link to={ROUTES.parasites} className="group relative flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-blue-700 bg-blue-700 p-7 transition hover:border-blue-900 hover:shadow-lift md:p-9 lg:row-span-2">
          <div aria-hidden className="relative mb-10 flex h-40 items-center justify-center self-end pr-3 lg:mb-16 lg:h-56 lg:pr-10">
            <div className="absolute h-40 w-40 rounded-full bg-blue-500 lg:h-52 lg:w-52" />
            <Microscope className="relative h-32 w-32 -rotate-12 text-blue-200 transition duration-300 group-hover:rotate-0 lg:h-40 lg:w-40" strokeWidth={1.1} />
            <span className="absolute -left-10 top-4 h-7 w-7 rounded-lg bg-pink" />
            <span className="absolute -right-3 bottom-3 h-6 w-6 rounded-full bg-butter" />
          </div>
          <div className="relative mt-auto">
            <h2 className="font-serif text-3xl font-semibold text-white md:text-4xl">寄生虫图鉴</h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-blue-100">认识它们的生活史、传播途径，以及与日常饮食有关的风险和防护。</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {taxonomy.parasiteCategories.map((category) => <FieldTag key={category.id} className="!border-white/30 !bg-transparent !text-white">{category.name}</FieldTag>)}
            </div>
            <div className="mt-8 flex items-center justify-between border-t border-white/25 pt-5 font-medium text-white"><span>认识寄生虫</span><ArrowUpRight size={23} aria-hidden /></div>
          </div>
        </Link>
        <Link to={ROUTES.foods} className="atlas-panel group relative overflow-hidden p-7 transition hover:border-blue-300 hover:shadow-lift md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-butter text-blue-800"><Utensils size={26} strokeWidth={1.5} aria-hidden /></span>
            <ArrowUpRight size={23} className="text-blue-800 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </div>
          <h2 className="text-2xl font-semibold text-ink">食物与处理方式</h2>
          <p className="mt-3 max-w-sm text-sm leading-7 text-ink-soft">从餐桌上的食材出发，了解不同做法如何影响风险。</p>
          <div className="mt-5 flex flex-wrap gap-2">{taxonomy.foodCategories.slice(0, 4).map((category) => <FieldTag key={category.id} className="!border-blue-200 !bg-blue-50 !text-blue-900">{category.name}</FieldTag>)}</div>
        </Link>
        <Link to={ROUTES.regions} className="atlas-panel group relative overflow-hidden p-7 transition hover:border-blue-300 hover:shadow-lift md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-100 text-blue-800"><MapPin size={28} strokeWidth={1.5} aria-hidden /></span>
            <ArrowUpRight size={23} className="text-blue-800 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </div>
          <h2 className="text-2xl font-semibold text-ink">地区知识</h2>
          <p className="mt-3 max-w-sm text-sm leading-7 text-ink-soft">看看各地的饮食特点，阅读与当地有关的寄生虫资料。</p>
          <p className="mt-5 text-sm font-medium text-blue-800">按省份浏览</p>
        </Link>
      </div>
    </div>
  );
}
