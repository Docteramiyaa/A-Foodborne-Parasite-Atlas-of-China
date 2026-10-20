import { Link } from 'react-router-dom';
import { useAtlas } from '@/lib/atlas';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { ROUTES } from '@/lib/site-nav';
import { FieldPageHeader, FieldTag } from '@/components/catalog/FieldNotes';

/**
 * 图鉴目录（/atlas）：三类知识的目录。
 * 只保留名称、类别、简短说明与进入链接，不复制地图、筛选或结果系统。
 */
export function AtlasHubPage() {
  useDocumentTitle('图鉴', '寄生虫、食物与处理方式、省级地区三类知识目录。');
  const { taxonomy, regions } = useAtlas();

  const regionTypeLabels = new Set<string>();
  for (const region of regions) {
    if (region.type === 'municipality') regionTypeLabels.add('直辖市');
    else if (region.type === 'autonomous-region') regionTypeLabels.add('自治区');
    else if (region.type === 'province') regionTypeLabels.add('省');
    else if (region.type === 'sar' || region.type === 'special') regionTypeLabels.add('特别行政区');
  }

  const entries = [
    {
      to: ROUTES.parasites,
      title: '寄生虫图鉴',
      description: '常见食源性寄生虫的名称、生活史、传播途径、风险场景与防护。',
      categories: taxonomy.parasiteCategories.map((category) => category.name),
    },
    {
      to: ROUTES.foods,
      title: '食物与处理方式',
      description: '按食物类别浏览常见食材，了解不同吃法对应的风险与更安全的做法。',
      categories: taxonomy.foodCategories.map((category) => category.name),
    },
    {
      to: ROUTES.regions,
      title: '地区',
      description: '按省级地区浏览各地的饮食特点，以及当地与食源性寄生虫相关的知识。',
      categories: [...regionTypeLabels],
    },
  ];

  return (
    <div data-testid="atlas-page" className="field-paper pb-14">
      <FieldPageHeader
        breadcrumbs={[{ label: '首页', to: ROUTES.home }, { label: '图鉴' }]}
        title="图鉴"
        lead="按名称与类别浏览寄生虫、食物和地区知识。"
      />

      <div className="mx-auto w-full max-w-shell px-5 pt-2 md:px-8 md:pt-4">
        <div className="border-t border-ink/30">
          {entries.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="group grid gap-3 border-b border-ink/25 py-7 transition duration-300 hover:bg-paper-light/40 md:py-8 lg:grid-cols-12 lg:items-center lg:gap-6"
            >
              <div className="min-w-0 lg:col-span-9">
                <h2 className="font-serif text-[clamp(1.4rem,2.2vw,1.85rem)] font-semibold leading-tight tracking-[0.01em] text-ink transition group-hover:text-terracotta-800">
                  {entry.title}
                </h2>
                <p className="mt-2 max-w-2xl font-kai text-[12.5px] leading-6 text-ink-muted">{entry.description}</p>
                {entry.categories.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entry.categories.map((category) => (
                      <FieldTag key={category}>{category}</FieldTag>
                    ))}
                  </div>
                )}
              </div>
              <div className="lg:col-span-3 lg:text-right">
                <span className="inline-flex items-center gap-2 border-b border-ink/70 pb-0.5 font-kai text-[12.5px] tracking-[0.05em] text-ink transition group-hover:border-terracotta-600 group-hover:text-terracotta-700">
                  进入
                  <span aria-hidden className="font-serif text-[15px] leading-none text-terracotta-700">
                    →
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
