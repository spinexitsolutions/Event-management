import { Facebook, Instagram, Linkedin, Twitter, Youtube, Music2, Video, Pin } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSite } from '@/app/SiteProvider';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { SmartLink } from '../ui/SmartLink';
import { Brand } from './Brand';

const SOCIAL = { instagram: Instagram, facebook: Facebook, youtube: Youtube, linkedin: Linkedin, x: Twitter, pinterest: Pin, tiktok: Music2, vimeo: Video } as const;

export function NewsletterForm({ compact, className }: { compact?: boolean; className?: string }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; msg?: string }>({ status: 'idle' });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!consent) return setState({ status: 'error', msg: 'Please confirm you would like to receive emails.' });
    setState({ status: 'loading' });
    try {
      await api.post('/public/newsletter', { email, consent: true });
      setState({ status: 'done', msg: 'Thank you — you are on the list.' });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', msg: errorMessage(err) });
    }
  };
  if (state.status === 'done') return <p className={cn('text-sm text-primary', className)} role="status">{state.msg}</p>;
  return (
    <form onSubmit={submit} className={cn('w-full', className)} noValidate>
      <div className="flex items-end gap-3">
        <label className="flex-1">
          <span className="sr-only">Email address</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" className="field-input" autoComplete="email" />
        </label>
        <button className="btn btn-primary btn-sm" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? '…' : 'Join'}
        </button>
      </div>
      <label className={cn('mt-3 flex items-start gap-2 text-xs opacity-70', compact && 'sr-only')}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-current" />
        I agree to receive occasional emails and can unsubscribe at any time.
      </label>
      {state.status === 'error' && <p className="field-error" role="alert">{state.msg}</p>}
    </form>
  );
}

export function SocialLinks({ className }: { className?: string }) {
  const { site } = useSite();
  if (!site?.social.length) return null;
  return (
    <div className={cn('flex gap-4', className)}>
      {site.social.map((s, i) => {
        const I = SOCIAL[s.network];
        return (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.network} className="opacity-70 transition hover:text-primary hover:opacity-100">
            <I className="h-[18px] w-[18px]" strokeWidth={1.4} />
          </a>
        );
      })}
    </div>
  );
}

export function Footer() {
  const { site, theme } = useSite();
  if (!site) return null;
  const style = theme.footer.style;
  const c = site.company;
  if (style === 'minimal')
    return (
      <footer className="border-t border-line py-10">
        <div className="container-site flex flex-col items-center justify-between gap-6 text-sm text-muted md:flex-row">
          <Brand />
          <p>{site.footer.legalText}</p>
          <SocialLinks />
        </div>
      </footer>
    );
  return (
    <footer className={cn('relative pt-24', style === 'dark' ? 'bg-contrast text-on-contrast [--c-text:var(--c-on-contrast)] [--c-muted:var(--c-on-contrast)]' : 'border-t border-line bg-surface')}>
      <div className="container-site">
        <div className="grid gap-14 border-b border-current/10 pb-16 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Brand light={style === 'dark' && theme.mode === 'light'} />
            {site.footer.blurb && <p className="mt-6 max-w-sm text-sm leading-relaxed opacity-70">{site.footer.blurb}</p>}
            <SocialLinks className="mt-8" />
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-5">
            {site.footer.columns.map((col, i) => (
              <div key={i}>
                <p className="eyebrow mb-5">{col.title}</p>
                <ul className="space-y-3 text-sm">
                  {col.links.map((l, j) => (
                    <li key={j}>
                      <SmartLink href={l.href} newTab={l.newTab} className="opacity-75 transition hover:text-primary hover:opacity-100">
                        {l.label}
                      </SmartLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="lg:col-span-3">
            <p className="eyebrow mb-5">Studio</p>
            <address className="space-y-2 text-sm not-italic opacity-75">
              {c.addressLine && <p>{c.addressLine}</p>}
              {(c.city || c.country) && <p>{[c.city, c.region, c.postalCode, c.country].filter(Boolean).join(', ')}</p>}
              {c.phone && (
                <p>
                  <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="hover:text-primary">
                    {c.phone}
                  </a>
                </p>
              )}
              {c.email && (
                <p>
                  <a href={`mailto:${c.email}`} className="hover:text-primary">
                    {c.email}
                  </a>
                </p>
              )}
              {c.hours && <p className="pt-2 text-xs opacity-80">{c.hours}</p>}
            </address>
            {theme.footer.showNewsletter && (
              <div className="mt-8">
                <p className="mb-1 text-sm">{site.newsletter.heading}</p>
                <NewsletterForm compact />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 py-8 text-xs opacity-60 md:flex-row">
          <p>{site.footer.legalText}</p>
          <div className="flex gap-6">
            {site.footer.legalLinks.map((l, i) => (
              <SmartLink key={i} href={l.href} className="hover:text-primary">
                {l.label}
              </SmartLink>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
