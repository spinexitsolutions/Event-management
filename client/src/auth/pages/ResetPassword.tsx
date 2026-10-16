import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { api, ApiError, errorMessage } from '@/lib/api';
import { AUTH_IMAGES, newPasswordField } from '../authUtils';
import { AuthShell, Notice, PasswordField, StrengthMeter } from '../ui';

const schema = z.object({ password: newPasswordField, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Values = z.infer<typeof schema>;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const invite = params.get('invite') === '1';
  const portal = params.get('portal') === '1';
  const navigate = useNavigate();
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const { register, handleSubmit, watch, setError: setFieldError, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const copy = invite
    ? portal
      ? { eyebrow: 'Your client portal', title: 'Activate your account', lead: 'Choose a password to open your private portal — review proposals, follow your event plan, message your planner and pay securely.', cta: 'Activate account' }
      : { eyebrow: 'Team invitation', title: 'Join the team', lead: 'Choose a password to activate your staff account.', cta: 'Activate account' }
    : { eyebrow: 'Account help', title: 'Choose a new password', lead: 'For your security, you’ll be signed out of other devices once your password is changed.', cta: 'Update password' };

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate(`/login?done=${invite ? 'activated' : 'reset'}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'WEAK_PASSWORD' || err.fieldErrors.password)) setFieldError('password', { message: err.fieldErrors.password ?? err.message });
      else setError({ message: errorMessage(err), expired: err instanceof ApiError && (err.code === 'INVALID_TOKEN' || err.fieldErrors.token !== undefined) });
    }
  });

  if (!token) {
    return (
      <AuthShell image={AUTH_IMAGES.reset} eyebrow={copy.eyebrow} title="This link is incomplete">
        <Notice tone="error">Please open the link from your email again, or request a new one.</Notice>
        <Link to="/forgot-password" className="btn btn-secondary mt-7 w-full">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell image={AUTH_IMAGES.reset} eyebrow={copy.eyebrow} title={copy.title} lead={copy.lead}>
      {error && (
        <Notice tone="error" className="mb-7">
          <p>{error.message}</p>
          {error.expired && (
            <Link to="/forgot-password" className="mt-1 inline-block text-primary underline underline-offset-4">
              {invite ? 'Request a new link to set your password' : 'Request a new reset link'}
            </Link>
          )}
        </Notice>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-7">
        <div>
          <PasswordField label="New password" autoComplete="new-password" error={formState.errors.password?.message} {...register('password')} />
          <StrengthMeter value={watch('password')} />
        </div>
        <PasswordField label="Confirm password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>
          {copy.cta}
        </Button>
      </form>
    </AuthShell>
  );
}
