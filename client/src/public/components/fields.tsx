import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Labelled public form field with error message wired to aria-describedby. */
export function FieldWrap({ id, label, error, hint, children, className, optional }: { id: string; label: string; error?: string; hint?: string; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="ml-2 normal-case tracking-normal opacity-60">(optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; wrapClassName?: string; optional?: boolean };
export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ id, label, error, hint, wrapClassName, optional, className, ...rest }, ref) {
  const fid = id ?? rest.name ?? label;
  return (
    <FieldWrap id={fid} label={label} error={error} hint={hint} className={wrapClassName} optional={optional}>
      <input ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, error, hint)} className={cn('field-input', className)} {...rest} />
    </FieldWrap>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string; wrapClassName?: string; optional?: boolean };
export const TextArea = forwardRef<HTMLTextAreaElement, AreaProps>(function TextArea({ id, label, error, hint, wrapClassName, optional, className, rows = 3, ...rest }, ref) {
  const fid = id ?? rest.name ?? label;
  return (
    <FieldWrap id={fid} label={label} error={error} hint={hint} className={wrapClassName} optional={optional}>
      <textarea ref={ref} id={fid} rows={rows} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, error, hint)} className={cn('field-input resize-y', className)} {...rest} />
    </FieldWrap>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; wrapClassName?: string; children: ReactNode };
export const SelectInput = forwardRef<HTMLSelectElement, SelectProps>(function SelectInput({ id, label, error, hint, wrapClassName, className, children, ...rest }, ref) {
  const fid = id ?? rest.name ?? label;
  return (
    <FieldWrap id={fid} label={label} error={error} hint={hint} className={wrapClassName}>
      <select ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, error, hint)} className={cn('field-input cursor-pointer appearance-none bg-[length:12px] bg-[right_2px_center] bg-no-repeat [&>option]:bg-surface [&>option]:text-ink', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%23999' stroke-width='1.4'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\")" }} {...rest}>
        {children}
      </select>
    </FieldWrap>
  );
});

/** Visually hidden honeypot. Bots fill it; people never see it. */
export function Honeypot({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange?.(e.target.value)} />
      </label>
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id: string) => void };
  }
}

/** Cloudflare Turnstile widget — only rendered when the server has a site key configured. */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string | undefined) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let widget: string | null = null;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, callback: (t: string) => cb.current(t), 'expired-callback': () => cb.current(undefined), theme: 'auto' });
    };
    if (window.turnstile) mount();
    else {
      let s = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (!s) {
        s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.dataset.turnstile = '1';
        document.head.appendChild(s);
      }
      s.addEventListener('load', mount);
    }
    return () => {
      cancelled = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey]);
  if (!siteKey) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
