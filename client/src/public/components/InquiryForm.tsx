import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type FieldPath, type Resolver } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { inquiryStepSchemas, GUEST_RANGES } from '@maison/shared';
import { useSite } from '@/app/SiteProvider';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { PackageCard } from '@/lib/types';
import { Honeypot, SelectInput, TextArea, TextInput, Turnstile } from './fields';

export interface InquiryValues {
  name: string;
  email: string;
  phone: string;
  preferredContact: 'PHONE' | 'EMAIL' | 'WHATSAPP';
  eventChoice: string;
  eventType: string;
  categoryId: string | null;
  eventDate: string;
  alternativeDate: string;
  dateFlexible: boolean;
  location: string;
  guestCount: string;
  budgetRange: string;
  venueRequirements: string;
  services: string[];
  themePreferences: string;
  cateringRequirements: string;
  notes: string;
  website: string;
}

interface Upload {
  key: string;
  id?: string;
  filename: string;
  preview?: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

const STEPS = [
  { key: 'contact', label: 'Contact' },
  { key: 'event', label: 'Your event' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'review', label: 'Review' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const STEP_FIELDS: Record<Exclude<StepKey, 'review'>, FieldPath<InquiryValues>[]> = {
  contact: ['name', 'email', 'phone', 'preferredContact'],
  event: ['eventChoice', 'eventType', 'categoryId', 'eventDate', 'alternativeDate', 'dateFlexible', 'location', 'guestCount', 'budgetRange'],
  requirements: ['venueRequirements', 'services', 'themePreferences', 'cateringRequirements', 'notes'],
};

const DEFAULTS: InquiryValues = {
  name: '',
  email: '',
  phone: '',
  preferredContact: 'PHONE',
  eventChoice: '',
  eventType: '',
  categoryId: null,
  eventDate: '',
  alternativeDate: '',
  dateFlexible: false,
  location: '',
  guestCount: '',
  budgetRange: '',
  venueRequirements: '',
  services: [],
  themePreferences: '',
  cateringRequirements: '',
  notes: '',
  website: '',
};

const STORE = 'maison-inquiry-draft';
const MAX_UPLOADS = 6;
const today = () => new Date().toISOString().slice(0, 10);

function loadDraft(): { values: InquiryValues; step: number; startedAt: number; uploads: Upload[] } | null {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Premium multi-step inquiry form (contact → event → requirements → review).
 * Each step validates with the shared zod step schema before moving on; progress is kept in sessionStorage.
 */
export function InquiryForm({ compact, className }: { compact?: boolean; className?: string }) {
  const { bootstrap, site } = useSite();
  const navigate = useNavigate();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [params] = useSearchParams();
  const draft = useMemo(loadDraft, []);
  const [step, setStep] = useState(draft?.step ?? 0);
  const [dir, setDir] = useState(1);
  const stepRef = useRef(step);
  stepRef.current = step;
  const startedAt = useRef(draft?.startedAt ?? Date.now());
  const [uploads, setUploads] = useState<Upload[]>(() => (draft?.uploads ?? []).filter((u) => u.status === 'done').map((u) => ({ ...u, preview: undefined })));
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [captcha, setCaptcha] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const topRef = useRef<HTMLDivElement>(null);
  const categories = useMemo(() => bootstrap?.categories ?? [], [bootstrap]);
  const packageId = params.get('package');

  const resolver: Resolver<InquiryValues> = async (values, ctx, opts) => {
    const key = STEPS[stepRef.current].key;
    if (key === 'review') return { values, errors: {} };
    const schema = inquiryStepSchemas[key];
    const res = await zodResolver(schema)(values as never, ctx, opts as never);
    const errors = { ...(res.errors as Record<string, unknown>) };
    if (key === 'event') {
      if (errors.eventType && !values.eventChoice) {
        errors.eventChoice = errors.eventType;
        delete errors.eventType;
      }
      if (values.eventDate && values.alternativeDate && values.eventDate === values.alternativeDate) errors.alternativeDate = { type: 'custom', message: 'Alternative date should differ from the preferred date' };
      if (values.eventDate && values.eventDate < today()) errors.eventDate = { type: 'custom', message: 'Choose a date in the future' };
    }
    return Object.keys(errors).length ? { values: {}, errors: errors as never } : { values, errors: {} };
  };

  const form = useForm<InquiryValues>({ defaultValues: { ...DEFAULTS, ...draft?.values }, resolver, mode: 'onTouched' });
  const { register, watch, setValue, trigger, getValues, setError, formState } = form;
  const errors = formState.errors;

  const pkgQuery = useQuery({ queryKey: ['public-packages'], queryFn: () => api.get<PackageCard[]>('/public/packages'), enabled: !!packageId, staleTime: 300_000 });
  const pkg = packageId ? pkgQuery.data?.find((p) => p.id === packageId) : undefined;

  // Prefill from ?category=<id> or the package's category.
  useEffect(() => {
    if (!categories.length) return;
    const fromUrl = params.get('category');
    const cat = categories.find((c) => c.id === fromUrl || c.slug === fromUrl) ?? (pkg?.category ? categories.find((c) => c.slug === pkg.category?.slug) : undefined);
    if (cat && !getValues('eventChoice')) {
      setValue('eventChoice', cat.id);
      setValue('eventType', cat.name);
      setValue('categoryId', cat.id);
    }
  }, [categories, params, pkg, getValues, setValue]);

  // Persist progress for this browser session.
  const values = watch();
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ values: { ...values, website: '' }, step, startedAt: startedAt.current, uploads: uploads.filter((u) => u.status === 'done').map(({ preview: _p, ...u }) => u) }));
    } catch {
      /* storage unavailable */
    }
  }, [values, step, uploads]);

  // Revoke object URLs on unmount.
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  useEffect(() => () => uploadsRef.current.forEach((u) => u.preview && URL.revokeObjectURL(u.preview)), []);

  const scrollTop = () => {
    const el = topRef.current;
    if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: reduce ? 'auto' : 'smooth' });
  };
  const goTo = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    setServerError('');
    scrollTop();
  };
  const next = async () => {
    const key = STEPS[step].key;
    if (key !== 'review') {
      const ok = await trigger(STEP_FIELDS[key]);
      if (!ok) return;
      if (key === 'requirements' && uploads.some((u) => u.status === 'uploading')) return toast.info('Please wait for your images to finish uploading');
    }
    goTo(step + 1);
  };

  const onEventChoice = (v: string) => {
    setValue('eventChoice', v, { shouldValidate: formState.isSubmitted });
    if (v === 'other') {
      setValue('categoryId', null);
      setValue('eventType', '');
    } else {
      const c = categories.find((x) => x.id === v);
      setValue('categoryId', c?.id ?? null);
      setValue('eventType', c?.name ?? '');
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_UPLOADS - uploads.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) toast.info(`You can attach up to ${MAX_UPLOADS} images`);
    for (const file of list) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
      if (!file.type.startsWith('image/')) {
        setUploads((u) => [...u, { key, filename: file.name, status: 'error', error: 'Not an image' }]);
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        setUploads((u) => [...u, { key, filename: file.name, status: 'error', error: 'Larger than 8 MB' }]);
        continue;
      }
      const preview = URL.createObjectURL(file);
      setUploads((u) => [...u, { key, filename: file.name, preview, status: 'uploading' }]);
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await api.upload<{ id: string; filename: string }>('/public/inquiries/uploads', fd);
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, id: r.id, status: 'done' } : x)));
      } catch (err) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: 'error', error: errorMessage(err) } : x)));
      }
    }
  };
  const removeUpload = (key: string) =>
    setUploads((u) => {
      const x = u.find((i) => i.key === key);
      if (x?.preview) URL.revokeObjectURL(x.preview);
      return u.filter((i) => i.key !== key);
    });

  const submit = async () => {
    if (!consent) {
      setConsentError('Please accept the privacy notice to continue');
      return;
    }
    setConsentError('');
    setServerError('');
    // Re-validate every step (values may have been restored from an older draft).
    for (let i = 0; i < 3; i++) {
      stepRef.current = i;
      const ok = await trigger(STEP_FIELDS[STEPS[i].key as Exclude<StepKey, 'review'>]);
      if (!ok) {
        stepRef.current = step;
        goTo(i);
        return;
      }
    }
    stepRef.current = step;
    const v = getValues();
    const utm: Record<string, string> = {};
    params.forEach((val, k) => {
      if (k.startsWith('utm_')) utm[k] = val.slice(0, 120);
    });
    setSubmitting(true);
    try {
      const res = await api.post<{ reference: string; duplicate: boolean }>('/public/inquiries', {
        name: v.name,
        email: v.email,
        phone: v.phone,
        preferredContact: v.preferredContact,
        eventType: v.eventType,
        categoryId: v.categoryId,
        eventDate: v.eventDate,
        alternativeDate: v.alternativeDate,
        dateFlexible: v.dateFlexible,
        location: v.location,
        guestCount: Number(v.guestCount),
        budgetRange: v.budgetRange,
        venueRequirements: v.venueRequirements,
        services: v.services,
        themePreferences: v.themePreferences,
        cateringRequirements: v.cateringRequirements,
        notes: v.notes,
        referenceImages: uploads.filter((u) => u.status === 'done' && u.id).map((u) => u.id as string),
        consent: true,
        packageId: pkg?.id ?? packageId ?? null,
        source: 'website',
        utm,
        website: v.website,
        startedAt: startedAt.current,
        captchaToken: captcha,
      });
      try {
        sessionStorage.removeItem(STORE);
      } catch {
        /* ignore */
      }
      navigate(`/inquire/thank-you?ref=${encodeURIComponent(res.reference)}`, { state: { reference: res.reference, duplicate: res.duplicate, name: v.name.split(' ')[0], email: v.email } });
    } catch (err) {
      const fe = err instanceof ApiError ? err.fieldErrors : {};
      const keys = Object.keys(fe);
      if (keys.length) {
        let first = 3;
        for (const k of keys) {
          const field = k.split('.')[0] as FieldPath<InquiryValues>;
          const idx = (Object.keys(STEP_FIELDS) as Exclude<StepKey, 'review'>[]).findIndex((s) => STEP_FIELDS[s].includes(field));
          if (idx >= 0) {
            setError(field, { type: 'server', message: fe[k] });
            first = Math.min(first, idx);
          }
        }
        setServerError('Please review the highlighted details.');
        if (first < 3) goTo(first);
      } else setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const choice = watch('eventChoice');
  const services = watch('services');
  const budgets = site?.inquiry.budgetRanges ?? [];
  const serviceOptions = site?.inquiry.serviceOptions ?? [];
  const pad = compact ? 'p-6 sm:p-8' : 'p-6 sm:p-10 lg:p-12';

  const variants = { enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : 28 * d }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : -28 * d }) };

  return (
    <div ref={topRef} className={cn('card relative', className)}>
      {/* Progress */}
      <div className={cn('border-b border-line', compact ? 'px-6 py-5 sm:px-8' : 'px-6 py-6 sm:px-10 lg:px-12')}>
        <ol className="flex items-center gap-2 sm:gap-3" aria-label="Inquiry progress">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={s.key} className="flex flex-1 items-center gap-2 sm:gap-3 last:flex-none">
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => i < step && goTo(i)}
                  className="group flex items-center gap-2.5 disabled:cursor-default"
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${s.label}${done ? ' (completed)' : ''}`}
                >
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs transition-all duration-500', done ? 'border-primary bg-primary text-on-primary' : current ? 'border-primary text-primary' : 'border-line text-muted')}>
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                  </span>
                  <span className={cn('hidden text-[0.68rem] uppercase md:inline', current ? 'text-ink' : 'text-muted')} style={{ letterSpacing: '0.2em' }}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className="relative h-px flex-1 bg-line" aria-hidden>
                    <motion.span className="absolute inset-y-0 left-0 bg-primary" initial={false} animate={{ width: done ? '100%' : '0%' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted md:hidden" aria-live="polite">
          Step {step + 1} of {STEPS.length} · {STEPS[step].label}
        </p>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (STEPS[step].key === 'review') void submit();
          else void next();
        }}
        className={cn('relative overflow-hidden', pad)}
      >
        <Honeypot value={watch('website')} onChange={(v) => setValue('website', v)} />
        {pkg && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-primary/40 bg-primary/5 px-5 py-4 text-sm">
            <span>
              Inquiring about <strong className="font-medium text-primary">{pkg.name}</strong>
            </span>
            <Link to={`/packages/${pkg.slug}`} className="text-xs text-muted underline underline-offset-4 hover:text-primary">
              View package
            </Link>
          </div>
        )}
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            {step === 0 && (
              <fieldset className="space-y-8">
                <legend className="mb-2">
                  <span className="t-h3 block font-heading">How may we reach you?</span>
                  <span className="mt-2 block text-sm text-muted">A senior planner will personally respond to your inquiry.</span>
                </legend>
                <TextInput label="Full name" autoComplete="name" {...register('name')} error={errors.name?.message} />
                <div className="grid gap-8 sm:grid-cols-2">
                  <TextInput label="Email" type="email" autoComplete="email" inputMode="email" {...register('email')} error={errors.email?.message} />
                  <TextInput label="Phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" {...register('phone')} error={errors.phone?.message} />
                </div>
                <div>
                  <p className="field-label" id="pref-label">
                    Preferred way to contact you
                  </p>
                  <div className="flex flex-wrap gap-3" role="radiogroup" aria-labelledby="pref-label">
                    {(['PHONE', 'EMAIL', 'WHATSAPP'] as const).map((m) => (
                      <label key={m} className="chip cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary" data-active={watch('preferredContact') === m}>
                        <input type="radio" value={m} {...register('preferredContact')} className="sr-only" />
                        {m === 'PHONE' ? 'Phone call' : m === 'EMAIL' ? 'Email' : 'WhatsApp'}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            )}

            {step === 1 && (
              <fieldset className="space-y-8">
                <legend className="mb-2">
                  <span className="t-h3 block font-heading">Tell us about the occasion</span>
                  <span className="mt-2 block text-sm text-muted">Approximate details are perfect — we refine everything together.</span>
                </legend>
                <div className="grid gap-8 sm:grid-cols-2">
                  <SelectInput label="Event type" name="eventChoice" value={choice} onChange={(e) => onEventChoice(e.target.value)} error={errors.eventChoice?.message}>
                    <option value="">Choose an occasion…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="other">Other</option>
                  </SelectInput>
                  {choice === 'other' ? (
                    <TextInput label="Describe your event" placeholder="e.g. Family reunion" {...register('eventType')} error={errors.eventType?.message} />
                  ) : (
                    <TextInput label="City or location" autoComplete="address-level2" placeholder="e.g. Udaipur, or abroad" {...register('location')} error={errors.location?.message} />
                  )}
                </div>
                {choice === 'other' && <TextInput label="City or location" autoComplete="address-level2" placeholder="e.g. Udaipur, or abroad" {...register('location')} error={errors.location?.message} />}
                <div className="grid gap-8 sm:grid-cols-2">
                  <TextInput label="Preferred date" type="date" min={today()} {...register('eventDate')} error={errors.eventDate?.message} optional />
                  <TextInput label="Alternative date" type="date" min={today()} {...register('alternativeDate')} error={errors.alternativeDate?.message} optional />
                </div>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" {...register('dateFlexible')} className="h-4 w-4 accent-[rgb(var(--c-primary))]" />
                  My dates are flexible
                </label>
                <div className="grid gap-8 sm:grid-cols-2">
                  <TextInput label="Estimated guests" type="number" inputMode="numeric" min={1} placeholder="e.g. 250" {...register('guestCount')} error={errors.guestCount?.message} hint={`Typical ranges: ${GUEST_RANGES.slice(1, 4).join(', ')}`} />
                  <SelectInput label="Budget range" {...register('budgetRange')} error={errors.budgetRange?.message}>
                    <option value="">Choose a range…</option>
                    {budgets.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </SelectInput>
                </div>
              </fieldset>
            )}

            {step === 2 && (
              <fieldset className="space-y-8">
                <legend className="mb-2">
                  <span className="t-h3 block font-heading">Your vision & requirements</span>
                  <span className="mt-2 block text-sm text-muted">Everything here is optional — share as much or as little as you like.</span>
                </legend>
                {serviceOptions.length > 0 && (
                  <div>
                    <p className="field-label" id="svc-label">
                      Services you are interested in
                    </p>
                    <div className="flex flex-wrap gap-2.5" role="group" aria-labelledby="svc-label">
                      {serviceOptions.map((s) => {
                        const on = services.includes(s);
                        return (
                          <button key={s} type="button" className="chip" data-active={on} aria-pressed={on} onClick={() => setValue('services', on ? services.filter((x) => x !== s) : [...services, s], { shouldDirty: true })}>
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={2} />}
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid gap-8 sm:grid-cols-2">
                  <TextArea label="Venue requirements" placeholder="Venue booked? Indoor / outdoor, rooms needed…" {...register('venueRequirements')} error={errors.venueRequirements?.message} optional />
                  <TextArea label="Theme & décor" placeholder="Colours, mood, references…" {...register('themePreferences')} error={errors.themePreferences?.message} optional />
                  <TextArea label="Catering" placeholder="Cuisine, dietary needs, service style…" {...register('cateringRequirements')} error={errors.cateringRequirements?.message} optional />
                  <TextArea label="Anything else" placeholder="Rituals, entertainment, special moments…" {...register('notes')} error={errors.notes?.message} optional />
                </div>
                {site?.inquiry.allowUploads !== false && (
                  <div>
                    <p className="field-label">
                      Inspiration images <span className="ml-2 normal-case tracking-normal opacity-60">(optional · up to {MAX_UPLOADS})</span>
                    </p>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {uploads.map((u) => (
                        <div key={u.key} className="group relative aspect-square overflow-hidden rounded-theme-img border border-line bg-surface-2">
                          {u.preview ? <img src={u.preview} alt={u.filename} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-2 text-center text-[0.65rem] text-muted">{u.filename}</span>}
                          {u.status === 'uploading' && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white" role="status" aria-label={`Uploading ${u.filename}`}>
                              <Loader2 className="h-5 w-5 animate-spin" />
                            </span>
                          )}
                          {u.status === 'error' && <span className="absolute inset-x-0 bottom-0 bg-danger/90 px-1.5 py-1 text-[0.6rem] leading-tight text-white">{u.error}</span>}
                          <button type="button" onClick={() => removeUpload(u.key)} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black" aria-label={`Remove ${u.filename}`}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {uploads.length < MAX_UPLOADS && (
                        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-theme-img border border-dashed border-line text-muted transition hover:border-primary hover:text-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
                          <ImagePlus className="h-5 w-5" strokeWidth={1.25} />
                          <span className="text-[0.65rem] uppercase" style={{ letterSpacing: '0.16em' }}>
                            Add
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            aria-label="Add inspiration images"
                            onChange={(e) => {
                              void addFiles(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted">JPG, PNG or WebP, up to 8 MB each. Images are stored privately and only seen by your planner.</p>
                  </div>
                )}
              </fieldset>
            )}

            {step === 3 && (
              <div className="space-y-8">
                <div>
                  <h3 className="t-h3 font-heading">Review your inquiry</h3>
                  <p className="mt-2 text-sm text-muted">Please check your details before sending.</p>
                </div>
                <ReviewBlock title="Contact" onEdit={() => goTo(0)} rows={[['Name', values.name], ['Email', values.email], ['Phone', values.phone], ['Contact by', titleContact(values.preferredContact)]]} />
                <ReviewBlock
                  title="Event"
                  onEdit={() => goTo(1)}
                  rows={[
                    ['Occasion', values.eventType],
                    ['Location', values.location],
                    ['Date', values.eventDate ? fmtDate(values.eventDate, { day: 'numeric', month: 'long', year: 'numeric' }) + (values.dateFlexible ? ' (flexible)' : '') : values.dateFlexible ? 'Flexible' : 'To be decided'],
                    ['Alternative', values.alternativeDate ? fmtDate(values.alternativeDate, { day: 'numeric', month: 'long', year: 'numeric' }) : ''],
                    ['Guests', values.guestCount],
                    ['Budget', values.budgetRange],
                  ]}
                />
                <ReviewBlock
                  title="Requirements"
                  onEdit={() => goTo(2)}
                  rows={[
                    ['Services', values.services.join(', ')],
                    ['Venue', values.venueRequirements],
                    ['Theme & décor', values.themePreferences],
                    ['Catering', values.cateringRequirements],
                    ['Notes', values.notes],
                    ['Images', uploads.filter((u) => u.status === 'done').length ? `${uploads.filter((u) => u.status === 'done').length} attached` : ''],
                  ]}
                />
                <div>
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => {
                        setConsent(e.target.checked);
                        if (e.target.checked) setConsentError('');
                      }}
                      aria-invalid={consentError ? true : undefined}
                      aria-describedby={consentError ? 'consent-error' : undefined}
                      className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--c-primary))]"
                    />
                    <span className="text-ink/85">
                      I agree that my details may be used to respond to this inquiry, as described in the{' '}
                      <Link to="/privacy-policy" className="text-primary underline underline-offset-4" target="_blank">
                        privacy policy
                      </Link>
                      .
                    </span>
                  </label>
                  {consentError && (
                    <p id="consent-error" className="field-error" role="alert">
                      {consentError}
                    </p>
                  )}
                </div>
                <Turnstile siteKey={bootstrap?.integrations.turnstileSiteKey ?? ''} onToken={setCaptcha} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {serverError && (
          <p className="mt-8 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {serverError}
          </p>
        )}

        <div className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-8">
          {step > 0 ? (
            <button type="button" onClick={() => goTo(step - 1)} className="btn btn-ghost btn-sm">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          ) : (
            <span className="text-xs text-muted">Takes about 2 minutes</span>
          )}
          {STEPS[step].key === 'review' ? (
            <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Sending…' : 'Send inquiry'}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary">
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const titleContact = (m: string) => (m === 'PHONE' ? 'Phone call' : m === 'EMAIL' ? 'Email' : 'WhatsApp');

function ReviewBlock({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  const shown = rows.filter(([, v]) => v);
  return (
    <section className="border-t border-line pt-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow" role="heading" aria-level={4}>
          {title}
        </p>
        <button type="button" onClick={onEdit} className="text-xs text-muted underline underline-offset-4 hover:text-primary">
          Edit
        </button>
      </div>
      {shown.length ? (
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
          {shown.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="whitespace-pre-line break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted">Nothing added.</p>
      )}
    </section>
  );
}
