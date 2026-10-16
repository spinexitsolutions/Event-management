import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { api, ApiError, errorMessage } from '@/lib/api';
import { AUTH_IMAGES, emailField, newPasswordField } from '../authUtils';
import { AuthShell, Notice, PasswordField, StrengthMeter, TextField } from '../ui';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(120),
    email: emailField,
    phone: z
      .string()
      .trim()
      .max(30, 'That phone number is too long')
      .refine((v) => v === '' || /^[+\d][\d\s().-]{6,}$/.test(v), 'Enter a valid phone number'),
    password: newPasswordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Values = z.infer<typeof schema>;

export default function Register() {
  const [sent, setSent] = useState<{ email: string; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, watch, setError, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', phone: '', password: '', confirm: '' } });
  const pw = watch('password');

  const onSubmit = handleSubmit(async ({ confirm: _c, ...values }) => {
    setFormError(null);
    try {
      const r = await api.post<{ message: string }>('/auth/register', values);
      setSent({ email: values.email, message: r.message });
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors;
        let mapped = false;
        for (const k of ['name', 'email', 'phone', 'password'] as const)
          if (fe[k]) {
            setError(k, { message: fe[k] });
            mapped = true;
          }
        if (err.code === 'WEAK_PASSWORD') setError('password', { message: err.message });
        else if (!mapped) setFormError(err.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : err.message);
      } else setFormError(errorMessage(err));
    }
  });

  if (sent) {
    return (
      <AuthShell image={AUTH_IMAGES.register} eyebrow="Almost there" title="Check your inbox" quote="The beginning of something beautifully planned.">
        <div className="space-y-6" role="status" aria-live="polite">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 text-primary">
            <MailCheck className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-[0.95rem] leading-relaxed text-ink/90">
            {sent.message} We sent the link to <strong className="font-medium text-ink">{sent.email}</strong>. It is valid for 24 hours.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Once your email is confirmed, any proposals and bookings we have prepared for <span className="text-ink">{sent.email}</span> appear in your portal automatically. If you used a different email when
            you contacted us, let your planner know so we can connect them.
          </p>
          <p className="text-sm text-muted">Didn’t receive it? Check your spam folder, or contact us and we’ll help.</p>
          <Link to="/login" className="btn btn-secondary w-full">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      image={AUTH_IMAGES.register}
      eyebrow="Client portal"
      title="Create your account"
      quote="The beginning of something beautifully planned."
      lead={
        <>
          Already sent us an inquiry? Use <span className="text-ink">the same email address</span> — your proposals and bookings will appear here once your email is confirmed.
        </>
      }
    >
      {formError && (
        <Notice tone="error" className="mb-7">
          {formError}
        </Notice>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-7">
        <TextField label="Full name" autoComplete="name" error={formState.errors.name?.message} {...register('name')} />
        <TextField label="Email" type="email" inputMode="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
        <TextField label="Phone (optional)" type="tel" inputMode="tel" autoComplete="tel" error={formState.errors.phone?.message} {...register('phone')} />
        <div>
          <PasswordField label="Password" autoComplete="new-password" error={formState.errors.password?.message} {...register('password')} />
          <StrengthMeter value={pw} />
        </div>
        <PasswordField label="Confirm password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>
          Create account
        </Button>
        <p className="text-xs leading-relaxed text-muted">We’ll email you a link to confirm your address before your account is activated.</p>
      </form>
      <div className="mt-10 border-t border-line pt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="text-ink underline decoration-primary/50 underline-offset-4 hover:text-primary">
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
