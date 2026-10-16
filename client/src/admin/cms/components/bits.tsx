import { AlertTriangle, Check, CloudOff, Film, Image as ImageIcon, Loader2, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Blocker } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Img } from '@/components/ui/Img';
import { cn } from '@/lib/cn';
import type { SaveStatus } from '../lib/hooks';

export function SaveStatusPill({ status, error, onRetry, className }: { status: SaveStatus; error?: string | null; onRetry?: () => void; className?: string }) {
  const map: Record<SaveStatus, { label: string; icon: ReactNode; cls: string }> = {
    saved: { label: 'Draft saved', icon: <Check className="h-3.5 w-3.5" />, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    unsaved: { label: 'Unsaved changes', icon: <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />, cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
    saving: { label: 'Saving…', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, cls: 'bg-neutral-50 text-neutral-600 ring-neutral-200' },
    error: { label: 'Not saved', icon: <CloudOff className="h-3.5 w-3.5" />, cls: 'bg-red-50 text-red-700 ring-red-200' },
  };
  const m = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', m.cls, className)} aria-live="polite" title={error ?? undefined}>
      {m.icon}
      {m.label}
      {status === 'error' && onRetry && (
        <button type="button" onClick={onRetry} className="ml-1 underline underline-offset-2 hover:no-underline">
          Retry
        </button>
      )}
    </span>
  );
}

/** Confirmation shown when a router navigation is blocked by unsaved changes. */
export function UnsavedDialog({ blocker, onSave }: { blocker: Blocker; onSave?: () => Promise<void> }) {
  const open = blocker.state === 'blocked';
  return (
    <Modal
      open={open}
      onClose={() => blocker.state === 'blocked' && blocker.reset()}
      title="Leave without saving?"
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
            Stay here
          </button>
          {onSave && (
            <button
              className="adm-btn-secondary"
              onClick={async () => {
                try {
                  await onSave();
                  if (blocker.state === 'blocked') blocker.proceed();
                } catch {
                  if (blocker.state === 'blocked') blocker.reset();
                }
              }}
            >
              Save &amp; leave
            </button>
          )}
          <button className="adm-btn-danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
            Leave anyway
          </button>
        </>
      }
    >
      <p className="text-sm text-adm-muted">Some changes have not been saved yet. If you leave now they will be lost.</p>
    </Modal>
  );
}

export type Device = 'desktop' | 'tablet' | 'mobile';
export const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, tablet: 834, mobile: 390 };
const DEVICE_ICON: Record<Device, LucideIcon> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };

export function DeviceSwitcher({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-adm-line bg-white p-0.5" role="radiogroup" aria-label="Preview device">
      {(Object.keys(DEVICE_WIDTH) as Device[]).map((d) => {
        const I = DEVICE_ICON[d];
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value === d}
            onClick={() => onChange(d)}
            title={`${d[0].toUpperCase() + d.slice(1)} (${DEVICE_WIDTH[d]}px)`}
            className={cn('rounded-md p-1.5 transition', value === d ? 'bg-adm-dark text-white' : 'text-adm-muted hover:text-adm-ink')}
          >
            <I className="h-4 w-4" />
            <span className="sr-only">{d}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CharCount({ value, max, recommended }: { value: string; max: number; recommended?: number }) {
  const n = value.length;
  return (
    <span className={cn('text-[11px] tabular-nums', n > max ? 'text-red-600' : recommended && n > recommended ? 'text-amber-700' : 'text-adm-muted')}>
      {n}/{max}
    </span>
  );
}

/** Admin thumbnail: Img with a calm icon fallback (missing or blocked images). */
export function Thumb({ src, alt = '', kind = 'IMAGE', className, width = 400 }: { src?: string | null; alt?: string; kind?: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; className?: string; width?: number }) {
  const I = kind === 'VIDEO' ? Film : ImageIcon;
  const video = kind === 'VIDEO' || (src && /\.(mp4|webm)(\?|$)/i.test(src));
  return (
    <div className={cn('relative overflow-hidden bg-[#F1EDE5]', className)}>
      <I className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-adm-muted/60" aria-hidden />
      {src && !video && <Img src={src} alt={alt} width={width} className="absolute inset-0 h-full w-full object-cover" fallbackClassName="opacity-0" />}
      {src && video && <video src={src} muted preload="metadata" className="absolute inset-0 h-full w-full object-cover" aria-label={alt || 'Video'} />}
    </div>
  );
}

export function RangeField({ id, value, min, max, step, onChange, format }: { id?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-[#B8955A] [color-scheme:light]" />
      <span className="w-12 text-right text-xs tabular-nums text-adm-muted">{format ? format(value) : value}</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-adm-line bg-adm-bg/60 p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-md transition', size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm', value === o.value ? 'bg-white font-medium text-adm-ink shadow-sm ring-1 ring-adm-line' : 'text-adm-muted hover:text-adm-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Callout({ tone = 'info', children, className, title }: { tone?: 'info' | 'warn' | 'danger' | 'gold'; children: ReactNode; className?: string; title?: ReactNode }) {
  const cls = { info: 'border-sky-200 bg-sky-50 text-sky-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', danger: 'border-red-200 bg-red-50 text-red-800', gold: 'border-[#E6D7B5] bg-[#FBF7EE] text-[#5E4920]' }[tone];
  return (
    <div className={cn('rounded-lg border px-3 py-2.5 text-xs leading-relaxed', cls, className)} role={tone === 'danger' ? 'alert' : undefined}>
      {title && (
        <p className="mb-0.5 flex items-center gap-1.5 font-semibold">
          {(tone === 'warn' || tone === 'danger') && <AlertTriangle className="h-3.5 w-3.5" />}
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

/** Small uppercase heading used to group fields inside editor panels. */
export function FieldGroup({ title, children, description, className }: { title?: ReactNode; children: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('space-y-4', className)}>
      {title && (
        <legend className="mb-1 w-full">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted">{title}</span>
          {description && <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-adm-muted">{description}</span>}
        </legend>
      )}
      {children}
    </fieldset>
  );
}
