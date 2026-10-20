import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-sans font-medium transition duration-300 ease-atlas disabled:pointer-events-none disabled:border-line disabled:bg-paper-deep disabled:text-ink-muted';

const VARIANTS: Record<Variant, string> = {
  primary:
    'border border-blue-700 bg-blue-700 text-white hover:border-blue-900 hover:bg-blue-900 active:translate-y-px',
  secondary:
    'border border-line-strong bg-white text-blue-700 hover:border-blue-700 hover:bg-blue-50 active:translate-y-px',
  ghost: 'text-ink-soft hover:bg-ink/[0.05] hover:text-ink',
  outline: 'border border-line-strong text-blue-700 hover:border-blue-700 hover:bg-blue-50',
  danger: 'bg-terracotta-700 text-white hover:bg-terracotta-800',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[14px]',
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
        'inline-flex h-10 w-10 items-center justify-center rounded-xl transition duration-200',
        variant === 'plain' && 'text-ink-soft hover:bg-ink/[0.06] hover:text-ink',
        variant === 'outline' && 'border border-line bg-paper-light/70 text-ink-soft hover:border-line hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

