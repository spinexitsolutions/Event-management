import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * Accessible modal/drawer: focus is moved in and restored, Escape closes, background scroll locks.
 * `tone="admin"` uses the admin palette, `tone="site"` follows the public theme.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  tone = 'admin',
  side,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  tone?: 'admin' | 'site';
  /** Render as a right-hand drawer. */
  side?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[96vw]' }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-[150] flex', side ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-6')} role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            initial={side ? { x: 60, opacity: 0 } : { y: 30, opacity: 0 }}
            animate={side ? { x: 0, opacity: 1 } : { y: 0, opacity: 1 }}
            exit={side ? { x: 60, opacity: 0 } : { y: 30, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col shadow-2xl',
              side ? 'h-full max-h-none max-w-2xl' : `${width} rounded-t-2xl sm:rounded-2xl`,
              tone === 'admin' ? 'bg-white font-admin text-adm-ink' : 'bg-surface text-ink',
            )}
          >
            {title !== undefined && (
              <div className={cn('flex items-center justify-between gap-4 px-6 py-4', tone === 'admin' ? 'border-b border-adm-line' : 'border-b border-line')}>
                <h2 className={tone === 'admin' ? 'text-base font-semibold' : 'font-heading t-h4'}>{title}</h2>
                <button data-close onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 opacity-60 hover:bg-black/5 hover:opacity-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className={cn('flex flex-wrap items-center justify-end gap-2 px-6 py-4', tone === 'admin' ? 'border-t border-adm-line bg-adm-bg/50' : 'border-t border-line')}>{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
