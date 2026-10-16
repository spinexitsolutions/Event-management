import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Smartphone } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Seo } from '@/components/ui/Seo';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fromNow } from '@/lib/format';
import { newPasswordField } from '@/auth/authUtils';
import { PasswordField, StrengthMeter, TextField } from '@/auth/ui';
import { Panel, Tag } from '../ui';

interface SessionRow { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean }

function describeAgent(ua: string | null) {
  if (!ua) return { label: 'Unknown device', mobile: false };
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Mobile|iPhone|Android/.test(ua) };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z
    .string()
    .trim()
    .max(30, 'That phone number is too long')
    .refine((v) => v === '' || /^[+\d][\d\s().-]{6,}$/.test(v), 'Enter a valid phone number'),
});
const pwSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: newPasswordField, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function Account() {
  return (
    <div className="space-y-12">
      <Seo title="Account" noIndex />
      <header>
        <p className="eyebrow">Account</p>
        <h1 className="t-h1 mt-4">Your details &amp; security</h1>
      </header>
      <div className="grid gap-8 lg:grid-cols-2">
        <ProfileCard />
        <PasswordCard />
      </div>
      <SessionsCard />
    </div>
  );
}

function CardHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="t-h4 mt-2 font-heading">{title}</h2>
      {body && <p className="mt-2 text-sm text-muted">{body}</p>}
    </div>
  );
}

function ProfileCard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: user?.name ?? '', phone: user?.phone ?? '' } });
  useEffect(() => {
    if (user) form.reset({ name: user.name, phone: user.phone ?? '' });
  }, [user, form]);
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await api.patch('/auth/profile', v);
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      const fe = err instanceof ApiError ? err.fieldErrors : {};
      if (fe.name) form.setError('name', { message: fe.name });
      if (fe.phone) form.setError('phone', { message: fe.phone });
      if (!fe.name && !fe.phone) toast.error('Could not save your profile', errorMessage(err));
    }
  });
  return (
    <Panel className="p-6 sm:p-8">
      <CardHead eyebrow="Profile" title="Personal details" />
      <form onSubmit={onSubmit} noValidate className="space-y-7">
        <TextField label="Full name" autoComplete="name" error={form.formState.errors.name?.message} {...form.register('name')} />
        <TextField label="Phone" type="tel" autoComplete="tel" error={form.formState.errors.phone?.message} {...form.register('phone')} />
        <TextField label="Email" value={user?.email ?? ''} readOnly disabled hint="To change your sign-in email, please contact your planner." />
        <Button type="submit" size="sm" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
          Save changes
        </Button>
      </form>
    </Panel>
  );
}

function PasswordCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      form.reset();
      toast.success('Password changed', 'You have been signed out of your other devices.');
      void qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_PASSWORD') form.setError('currentPassword', { message: err.message });
      else if (err instanceof ApiError && (err.code === 'WEAK_PASSWORD' || err.fieldErrors.newPassword)) form.setError('newPassword', { message: err.fieldErrors.newPassword ?? err.message });
      else toast.error('Could not change your password', errorMessage(err));
    }
  });
  return (
    <Panel className="p-6 sm:p-8">
      <CardHead eyebrow="Security" title="Change password" body="Changing your password signs you out everywhere else." />
      <form onSubmit={onSubmit} noValidate className="space-y-7">
        <PasswordField label="Current password" autoComplete="current-password" error={form.formState.errors.currentPassword?.message} {...form.register('currentPassword')} />
        <div>
          <PasswordField label="New password" autoComplete="new-password" error={form.formState.errors.newPassword?.message} {...form.register('newPassword')} />
          <StrengthMeter value={form.watch('newPassword')} />
        </div>
        <PasswordField label="Confirm new password" autoComplete="new-password" error={form.formState.errors.confirm?.message} {...form.register('confirm')} />
        <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </Panel>
  );
}

function SessionsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['auth', 'sessions'];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<SessionRow[]>('/auth/sessions') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success('Device signed out');
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error('Could not sign out that device', errorMessage(err)),
  });
  const all = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => {
      toast.success('Signed out everywhere else');
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error('Could not sign out other devices', errorMessage(err)),
  });
  const others = (q.data ?? []).filter((s) => !s.current).length;

  return (
    <Panel className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <CardHead eyebrow="Devices" title="Where you’re signed in" body="If you don’t recognise a device, sign it out and change your password." />
        <Button variant="secondary" size="sm" loading={all.isPending} disabled={!others} onClick={() => all.mutate()}>
          Sign out everywhere else
        </Button>
      </div>
      {q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {q.data!.map((s) => {
            const d = describeAgent(s.userAgent);
            const Icon = d.mobile ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-4 py-4">
                <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-ink">
                    {d.label} {s.current && <Tag tone="success" className="ml-2 align-middle">This device</Tag>}
                  </p>
                  <p className="text-xs text-muted">
                    {s.ip ? `${s.ip} · ` : ''}Active {fromNow(s.lastSeenAt)} · signed in {fromNow(s.createdAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)} aria-label={`Sign out ${d.label}`}>
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
