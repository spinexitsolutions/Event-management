import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, File, FileImage, FileSignature, FileSpreadsheet, FileText, Info, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { Field, Textarea } from '@/admin/ui';
import type { BookingListItem, VendorLite } from '../types';

export function Alert({ tone = 'warn', title, children, className }: { tone?: 'warn' | 'error' | 'info' | 'good'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  const Icon = tone === 'good' ? Check : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', styles, className)} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, total, className, label }: { value: number; total: number; className?: string; label?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className={className}>
      <div className="h-1.5 overflow-hidden rounded-full bg-adm-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label ?? 'Progress'}>
        <div className="h-full rounded-full bg-adm-gold transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Generic async search/select (combobox) used for clients, bookings and vendors. */
export function AsyncPicker<T extends { id: string }>({
  label,
  value,
  onChange,
  fetcher,
  queryKey,
  render,
  display,
  placeholder = 'Search…',
  required,
  error,
  disabled,
}: {
  label: string;
  value: T | null;
  onChange: (v: T | null) => void;
  fetcher: (q: string) => Promise<T[]>;
  queryKey: string;
  render: (item: T) => ReactNode;
  display: (item: T) => string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const res = useQuery({ queryKey: ['picker', queryKey, debounced], queryFn: () => fetcher(debounced), enabled: open && !value });
  const items = res.data ?? [];
  const choose = (item: T) => {
    onChange(item);
    setOpen(false);
    setQ('');
  };
  return (
    <Field label={label} required={required} error={error}>
      <div ref={wrap} className="relative">
        {value ? (
          <div className="adm-input flex items-center justify-between gap-2">
            <span className="truncate">{display(value)}</span>
            {!disabled && (
              <button type="button" className="rounded p-0.5 text-adm-muted hover:text-adm-ink" onClick={() => onChange(null)} aria-label={`Clear ${label}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <input
            id={id}
            className="adm-input"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-label={label}
            aria-invalid={!!error || undefined}
            placeholder={placeholder}
            value={q}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && items[active]) {
                e.preventDefault();
                choose(items[active]);
              } else if (e.key === 'Escape') setOpen(false);
            }}
          />
        )}
        {open && !value && (
          <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-adm-line bg-white py-1 shadow-xl">
            {res.isLoading && <li className="px-3 py-2 text-sm text-adm-muted">Searching…</li>}
            {res.isError && <li className="px-3 py-2 text-sm text-red-600">Search failed</li>}
            {!res.isLoading && !items.length && <li className="px-3 py-2 text-sm text-adm-muted">No matches</li>}
            {items.map((item, i) => (
              <li
                key={item.id}
                role="option"
                aria-selected={i === active}
                className={cn('cursor-pointer px-3 py-2 text-sm', i === active ? 'bg-adm-bg' : 'hover:bg-adm-bg')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(item);
                }}
              >
                {render(item)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

export interface ClientLite {
  id: string;
  name: string;
  email: string;
  company?: string;
}
export function ClientPicker(p: { value: ClientLite | null; onChange: (c: ClientLite | null) => void; error?: string; required?: boolean }) {
  return (
    <AsyncPicker<ClientLite>
      label="Client"
      queryKey="clients"
      placeholder="Search by name, email or company…"
      fetcher={(q) => api.get<ClientLite[]>('/admin/clients', { q, limit: 10 })}
      display={(c) => `${c.name} · ${c.email}`}
      render={(c) => (
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-adm-muted">
            {c.email}
            {c.company ? ` · ${c.company}` : ''}
          </p>
        </div>
      )}
      {...p}
    />
  );
}

export function BookingPicker(p: { value: BookingListItem | null; onChange: (b: BookingListItem | null) => void; error?: string; required?: boolean; label?: string }) {
  return (
    <AsyncPicker<BookingListItem>
      label={p.label ?? 'Booking'}
      queryKey="bookings"
      placeholder="Search reference, title or client…"
      fetcher={(q) => api.get<BookingListItem[]>('/admin/bookings', { q, limit: 10, scope: 'all' })}
      display={(b) => [b.reference, b.title].filter(Boolean).join(' · ')}
      render={(b) => (
        <div>
          <p className="font-medium">
            {b.reference} · {b.title}
          </p>
          <p className="text-xs text-adm-muted">
            {b.client.name} · {fmtDate(b.eventDate)}
          </p>
        </div>
      )}
      {...p}
    />
  );
}

export function VendorPicker(p: { value: VendorLite | null; onChange: (v: VendorLite | null) => void; error?: string; required?: boolean; label?: string }) {
  return (
    <AsyncPicker<VendorLite>
      label={p.label ?? 'Vendor'}
      queryKey="vendors"
      placeholder="Search vendors…"
      fetcher={(q) => api.get<VendorLite[]>('/admin/vendors', { q, limit: 12 })}
      display={(v) => [v.name, v.category].filter(Boolean).join(' · ')}
      render={(v) => (
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">{v.name}</p>
            <p className="text-xs text-adm-muted">{v.category}</p>
          </div>
          {v.status !== 'ACTIVE' && <span className="text-xs text-adm-muted">{v.status.toLowerCase()}</span>}
        </div>
      )}
      {...p}
    />
  );
}

/** Small modal asking for a mandatory reason (void invoice, override, etc.). */
export function ReasonDialog({
  open,
  title,
  description,
  label = 'Reason',
  confirmLabel = 'Confirm',
  danger,
  minLength = 3,
  loading,
  error,
  onSubmit,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  label?: string;
  confirmLabel?: string;
  danger?: boolean;
  minLength?: number;
  loading?: boolean;
  error?: string | null;
  onSubmit: (reason: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const valid = reason.trim().length >= minLength;
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
          <button className={danger ? 'adm-btn-danger' : 'adm-btn-primary'} disabled={!valid || loading} onClick={() => onSubmit(reason.trim())}>
            {loading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {description && <div className="text-sm text-adm-muted">{description}</div>}
        {children}
        <Field label={label} required hint={`At least ${minLength} characters. Recorded in the audit log.`}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

export function DocIcon({ name, kind, className }: { name: string; kind?: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const Icon = kind === 'SIGNED_CONTRACT' || kind === 'CONTRACT' ? FileSignature : /^(png|jpe?g|webp|gif|avif|svg)$/.test(ext) ? FileImage : /^(csv|xlsx?)$/.test(ext) ? FileSpreadsheet : /^(pdf|docx?|txt|md)$/.test(ext) ? FileText : File;
  return <Icon className={cn('h-5 w-5 text-adm-gold', className)} aria-hidden />;
}

export function SectionEmpty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-adm-bg text-adm-gold">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-adm-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="adm-card px-6 py-10 text-center" role="alert">
      <p className="font-medium">We couldn’t load this</p>
      <p className="mt-1 text-sm text-adm-muted">{error instanceof Error ? error.message : 'Something went wrong'}</p>
      {onRetry && (
        <button className="adm-btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export const SkeletonRows = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3" aria-hidden>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-12 animate-pulse rounded-lg bg-adm-line/60" />
    ))}
  </div>
);
