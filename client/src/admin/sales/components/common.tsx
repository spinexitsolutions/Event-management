import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Badge, Field as KitField, Input, MoneyInput as KitMoneyInput, SearchInput as KitSearchInput, Select } from '@/admin/ui';
import type { ComponentProps } from 'react';
import { presetRange, RANGE_PRESETS, type RangePreset } from '../lib';

/** Small accessible info tooltip (hover, focus or tap). */
export function InfoTip({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full text-adm-muted hover:text-adm-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/40"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-lg bg-adm-dark px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-xl">
          {children}
        </span>
      )}
    </span>
  );
}

export interface DateRange { preset: RangePreset; from: string; to: string }
export const initialRange = (preset: Exclude<RangePreset, 'custom'> = '12m'): DateRange => ({ preset, ...presetRange(preset) });

/** Preset + custom date range picker. */
export function DateRangePicker({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Select
        aria-label="Date range"
        className="w-auto min-w-[150px]"
        value={value.preset}
        onChange={(e) => {
          const p = e.target.value as RangePreset;
          onChange(p === 'custom' ? { ...value, preset: 'custom' } : { preset: p, ...presetRange(p) });
        }}
        options={RANGE_PRESETS}
      />
      {value.preset === 'custom' && (
        <>
          <Input type="date" aria-label="From date" className="w-auto" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span className="text-xs text-adm-muted">to</span>
          <Input type="date" aria-label="To date" className="w-auto" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-adm-line/60', className)} aria-hidden />;
}

/** Panel error with retry, admin tone. */
export function PanelError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div role="alert" className="adm-card px-6 py-10 text-center">
      <p className="font-medium">We couldn’t load this</p>
      <p className="mt-1 text-sm text-adm-muted">{msg}</p>
      {onRetry && (
        <button className="adm-btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Pill-shaped segmented filter. */
export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn('rounded-full border px-3 py-1 text-xs transition', active ? 'border-adm-dark bg-adm-dark text-white' : 'border-adm-line bg-white text-adm-muted hover:text-adm-ink')}>
      {children}
    </button>
  );
}

/** Copyable text (invite links etc.). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <button
        type="button"
        className="adm-btn-secondary shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied to clipboard' : ''}
      </span>
    </div>
  );
}

/** Client portal account status. */
export function PortalBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge tone="gray">No account</Badge>;
  if (status === 'ACTIVE') return <Badge tone="green">Active</Badge>;
  if (status === 'INVITED') return <Badge tone="amber">Invited</Badge>;
  return <Badge tone="gray">{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

/*
 * The admin kit's .adm-input padding currently overrides Tailwind padding utilities (it is declared outside a
 * CSS layer), which makes the currency prefix / search icon overlap the text. These wrappers restore the padding.
 */
export function MoneyInput(p: ComponentProps<typeof KitMoneyInput>) {
  return (
    <div className="[&_input]:!pl-12">
      <KitMoneyInput {...p} />
    </div>
  );
}
export function SearchInput(p: ComponentProps<typeof KitSearchInput>) {
  return (
    <div className={cn('[&_input]:!pl-9 [&_input]:!pr-8', p.className)}>
      <KitSearchInput {...p} className={undefined} />
    </div>
  );
}

/** Kit Field wrapped in a <label> so its single control is programmatically labelled. Use only around ONE control. */
export function Field({ className, ...p }: ComponentProps<typeof KitField>) {
  return (
    <label className={cn('block', className)}>
      <KitField {...p} />
    </label>
  );
}
