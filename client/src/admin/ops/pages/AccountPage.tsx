import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, LogOut, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Card, ConfirmDialog, Field, Input, PageHeader } from '@/admin/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fromNow } from '@/lib/format';
import { AdmError, CopyButton, fieldErrorsOf, SkeletonRows } from '../shared';

interface Session {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  current: boolean;
}

function describeAgent(ua: string | null) {
  if (!ua) return { label: 'Unknown device', mobile: false };
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: `${browser}${os ? ` on ${os}` : ''}`, mobile: /Mobile|iPhone|Android/.test(ua) };
}

function ProfileCard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
    setTitle(user?.title ?? '');
  }, [user]);
  const save = useMutation({
    mutationFn: () => api.patch('/auth/profile', { name: name.trim(), phone: phone.trim(), title: title.trim() }),
    onSuccess: async () => {
      await refresh();
      setErrors({});
      toast.success('Profile updated');
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not update your profile', errorMessage(err));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setErrors({ name: 'Enter your full name' });
    save.mutate();
  };
  const dirty = name !== (user?.name ?? '') || phone !== (user?.phone ?? '') || title !== (user?.title ?? '');
  return (
    <Card title="Profile">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Full name" required error={errors.name}>
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} autoComplete="name" />
        </Field>
        <Field label="Email" hint="Ask an administrator to change your sign-in email.">
          <Input value={user?.email ?? ''} disabled readOnly />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" />
        </Field>
        <Field label="Job title" error={errors.title}>
          <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" />
        </Field>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <p className="text-xs text-adm-muted">
            Role: <span className="font-medium text-adm-ink">{user?.roleName}</span>
          </p>
          <button className="adm-btn-primary" disabled={!dirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      setErrors({});
      qc.invalidateQueries({ queryKey: ['my-sessions'] });
      toast.success('Password changed', 'Your other sessions were signed out.');
    },
    onError: (err) => {
      const fe = fieldErrorsOf(err);
      setErrors({ current: /current/i.test(errorMessage(err)) ? errorMessage(err) : '', next: fe.newPassword ?? '' });
      toast.error('Password not changed', errorMessage(err));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!current) errs.current = 'Enter your current password';
    if (next.length < 10) errs.next = 'Use at least 10 characters';
    if (next && next === current) errs.next = 'Choose a different password';
    if (confirm !== next) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (!Object.keys(errs).length) change.mutate();
  };
  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Current password" error={errors.current || undefined}>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" invalid={!!errors.current} />
        </Field>
        <Field label="New password" error={errors.next || undefined} hint="At least 10 characters. A passphrase of a few unrelated words works well.">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" invalid={!!errors.next} />
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" invalid={!!errors.confirm} />
        </Field>
        <div className="flex justify-end">
          <button className="adm-btn-primary" disabled={change.isPending}>
            {change.isPending ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function MfaCard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState('');
  const start = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup'),
    onSuccess: (r) => {
      setSetup(r);
      setCode('');
      setError('');
    },
    onError: (err) => toast.error('Could not start setup', errorMessage(err)),
  });
  const enable = useMutation({
    mutationFn: () => api.post('/auth/mfa/enable', { code }),
    onSuccess: async () => {
      await refresh();
      setSetup(null);
      setCode('');
      toast.success('Two-factor authentication is on', 'You’ll be asked for a code each time you sign in.');
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const disable = useMutation({
    mutationFn: () => api.post('/auth/mfa/disable', { password }),
    onSuccess: async () => {
      await refresh();
      setDisabling(false);
      setPassword('');
      toast.success('Two-factor authentication turned off');
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const enabled = !!user?.mfaEnabled;
  return (
    <Card title="Two-factor authentication" actions={enabled ? <Badge tone="green"><ShieldCheck className="mr-1 h-3 w-3" /> On</Badge> : <Badge tone="amber">Off</Badge>}>
      {enabled ? (
        <div className="space-y-4 text-sm">
          <p className="text-adm-muted">Your account asks for a 6-digit code from your authenticator app at every sign-in.</p>
          <button
            className="adm-btn-secondary text-red-600"
            onClick={() => {
              setError('');
              setPassword('');
              setDisabling(true);
            }}
          >
            <ShieldOff className="h-4 w-4" /> Turn off two-factor
          </button>
        </div>
      ) : !setup ? (
        <div className="space-y-4 text-sm">
          <p className="text-adm-muted">Protect your account with a time-based code from an authenticator app such as 1Password, Google Authenticator or Microsoft Authenticator. Strongly recommended for administrators.</p>
          <button className="adm-btn-gold" onClick={() => start.mutate()} disabled={start.isPending}>
            <ShieldCheck className="h-4 w-4" /> {start.isPending ? 'Preparing…' : 'Set up two-factor'}
          </button>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your app');
            enable.mutate();
          }}
        >
          <ol className="space-y-5 text-sm">
            <li>
              <p className="font-medium">1. Scan this QR code with your authenticator app</p>
              <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <div className="rounded-xl border border-adm-line bg-white p-3">
                  <QRCodeSVG value={setup.otpauthUrl} size={168} level="M" title="Authenticator QR code" />
                </div>
                <div className="min-w-0 text-xs text-adm-muted">
                  <p>Can’t scan? Enter this key manually:</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="break-all rounded-md bg-adm-bg px-2 py-1.5 font-mono text-[13px] tracking-wider text-adm-ink">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                    <CopyButton text={setup.secret} />
                  </div>
                  <p className="mt-2">Type: time-based (TOTP), 6 digits, 30 seconds.</p>
                </div>
              </div>
            </li>
            <li>
              <p className="font-medium">2. Enter the 6-digit code it shows</p>
              <div className="mt-2 flex max-w-xs gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="text-center font-mono text-lg tracking-[0.4em]"
                  aria-label="Verification code"
                  invalid={!!error}
                />
                <button className="adm-btn-primary shrink-0" disabled={enable.isPending}>
                  {enable.isPending ? 'Verifying…' : 'Enable'}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-xs text-red-600" role="alert">
                  {error}
                </p>
              )}
            </li>
          </ol>
          <button type="button" className="adm-btn-ghost px-0 text-xs" onClick={() => setSetup(null)}>
            Cancel setup
          </button>
        </form>
      )}
      <ConfirmDialog
        open={disabling}
        title="Turn off two-factor authentication?"
        body="Your account will be protected by your password only."
        confirmLabel="Turn off"
        danger
        loading={disable.isPending}
        onConfirm={() => {
          setError('');
          if (!password) return setError('Enter your password');
          disable.mutate();
        }}
        onClose={() => setDisabling(false)}
      >
        <Field label="Confirm with your password" error={error || undefined} className="mt-4">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" invalid={!!error} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

function SessionsCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-sessions'], queryFn: () => api.get<Session[]>('/auth/sessions') });
  const [confirmAll, setConfirmAll] = useState(false);
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success('Session signed out');
      qc.invalidateQueries({ queryKey: ['my-sessions'] });
    },
    onError: (err) => toast.error('Could not sign out that session', errorMessage(err)),
  });
  const all = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => {
      setConfirmAll(false);
      toast.success('Signed out everywhere else');
      qc.invalidateQueries({ queryKey: ['my-sessions'] });
    },
    onError: (err) => toast.error('Could not sign out other sessions', errorMessage(err)),
  });
  const others = q.data?.filter((s) => !s.current).length ?? 0;
  return (
    <Card
      title="Active sessions"
      actions={
        others > 0 && (
          <button className="adm-btn-secondary px-3 py-1.5 text-xs" onClick={() => setConfirmAll(true)}>
            <LogOut className="h-3.5 w-3.5" /> Sign out everywhere else
          </button>
        )
      }
      bodyClassName="p-0"
    >
      {q.isLoading ? (
        <SkeletonRows rows={2} className="p-5" />
      ) : q.isError ? (
        <AdmError error={q.error} onRetry={() => q.refetch()} className="m-5" />
      ) : (
        <ul className="divide-y divide-adm-line/70">
          {q.data!.map((s) => {
            const d = describeAgent(s.userAgent);
            const Icon = d.mobile ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                <Icon className="h-5 w-5 shrink-0 text-adm-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {d.label} {s.current && <Badge tone="green">This device</Badge>}
                  </p>
                  <p className="text-xs text-adm-muted" title={`Signed in ${fmtDateTime(s.createdAt)}`}>
                    {s.ip ?? 'Unknown IP'} · active {s.lastSeenAt ? fromNow(s.lastSeenAt) : fromNow(s.createdAt)}
                  </p>
                </div>
                {!s.current && (
                  <button className="adm-btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending && revoke.variables === s.id}>
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog open={confirmAll} title="Sign out everywhere else?" body={`${others} other session${others === 1 ? '' : 's'} will be signed out. This device stays signed in.`} confirmLabel="Sign out others" loading={all.isPending} onConfirm={() => all.mutate()} onClose={() => setConfirmAll(false)} />
    </Card>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return <SkeletonRows rows={6} />;
  return (
    <div>
      <PageHeader title="My account" subtitle="Your profile, password, two-factor authentication and signed-in devices." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ProfileCard />
          <PasswordCard />
        </div>
        <div className="space-y-6">
          <MfaCard />
          <SessionsCard />
        </div>
      </div>
    </div>
  );
}
