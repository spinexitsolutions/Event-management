/**
 * Admin UI kit (fixed calm palette, independent of the public theme).
 * Every admin screen should compose these primitives for consistency.
 */
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { titleCase } from '@/lib/format';

export function PageHeader({ title, subtitle, actions, back, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; children?: ReactNode }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-xs text-adm-muted hover:text-adm-ink">
          <ChevronLeft className="h-3.5 w-3.5" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-adm-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('adm-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-adm-line px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'gold' | 'warn' | 'good' }) {
  return (
    <div className="adm-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-adm-muted">{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', tone === 'gold' && 'text-adm-gold', tone === 'warn' && 'text-amber-600', tone === 'good' && 'text-emerald-700')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-adm-muted">{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  gray: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  gold: 'bg-[#F5EEDF] text-[#7A5F2B] ring-[#E6D7B5]',
};
export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  NEW: 'blue', CONTACTED: 'violet', CONSULTATION_SCHEDULED: 'violet', REQUIREMENTS_RECEIVED: 'violet', QUOTATION_SENT: 'amber', NEGOTIATION: 'amber', WON: 'green', LOST: 'red', ARCHIVED: 'gray',
  DRAFT: 'gray', SENT: 'blue', VIEWED: 'violet', REVISION_REQUESTED: 'amber', ACCEPTED: 'green', REJECTED: 'red', EXPIRED: 'gray', CONVERTED: 'gold',
  AWAITING_CONTRACT: 'amber', AWAITING_ADVANCE: 'amber', CONFIRMED: 'green', IN_PROGRESS: 'violet', AWAITING_FINAL_PAYMENT: 'amber', COMPLETED: 'gold', CANCELLED: 'red',
  CREATED: 'gray', PAID: 'green', FAILED: 'red', REFUNDED: 'gray', PARTIALLY_REFUNDED: 'amber', PENDING: 'amber', PARTIAL: 'amber', WAIVED: 'gray',
  ISSUED: 'blue', PARTIALLY_PAID: 'amber', VOID: 'gray', PUBLISHED: 'green', UNPUBLISHED: 'gray',
  TODO: 'gray', BLOCKED: 'red', DONE: 'green', OPEN: 'amber', APPROVED: 'green', DECLINED: 'red', REQUESTED: 'amber', PROCESSED: 'green',
  QUEUED: 'blue', SKIPPED: 'gray', ACTIVE: 'green', INVITED: 'amber', DEACTIVATED: 'gray', UNPAID: 'amber',
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{label ?? titleCase(status)}</Badge>;
}

/* ───── Form controls ───── */

export function Field({ label, error, hint, children, className, required }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={className}>
      {label && (
        <span className="adm-label">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </span>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-adm-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} className={cn('adm-input', className)} aria-invalid={invalid || undefined} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, rows = 4, ...p }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('adm-input', className)} aria-invalid={invalid || undefined} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options?: { value: string; label: string }[] }>(function Select({ className, invalid, options, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn('adm-input pr-8', className)} aria-invalid={invalid || undefined} {...p}>
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
});

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('inline-flex cursor-pointer select-none items-center gap-2.5 text-sm', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-adm-gold' : 'bg-neutral-300')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

/** Money input in major units; emits integer minor units (or null when empty). */
export function MoneyInput({ value, onChange, currency = 'INR', invalid, placeholder, allowEmpty, ...rest }: { value: number | null | undefined; onChange: (minor: number | null) => void; currency?: string; invalid?: boolean; placeholder?: string; allowEmpty?: boolean; disabled?: boolean; id?: string }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : (Number(value) / 100).toString());
  useEffect(() => {
    const cur = text === '' ? null : Math.round(Number(text.replace(/,/g, '')) * 100);
    if (cur !== (value ?? null)) setText(value === null || value === undefined ? '' : (Number(value) / 100).toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-adm-muted">{currency}</span>
      <input
        inputMode="decimal"
        className="adm-input pl-12 tabular-nums"
        aria-invalid={invalid || undefined}
        value={text}
        placeholder={placeholder ?? '0.00'}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,]/g, '');
          setText(v);
          const clean = v.replace(/,/g, '');
          if (clean === '') return onChange(allowEmpty ? null : 0);
          if (/^\d+(\.\d{0,2})?$/.test(clean)) onChange(Math.round(Number(clean) * 100));
        }}
        {...rest}
      />
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 300);
    return () => clearTimeout(t);
  }, [v, value, onChange]);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-muted" />
      <input className="adm-input pl-9 pr-8" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {v && (
        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-adm-muted" onClick={() => setV('')} aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ───── Tables & lists ───── */

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}
export function DataTable<T>({ columns, rows, rowKey, onRowClick, loading, empty, className, rowClassName }: { columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string; onRowClick?: (r: T) => void; loading?: boolean; empty?: ReactNode; className?: string; rowClassName?: (r: T) => string | undefined }) {
  return (
    <div className={cn('adm-card overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="adm-table">
          <thead className="bg-adm-bg/60">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <div className="h-4 w-3/4 animate-pulse rounded bg-adm-line/70" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              rows?.map((r) => (
                <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && 'cursor-pointer', rowClassName?.(r))}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && !rows?.length && <div className="px-6 py-14 text-center text-sm text-adm-muted">{empty ?? 'Nothing here yet.'}</div>}
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total?: number; onPage: (p: number) => void }) {
  if (pages <= 1) return total !== undefined ? <p className="mt-3 text-xs text-adm-muted">{total} total</p> : null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-xs text-adm-muted">
        Page {page} of {pages}
        {total !== undefined && ` · ${total} total`}
      </span>
      <div className="flex gap-1">
        <button className="adm-btn-secondary px-2" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="adm-btn-secondary px-2" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('-mx-1 flex gap-1 overflow-x-auto border-b border-adm-line', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition', value === t.value ? 'border-adm-gold font-medium text-adm-ink' : 'border-transparent text-adm-muted hover:text-adm-ink')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-adm-bg px-1.5 text-xs text-adm-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose, children }: { open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className={danger ? 'adm-btn-danger' : 'adm-btn-primary'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {body && <div className="text-sm text-adm-muted">{body}</div>}
      {children}
    </Modal>
  );
}

export function KeyValue({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 text-sm', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-adm-muted">{k}</dt>
          <dd className="mt-0.5 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export const AdminSpinner = () => (
  <div className="flex justify-center py-16" role="status" aria-label="Loading">
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-adm-gold border-t-transparent" />
  </div>
);
