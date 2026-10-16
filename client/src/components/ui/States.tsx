import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/api';

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded bg-current opacity-[0.08]', className)} aria-hidden />;

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60', className)} />;
}

export function EmptyState({ title, body, action, icon, className }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 opacity-50">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm opacity-70">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)} role="alert">
      <p className="font-medium">We couldn’t load this</p>
      <p className="mt-1 text-sm opacity-70">{errorMessage(error)}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 text-sm underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}
