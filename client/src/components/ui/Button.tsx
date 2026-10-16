import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SmartLink } from './SmartLink';

type Variant = 'primary' | 'secondary' | 'ghost';
interface Common {
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

const classes = (variant: Variant, size: 'md' | 'sm', className?: string) => cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className);

export const Button = forwardRef<HTMLButtonElement, Common & ButtonHTMLAttributes<HTMLButtonElement>>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={classes(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = 'primary', size = 'md', icon, className, children, newTab }: Common & { href: string; newTab?: boolean }) {
  return (
    <SmartLink href={href} newTab={newTab} className={classes(variant, size, className)}>
      {icon}
      {children}
    </SmartLink>
  );
}
