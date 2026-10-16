import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { AUTH_IMAGES, emailField } from '../authUtils';
import { AuthShell, Notice, TextField } from '../ui';

const schema = z.object({ email: emailField });
const GENERIC = 'If an account exists for that email, a reset link is on its way.';

export default function ForgotPassword() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const r = await api.post<{ message: string }>('/auth/forgot-password', values);
      setSent(r.message || GENERIC);
    } catch (err) {
      // Never reveal whether an account exists: only rate limiting / connectivity are surfaced.
      if (err instanceof ApiError && (err.status === 429 || err.status === 0)) setError(err.status === 429 ? 'Too many requests. Please wait a few minutes and try again.' : err.message);
      else setSent(GENERIC);
    }
  });

  return (
    <AuthShell image={AUTH_IMAGES.reset} eyebrow="Account help" title="Reset your password" lead={sent ? undefined : 'Enter the email you use to sign in and we’ll send you a secure link to choose a new password.'}>
      {sent ? (
        <div className="space-y-6">
          <Notice tone="success">{sent}</Notice>
          <p className="text-sm text-muted">The link expires in one hour. Check your spam folder if it doesn’t arrive within a few minutes.</p>
          <Link to="/login" className="btn btn-secondary w-full">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <Notice tone="error" className="mb-7">
              {error}
            </Notice>
          )}
          <form onSubmit={onSubmit} noValidate className="space-y-7">
            <TextField label="Email" type="email" inputMode="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
            <Button type="submit" className="w-full" loading={formState.isSubmitting}>
              Send reset link
            </Button>
          </form>
          <div className="mt-10 border-t border-line pt-6 text-sm text-muted">
            Remembered it?{' '}
            <Link to="/login" className="text-ink underline decoration-primary/50 underline-offset-4 hover:text-primary">
              Sign in
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
