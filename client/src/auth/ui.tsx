import { AlertCircle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useSite } from '@/app/SiteProvider';
import { HeaderSpacer } from '@/components/layout/PublicLayout';
import { Img } from '@/components/ui/Img';
import { Seo } from '@/components/ui/Seo';
import { cn } from '@/lib/cn';
import { passwordStrength } from './authUtils';

/** Split-screen frame for every auth page: cinematic photograph on desktop, focused form on the right. */
export function AuthShell({
  title,
  eyebrow,
  lead,
  image,
  quote = 'Every celebration, considered down to the last candle.',
  children,
}: {
  title: string;
  eyebrow?: string;
  lead?: ReactNode;
  image: string;
  quote?: string;
  children: ReactNode;
}) {
  const { site } = useSite();
  const brand = site?.brand.name ?? '';
  return (
    <>
      <Seo title={title} noIndex />
      <HeaderSpacer />
      <div className="container-site pb-16 pt-4 sm:pt-8 lg:pb-24">
        <div className="grid overflow-hidden border border-line bg-surface lg:min-h-[min(820px,calc(100vh-var(--header-h)-4rem))] lg:grid-cols-[1.1fr_1fr]" style={{ borderRadius: 'var(--radius)' }}>
          <aside className="on-image relative hidden min-h-[560px] overflow-hidden lg:block" aria-hidden={false}>
            <Img src={image} alt="" width={1200} sizes="50vw" priority className="absolute inset-0 h-full w-full object-cover" fallbackClassName="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 p-12 text-white xl:p-16">
              <p className="text-[0.7rem] uppercase text-white/70" style={{ letterSpacing: '0.32em' }}>
                {brand}
              </p>
              <div className="my-6 h-px w-16 bg-primary" />
              <p className="max-w-md font-heading text-[2.4rem] leading-[1.1] xl:text-[2.9rem]">{quote}</p>
              {site?.brand.tagline && <p className="mt-5 text-sm text-white/70">{site.brand.tagline}</p>}
            </div>
          </aside>
          <section className="flex flex-col">
            <div className="relative h-36 overflow-hidden lg:hidden">
              <Img src={image} alt="" width={800} className="absolute inset-0 h-full w-full object-cover" fallbackClassName="absolute inset-0" />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" aria-hidden />
            </div>
            <div className="flex flex-1 items-center px-6 pb-12 pt-4 sm:px-12 lg:px-14 lg:py-16 xl:px-20">
              <div className="mx-auto w-full max-w-[26rem]">
                {eyebrow && <p className="eyebrow">{eyebrow}</p>}
                <h1 className="t-h2 mt-3">{title}</h1>
                {lead && <div className="mt-4 text-[0.95rem] leading-relaxed text-muted">{lead}</div>}
                <div className="mt-9">{children}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; trailing?: ReactNode };

export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField({ label, error, hint, trailing, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [error ? `${fid}-err` : '', hint ? `${fid}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={fid} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input ref={ref} id={fid} className={cn('field-input', trailing && 'pr-10')} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <div id={`${fid}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${fid}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, Omit<FieldProps, 'type' | 'trailing'>>(function PasswordField(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      ref={ref}
      type={show ? 'text' : 'password'}
      {...props}
      trailing={
        <button type="button" onClick={() => setShow((s) => !s)} className="p-2 text-muted transition-colors hover:text-primary" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
});

export function StrengthMeter({ value }: { value: string }) {
  const s = passwordStrength(value);
  const tone = s.score <= 1 ? 'bg-danger' : s.score === 2 ? 'bg-warning' : 'bg-success';
  return (
    <div className="mt-2.5" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-[3px] flex-1 rounded-full transition-colors duration-500', value && i <= s.score ? tone : 'bg-line')} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {s.label && <span className="mr-1.5 font-medium text-ink">{s.label}.</span>}
        {s.hint}
      </p>
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'success' | 'error'; children: ReactNode; className?: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 border px-4 py-3.5 text-sm leading-relaxed',
        tone === 'success' && 'border-success/40 bg-success/10',
        tone === 'error' && 'border-danger/40 bg-danger/10',
        tone === 'info' && 'border-primary/30 bg-primary/[0.07]',
        className,
      )}
      style={{ borderRadius: 'var(--radius)' }}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'success' ? 'text-success' : tone === 'error' ? 'text-danger' : 'text-primary')} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
