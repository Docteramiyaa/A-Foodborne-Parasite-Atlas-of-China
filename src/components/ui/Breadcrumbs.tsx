import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items, tone = 'dark', className }: { items: Crumb[]; tone?: 'dark' | 'light'; className?: string }) {
  return (
    <nav aria-label="面包屑" className={className}>
      <ol className={cn('flex flex-wrap items-center gap-1.5 font-kai text-[11px] tracking-[0.06em]', tone === 'light' ? 'text-paper/50' : 'text-ink-muted')}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {item.to && !last ? (
                <Link to={item.to} className={cn('transition hover:underline', tone === 'light' ? 'hover:text-paper' : 'hover:text-ink')}>
                  {item.label}
                </Link>
              ) : (
                <span className={cn(last && (tone === 'light' ? 'text-paper/80' : 'text-ink-soft'))} aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight size={12} className="opacity-50" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
