import { motion, useReducedMotion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useSite } from '@/app/SiteProvider';
import { HeaderSpacer } from '@/components/layout/PublicLayout';
import { Reveal } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { ContactDetails } from '@/sections/conversion';
import { InquiryForm } from '../components/InquiryForm';
import { Breadcrumbs } from '../components/page';

export function InquirePage() {
  const reduce = useReducedMotion();
  return (
    <>
      <Seo title="Plan your event" description="Tell us about your celebration — a senior planner will respond personally within one business day." />
      <HeaderSpacer />
      <section className="container-site pb-section pt-12 md:pt-20">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <motion.div className="lg:col-span-4" initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
            <div className="lg:sticky lg:top-32">
              <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Inquire' }]} />
              <p className="eyebrow mb-5 mt-10">Begin</p>
              <h1 className="t-h1 text-balance">Tell us about your celebration</h1>
              <p className="lead mt-6">Share a few details — a senior planner will respond personally, usually within one business day.</p>
              <ol className="mt-12 hidden space-y-6 border-t border-line pt-10 lg:block">
                {['A planner reviews your brief', 'We arrange a consultation call', 'You receive a tailored proposal'].map((t, i) => (
                  <li key={t} className="flex gap-5">
                    <span className="font-heading text-sm text-primary">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-sm text-muted">{t}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-12 hidden border-t border-line pt-10 lg:block">
                <p className="eyebrow mb-6">Prefer to talk?</p>
                <ContactDetails className="text-sm" />
              </div>
            </div>
          </motion.div>
          <motion.div className="lg:col-span-8" initial={reduce ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}>
            <InquiryForm />
            <p className="mt-6 text-center text-xs text-muted">
              Already inquired?{' '}
              <Link to="/track" className="text-primary underline underline-offset-4">
                Track your inquiry
              </Link>
            </p>
          </motion.div>
        </div>
      </section>
    </>
  );
}

export function ThankYouPage() {
  const [params] = useSearchParams();
  const { site } = useSite();
  const state = (useLocation().state ?? {}) as { reference?: string; duplicate?: boolean; name?: string };
  const ref = (params.get('ref') || state.reference || '').toUpperCase();
  const [copied, setCopied] = useState(false);
  const steps = [
    { t: 'Keep your reference', d: 'It lets you check the status of your inquiry at any time.' },
    { t: 'A personal call', d: 'A senior planner reviews your brief and contacts you, usually within one business day.' },
    { t: 'Consultation', d: 'We meet — in person or online — to understand your vision, guests and priorities.' },
    { t: 'Your proposal', d: 'You receive a tailored proposal with design direction and transparent pricing in your client portal.' },
  ];
  return (
    <>
      <Seo title="Thank you" noIndex />
      <HeaderSpacer />
      <section className="container-site pb-section pt-16 md:pt-24">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary text-primary">
            <Check className="h-7 w-7" strokeWidth={1.25} />
          </span>
          <p className="eyebrow mt-10">Inquiry received</p>
          <h1 className="t-h1 mt-5 text-balance">{state.name ? `Thank you, ${state.name}.` : 'Thank you.'}</h1>
          <p className="lead mx-auto mt-6 max-w-xl">{(site?.inquiry.successMessage || 'A senior planner will be in touch within one business day.').replace(/^thank you[.,!—–\s-]*/i, '') || 'A senior planner will be in touch shortly.'}</p>
          {state.duplicate && <p className="mt-4 text-sm text-muted">We had already received this inquiry — here is its reference again.</p>}
          {ref && (
            <div className="mx-auto mt-12 inline-flex flex-col items-center border border-line px-10 py-7">
              <span className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.26em' }}>
                Your reference
              </span>
              <span className="mt-2 flex items-center gap-3">
                <span className="font-heading text-3xl tracking-wider md:text-4xl">{ref}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(ref).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="p-1.5 text-muted transition hover:text-primary"
                  aria-label="Copy reference"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </span>
              <span className="sr-only" aria-live="polite">
                {copied ? 'Reference copied' : ''}
              </span>
            </div>
          )}
        </Reveal>
        <div className="mx-auto mt-24 max-w-5xl">
          <p className="eyebrow mb-10 text-center">What happens next</p>
          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.t} delay={i * 0.08} className="border-t border-line pt-6">
                <span className="font-heading text-3xl text-primary/80">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="t-h4 mt-4 font-heading">{s.t}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              </Reveal>
            ))}
          </ol>
        </div>
        <div className="mt-20 flex flex-wrap justify-center gap-4">
          <Link to={ref ? `/track?ref=${encodeURIComponent(ref)}` : '/track'} className="btn btn-primary">
            Track your inquiry
          </Link>
          <Link to="/portfolio" className="btn btn-secondary">
            Explore our work
          </Link>
        </div>
      </section>
    </>
  );
}
