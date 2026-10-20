import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[2px] font-kai font-medium tracking-[0.06em] transition duration-300 ease-atlas disabled:pointer-events-none disabled:opacity-45';

const VARIANTS: Record<Variant, string> = {
  primary:
    'border border-terracotta-700 bg-terracotta-700 text-paper-light shadow-[4px_4px_0_rgba(37,54,45,0.12)] hover:border-terracotta-800 hover:bg-terracotta-800 active:translate-y-px',
  secondary:
    'border border-ink/50 bg-paper-light/80 text-ink hover:border-ink hover:bg-paper-light active:translate-y-px',
  ghost: 'text-ink-soft hover:bg-ink/[0.05] hover:text-ink',
  outline: 'border border-ink/40 text-ink hover:border-ink hover:bg-ink hover:text-paper-light',
  danger: 'bg-terracotta-700 text-paper-light hover:bg-terracotta-800',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

export function buttonStyles(variant: Variant = 'primary', size: Size = 'md', className?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className, iconLeft, iconRight, children, ...rest }: ButtonProps) {
  return (
    <button className={buttonStyles(variant, size, className)} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: Variant;
  size?: Size;
  className?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export function ButtonLink({ variant = 'primary', size = 'md', className, iconLeft, iconRight, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonStyles(variant, size, className)} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'plain' | 'outline';
}

export function IconButton({ label, variant = 'plain', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-[2px] transition duration-300',
        variant === 'plain' && 'text-ink-soft hover:bg-ink/[0.06] hover:text-ink',
        variant === 'outline' && 'border border-line bg-paper-light/70 text-ink-soft hover:border-ink/30 hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

