import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useSite } from '@/app/SiteProvider';
import { NewsletterForm, SocialLinks } from '@/components/layout/Footer';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';
import { ContactForm } from '@/public/components/ContactForm';
import { InquiryForm } from '@/public/components/InquiryForm';
import { SectionHeader, SectionShell } from './Shell';
import type { SectionRenderProps } from './types';
import { Ctas, ParallaxImage } from './ui';

const lvl = (i: number) => (i === 0 ? 1 : 2);

/* ───────────── CTA ───────────── */

export function CtaSection({ section, index }: SectionRenderProps<'cta'>) {
  const p = section.props;
  const H = index === 0 ? 'h1' : 'h2';
  const copy = (center: boolean) => (
    <>
      {p.eyebrow && <p className="eyebrow mb-6">{p.eyebrow}</p>}
      {p.heading && <H className="t-h1 text-balance">{p.heading}</H>}
      {(p.body || p.subheading) && <p className={cn('lead mt-6 max-w-xl', center && 'mx-auto')}>{p.body || p.subheading}</p>}
      <Ctas ctas={p.ctas} className={cn('mt-10', center && 'justify-center')} />
    </>
  );
  if (p.variant === 'image' && p.imageUrl) {
    return (
      <SectionShell id={section.id} props={{ ...p, background: { variant: 'image', imageUrl: p.imageUrl, overlay: Math.max(p.background.overlay, 0.45) } }} className="!py-[calc(var(--section-y)*1.3)]">
        <Reveal className="container-site mx-auto max-w-4xl text-center">{copy(true)}</Reveal>
      </SectionShell>
    );
  }
  if (p.variant === 'split') {
    return (
      <SectionShell id={section.id} props={p} pad={false}>
        <div className="grid md:grid-cols-2">
          {p.imageUrl ? <ParallaxImage src={p.imageUrl} alt="" className="min-h-[360px] md:min-h-[560px]" sizes="(max-width: 768px) 100vw, 50vw" /> : <div className="bg-surface-2" />}
          <div className="flex items-center px-5 py-20 sm:px-8 md:px-16 lg:px-24">
            <Reveal>{copy(false)}</Reveal>
          </div>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell id={section.id} props={p}>
      <Reveal className="container-site">
        <div className="mx-auto max-w-4xl border-y border-line py-16 text-center md:py-20">{copy(true)}</div>
      </Reveal>
    </SectionShell>
  );
}

/* ───────────── Inquiry form ───────────── */

export function InquiryFormSection({ section, index }: SectionRenderProps<'inquiryForm'>) {
  const p = section.props;
  if (p.variant === 'inline') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site grid grid-cols-1 gap-14 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32">
              <SectionHeader props={p} level={lvl(index)} className="!mb-6 !block" />
              {p.body && <p className="leading-relaxed text-muted">{p.body}</p>}
            </div>
          </div>
          <div className="lg:col-span-8">
            <InquiryForm compact />
          </div>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} align="center" className="!mb-8" />
        {p.body && <p className="mx-auto -mt-2 mb-12 max-w-2xl text-center text-muted">{p.body}</p>}
        <div className="mx-auto max-w-4xl">
          <InquiryForm />
        </div>
      </div>
    </SectionShell>
  );
}

/* ───────────── Contact ───────────── */

export function ContactDetails({ className }: { className?: string }) {
  const { site } = useSite();
  if (!site) return null;
  const c = site.company;
  const addr = [c.addressLine, [c.city, c.region, c.postalCode].filter(Boolean).join(', '), c.country].filter(Boolean);
  const row = 'flex gap-4';
  const icon = 'mt-1 h-4 w-4 shrink-0 text-primary';
  return (
    <ul className={cn('space-y-6 text-[0.98rem]', className)}>
      {addr.length > 0 && (
        <li className={row}>
          <MapPin className={icon} strokeWidth={1.25} />
          <address className="not-italic leading-relaxed">
            {addr.map((l, i) => (
              <span key={i} className="block">
                {l}
              </span>
            ))}
          </address>
        </li>
      )}
      {c.phone && (
        <li className={row}>
          <Phone className={icon} strokeWidth={1.25} />
          <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="hover:text-primary">
            {c.phone}
          </a>
        </li>
      )}
      {c.email && (
        <li className={row}>
          <Mail className={icon} strokeWidth={1.25} />
          <a href={`mailto:${c.email}`} className="hover:text-primary">
            {c.email}
          </a>
        </li>
      )}
      {c.hours && (
        <li className={row}>
          <Clock className={icon} strokeWidth={1.25} />
          <span className="text-muted">{c.hours}</span>
        </li>
      )}
      {c.whatsapp && (
        <li>
          <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(c.whatsappMessage)}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
            Message us on WhatsApp
          </a>
        </li>
      )}
    </ul>
  );
}

export function ContactSection({ section, index }: SectionRenderProps<'contact'>) {
  const p = section.props;
  const { site } = useSite();
  const map = p.showMap ? site?.company.mapEmbedUrl : '';
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <div className="grid gap-16 lg:grid-cols-12">
          <Reveal className={cn(p.showForm ? 'lg:col-span-5' : 'lg:col-span-8')}>
            {p.eyebrow && <p className="eyebrow mb-5">{p.eyebrow}</p>}
            {p.heading && (index === 0 ? <h1 className="t-h1">{p.heading}</h1> : <h2 className="t-h2">{p.heading}</h2>)}
            {(p.body || p.subheading) && <p className="lead mt-6">{p.body || p.subheading}</p>}
            <ContactDetails className="mt-12" />
            <SocialLinks className="mt-10" />
          </Reveal>
          {p.showForm && (
            <Reveal delay={0.1} className="lg:col-span-6 lg:col-start-7">
              <div className="card p-6 sm:p-10">
                <p className="eyebrow mb-8">Send a message</p>
                <ContactForm />
              </div>
            </Reveal>
          )}
        </div>
        {map && (
          <Reveal className="mt-20">
            <iframe src={map} title="Studio location map" className="h-[420px] w-full rounded-theme-img border-0 grayscale-[40%]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </Reveal>
        )}
      </div>
    </SectionShell>
  );
}

/* ───────────── Newsletter ───────────── */

export function NewsletterSection({ section, index }: SectionRenderProps<'newsletter'>) {
  const p = section.props;
  const { site } = useSite();
  const heading = p.heading || site?.newsletter.heading || '';
  const body = p.body || p.subheading || site?.newsletter.body || '';
  return (
    <SectionShell id={section.id} props={p} className="!py-[calc(var(--section-y)*0.75)]">
      <Reveal className="container-site grid grid-cols-1 items-end gap-10 md:grid-cols-2 md:gap-16">
        <div>
          {p.eyebrow && <p className="eyebrow mb-4">{p.eyebrow}</p>}
          {heading && (index === 0 ? <h1 className="t-h2">{heading}</h1> : <h2 className="t-h2">{heading}</h2>)}
          {body && <p className="mt-4 max-w-md text-muted">{body}</p>}
        </div>
        <NewsletterForm />
      </Reveal>
    </SectionShell>
  );
}
