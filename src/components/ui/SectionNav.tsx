import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SectionNavItem {
  id: string;
  label: string;
}

/** 详情页右侧/顶部粘性章节导航，基于 IntersectionObserver 高亮 */
export function SectionNav({ items, className, tone = 'dark' }: { items: SectionNavItem[]; className?: string; tone?: 'dark' | 'light' }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-100px 0px -55% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="章节导航" className={cn('text-xs', className)}>
      <ul className="space-y-0.5">
        {items.map((item, index) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  'group flex items-baseline gap-2 rounded-md py-1.5 pl-3 pr-2 transition',
                  isActive
                    ? tone === 'light'
                      ? 'bg-paper/10 text-paper'
                      : 'bg-blue-800/[0.07] text-ink'
                    : tone === 'light'
                      ? 'text-paper/55 hover:text-paper'
                      : 'text-ink-muted hover:text-ink',
                )}
              >
                <span className={cn('font-mono text-[12px] tabular-nums', isActive ? 'text-blue-700' : 'text-ink-faint')}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="leading-5">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
