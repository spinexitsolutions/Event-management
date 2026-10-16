import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { contactSubmitSchema } from '@maison/shared';
import { useSite } from '@/app/SiteProvider';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Honeypot, TextArea, TextInput, Turnstile } from './fields';

type Values = { name: string; email: string; phone: string; message: string };
const EMPTY: Values = { name: '', email: '', phone: '', message: '' };

/** Short contact form → POST /public/contact (creates an inquiry with source "contact-form"). */
export function ContactForm() {
  const [v, setV] = useState<Values>(EMPTY);
  const [website, setWebsite] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'done' | 'error'; message?: string; reference?: string }>({ status: 'idle' });
  const startedAt = useRef(Date.now());
  const { bootstrap } = useSite();
  const [captcha, setCaptcha] = useState<string | undefined>();
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...v, eventType: 'General enquiry', consent, website, startedAt: startedAt.current, captchaToken: captcha };
    const parsed = contactSubmitSchema.safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setState({ status: 'sending' });
    try {
      const r = await api.post<{ reference: string }>('/public/contact', body);
      setState({ status: 'done', reference: r.reference });
      setV(EMPTY);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      setState({ status: 'error', message: errorMessage(err) });
    }
  };

  if (state.status === 'done')
    return (
      <div className="card flex flex-col items-start gap-4 p-8 md:p-10" role="status">
        <CheckCircle2 className="h-8 w-8 text-primary" strokeWidth={1.25} />
        <p className="t-h3 font-heading">Thank you — your message is with us.</p>
        <p className="text-sm text-muted">
          Your reference is <strong className="text-ink">{state.reference}</strong>. A member of the studio will reply shortly.
        </p>
        <Link to={`/track?ref=${state.reference}`} className="btn btn-ghost btn-sm">
          Track your inquiry
        </Link>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="relative space-y-8">
      <Honeypot value={website} onChange={setWebsite} />
      <TextInput label="Name" name="name" id="contact-name" autoComplete="name" value={v.name} onChange={set('name')} error={errors.name} />
      <div className="grid gap-8 sm:grid-cols-2">
        <TextInput label="Email" name="email" id="contact-email" type="email" autoComplete="email" value={v.email} onChange={set('email')} error={errors.email} />
        <TextInput label="Phone" name="phone" id="contact-phone" type="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} error={errors.phone} optional />
      </div>
      <TextArea label="Message" name="message" id="contact-message" rows={4} value={v.message} onChange={set('message')} error={errors.message} placeholder="Tell us a little about your plans" />
      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--c-primary))]" aria-invalid={errors.consent ? true : undefined} />
          <span className="text-ink/85">
            I agree that my details may be used to respond to this message (
            <Link to="/privacy-policy" className="text-primary underline underline-offset-4">
              privacy policy
            </Link>
            ).
          </span>
        </label>
        {errors.consent && (
          <p className="field-error" role="alert">
            {errors.consent}
          </p>
        )}
      </div>
      {state.status === 'error' && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      {bootstrap?.integrations.turnstileSiteKey && <Turnstile siteKey={bootstrap.integrations.turnstileSiteKey} onToken={setCaptcha} />}
      <button className="btn btn-primary" disabled={state.status === 'sending'}>
        {state.status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
        {state.status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
