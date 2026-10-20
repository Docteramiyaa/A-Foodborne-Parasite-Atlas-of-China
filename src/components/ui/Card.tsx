import type { HTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Card({ className, children, elevated, ...rest }: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={cn(
        'border border-ink/30 bg-paper-light/75',
        elevated ? 'shadow-lift' : 'shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardLinkProps extends Omit<LinkProps, 'className'> {
  className?: string;
  children: ReactNode;
}

export function CardLink({ className, children, ...rest }: CardLinkProps) {
  return (
    <Link
      className={cn(
        'card-lift group relative block border border-ink/30 bg-paper-light/75 shadow-card focus-visible:outline-none',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function CardArrow({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center border border-ink/30 text-ink-muted transition duration-300 group-hover:border-terracotta-700 group-hover:bg-terracotta-700 group-hover:text-paper-light',
        className,
      )}
    >
      <ArrowUpRight size={15} strokeWidth={1.8} />
    </span>
  );
}

