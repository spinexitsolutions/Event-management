import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { Me } from '@/lib/types';
import { AUTH_IMAGES, emailField, safeNext } from '../authUtils';
import { AuthShell, Notice, PasswordField, TextField } from '../ui';

const credSchema = z.object({ email: emailField, password: z.string().min(1, 'Enter your password').max(200) });
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app') });
type Cred = z.infer<typeof credSchema>;
type Code = z.infer<typeof codeSchema>;

const DONE_NOTES: Record<string, string> = {
  reset: 'Your password has been updated. Sign in with your new password.',
  activated: 'Your account is active. Sign in with the password you just chose.',
};

export default function Login() {
  const { user, loading, refresh } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const finishing = useRef(false);
  const next = safeNext(params.get('next'));
  const done = params.get('done');

  const cred = useForm<Cred>({ resolver: zodResolver(credSchema), defaultValues: { email: '', password: '' } });
  const code = useForm<Code>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });

  useEffect(() => {
    if (step === 'mfa') code.setFocus('code');
  }, [step, code]);

  async function finish() {
    finishing.current = true;
    const res = (await refresh()) as { data?: Me | null };
    const me = res?.data ?? null;
    navigate(next ?? (me?.isStaff ? '/admin' : '/portal'), { replace: true });
  }

  // Already signed in (and not in the middle of signing in): go straight to the right area.
  if (!loading && user && !finishing.current) return <Navigate to={next ?? (user.isStaff ? '/admin' : '/portal')} replace />;

  const onCredentials = cred.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const r = await api.post<{ mfaRequired: boolean }>('/auth/login', values);
      if (r.mfaRequired) setStep('mfa');
      else await finish();
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors;
        if (fe.email) cred.setError('email', { message: fe.email });
        if (fe.password) cred.setError('password', { message: fe.password });
        setFormError({ code: err.code, message: err.status === 429 && err.code !== 'ACCOUNT_LOCKED' ? 'Too many attempts. Please wait a few minutes and try again.' : err.message });
        if (err.code === 'INVALID_CREDENTIALS') cred.setValue('password', '');
      } else setFormError({ code: 'ERROR', message: errorMessage(err) });
    }
  });

  const onCode = code.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('/auth/mfa/verify', values);
      await finish();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.code !== 'INVALID_CODE') {
        setStep('credentials');
        setFormError({ code: err.code, message: err.message });
        return;
      }
      code.setError('code', { message: errorMessage(err) });
      code.setValue('code', '');
    }
  });

  if (step === 'mfa') {
    return (
      <AuthShell image={AUTH_IMAGES.login} eyebrow="Two-step verification" title="Enter your code" lead="Open your authenticator app and enter the 6-digit code for this account.">
        <form onSubmit={onCode} noValidate className="space-y-7">
          <TextField
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="[&_input]:text-2xl [&_input]:tracking-[0.5em]"
            error={code.formState.errors.code?.message}
            {...code.register('code')}
          />
          <Button type="submit" className="w-full" loading={code.formState.isSubmitting}>
            Verify &amp; continue
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('credentials');
              code.reset();
            }}
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Use a different account
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      image={AUTH_IMAGES.login}
      eyebrow="Welcome back"
      title="Sign in"
      lead="Your proposals, bookings, payments and planning — all in one private space."
    >
      {done && DONE_NOTES[done] && <Notice tone="success" className="mb-7">{DONE_NOTES[done]}</Notice>}
      {formError && (
        <Notice tone="error" className="mb-7">
          <p>{formError.message}</p>
          {formError.code === 'ACCOUNT_LOCKED' && (
            <Link to="/forgot-password" className="mt-1 inline-block text-primary underline underline-offset-4">
              Reset your password
            </Link>
          )}
          {formError.code === 'ACCOUNT_NOT_ACTIVE' && (
            <p className="mt-1 text-muted">
              Look for the activation email we sent you — it contains a secure link to finish setting up.{' '}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-primary"
                onClick={async () => {
                  try {
                    const r = await api.post<{ message: string }>('/auth/resend-verification', { email: cred.getValues('email') });
                    setFormError({ code: 'RESENT', message: r.message });
                  } catch (err) {
                    setFormError({ code: 'ERROR', message: errorMessage(err) });
                  }
                }}
              >
                Resend activation email
              </button>
            </p>
          )}
        </Notice>
      )}
      <form onSubmit={onCredentials} noValidate className="space-y-7">
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" error={cred.formState.errors.email?.message} {...cred.register('email')} />
        <div>
          <PasswordField label="Password" autoComplete="current-password" error={cred.formState.errors.password?.message} {...cred.register('password')} />
          <div className="mt-3 text-right">
            <Link to="/forgot-password" className="text-xs text-muted underline-offset-4 hover:text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" loading={cred.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
      <div className="mt-10 border-t border-line pt-6 text-sm text-muted">
        New here?{' '}
        <Link to="/register" className="text-ink underline decoration-primary/50 underline-offset-4 hover:text-primary">
          Create a client account
        </Link>
      </div>
    </AuthShell>
  );
}
