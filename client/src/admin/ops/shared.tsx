/**
 * Local helpers for the operations & administration area (calendar, vendors, venues, inventory, staff, settings).
 * Kept inside `admin/ops` so other areas are unaffected.
 */
import { useQuery } from '@tanstack/react-query';
import { Lock, Plus, ShieldAlert, X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Permission } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface StaffLite {
  id: string;
  name: string;
  roleKey: string;
  title: string | null;
}

/** Active staff (any staff member may read it) — used for assignee pickers and filters. */
export function useStaffDirectory() {
  return useQuery({ queryKey: ['staff-directory'], queryFn: () => api.get<StaffLite[]>('/admin/staff-directory'), staleTime: 5 * 60_000 });
}

/** Renders children only when the user holds at least one of the permissions; otherwise a calm "no access" panel. */
export function RequirePerm({ any, children }: { any: Permission[]; children: ReactNode }) {
  const { canAny, loading } = useAuth();
  if (loading) return null;
  if (!canAny(...any)) return <NoAccess />;
  return <>{children}</>;
}

export function NoAccess({ message }: { message?: string }) {
  return (
    <div className="adm-card mx-auto mt-10 flex max-w-lg flex-col items-center px-8 py-14 text-center" role="alert">
      <ShieldAlert className="h-8 w-8 text-adm-gold" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold">You don’t have access to this area</h1>
      <p className="mt-1 text-sm text-adm-muted">{message ?? 'Ask an administrator to grant the required permission to your role.'}</p>
    </div>
  );
}

/** Inline error panel for admin cards. */
export function AdmError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div className={cn('rounded-xl border border-red-200 bg-red-50/60 px-5 py-6 text-center text-sm', className)} role="alert">
      <p className="font-medium text-red-800">We couldn’t load this</p>
      <p className="mt-1 text-red-700/80">{msg}</p>
      {onRetry && (
        <button className="adm-btn-secondary mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-adm-line/60" />
      ))}
    </div>
  );
}

/** Highlighted box for internal-only information. */
export function InternalNote({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border border-dashed border-[#E6D7B5] bg-[#FBF7EE] px-3 py-2 text-xs text-[#7A5F2B]', className)}>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children ?? 'Internal — not visible to clients.'}</span>
    </div>
  );
}

/** Editable list of short strings (facilities, service areas, checklist items…). */
export function ChipsInput({ value, onChange, placeholder = 'Add and press Enter', max = 50, disabled, id, suggestions }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; disabled?: boolean; id?: string; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p.slice(0, 80));
    onChange(next);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };
  const listId = id ? `${id}-suggest` : undefined;
  return (
    <div className={cn('adm-input flex min-h-[40px] flex-wrap items-center gap-1.5 py-1.5', disabled && 'bg-adm-bg')}>
      {value.map((v, i) => (
        <span key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-adm-bg px-2 py-0.5 text-xs ring-1 ring-inset ring-adm-line">
          {v}
          {!disabled && (
            <button type="button" className="text-adm-muted hover:text-red-600" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <>
          <input
            id={id}
            className="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-adm-muted/70"
            value={text}
            list={listId}
            placeholder={value.length >= max ? `Maximum ${max}` : placeholder}
            disabled={value.length >= max}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => text && add(text)}
          />
          {suggestions && listId && (
            <datalist id={listId}>
              {suggestions.filter((s) => !value.includes(s)).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      )}
    </div>
  );
}

/** Small "add row" button used by repeatable editors. */
export function AddRowButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="adm-btn-ghost px-2 py-1 text-xs text-adm-gold hover:text-adm-ink" onClick={onClick} disabled={disabled}>
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

/** Field errors from a 422 ApiError, keyed by path. */
export const fieldErrorsOf = (err: unknown): Record<string, string> => (err instanceof ApiError ? err.fieldErrors : {});

/** Star rating display / input (1–5). */
export function Stars({ value, onChange, size = 'sm', label = 'Rating' }: { value: number | null | undefined; onChange?: (v: number | null) => void; size?: 'sm' | 'md'; label?: string }) {
  const s = size === 'sm' ? 'text-sm' : 'text-lg';
  if (!onChange) {
    if (!value) return <span className="text-xs text-adm-muted">Not rated</span>;
    return (
      <span className={cn('tracking-tight text-adm-gold', s)} aria-label={`${value} out of 5`}>
        {'★'.repeat(value)}
        <span className="text-adm-line">{'★'.repeat(5 - value)}</span>
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(value === n ? null : n)}
          className={cn('rounded px-0.5 text-xl leading-none transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/40', (value ?? 0) >= n ? 'text-adm-gold' : 'text-adm-line')}
        >
          ★
        </button>
      ))}
      {value ? (
        <button type="button" className="ml-2 text-xs text-adm-muted underline-offset-2 hover:underline" onClick={() => onChange(null)}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

/** Copy-to-clipboard button with feedback. */
export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn('adm-btn-secondary px-2.5 py-1.5 text-xs', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
    >
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  );
}

/** Local YYYY-MM-DD for a Date. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Parses YYYY-MM-DD as a local date (midnight). */
export const parseYmd = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
export const addDaysLocal = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** Monday-based start of week. */
export const startOfWeek = (d: Date) => addDaysLocal(startOfDay(d), -((d.getDay() + 6) % 7));
/** Value for <input type="datetime-local"> from a Date. */
export const toLocalInput = (d: Date) => `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
