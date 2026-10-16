import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '@maison/shared';
import { Check, KeyRound, Lock, MailPlus, MoreHorizontal, RotateCcw, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Badge, ConfirmDialog, DataTable, Field, Input, PageHeader, SearchInput, Select, StatusBadge, Tabs, type Column } from '@/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, fromNow } from '@/lib/format';
import { AdmError, CopyButton, fieldErrorsOf, RequirePerm, SkeletonRows } from '../shared';

interface StaffUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  title: string | null;
  roleKey: string;
  status: 'ACTIVE' | 'INVITED' | 'DEACTIVATED';
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  role: { key: string; name: string };
  activeSessions: number;
  isSelf: boolean;
}
interface Role {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  editable: boolean;
}
type Delivery = { deliveredByEmail: true } | { deliveredByEmail: false; inviteUrl: string; expiresInHours: number };

const PERM_GROUPS: { label: string; prefix: string[] }[] = [
  { label: 'Dashboard & website', prefix: ['dashboard', 'cms', 'theme', 'media'] },
  { label: 'Sales', prefix: ['inquiries', 'clients', 'quotations'] },
  { label: 'Events & operations', prefix: ['bookings', 'tasks', 'calendar', 'vendors', 'venues', 'guests'] },
  { label: 'Finance', prefix: ['finance', 'refunds', 'reports'] },
  { label: 'Administration', prefix: ['notifications', 'staff', 'settings', 'audit'] },
];

function useRoles() {
  return useQuery({ queryKey: ['staff-roles'], queryFn: () => api.get<Role[]>('/admin/staff/roles') });
}

function InviteResult({ delivery, email }: { delivery: Delivery; email: string }) {
  if (delivery.deliveredByEmail) return <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">An invitation email is on its way to {email}.</p>;
  return (
    <div className="space-y-3 text-sm" aria-live="polite">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
        Email isn’t configured on the server, so no message was sent. Share this one-time link with {email} securely. It expires in {delivery.expiresInHours} hours.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={delivery.inviteUrl} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
        <CopyButton text={delivery.inviteUrl} label="Copy link" />
      </div>
    </div>
  );
}

function RowMenu({ user, onAction }: { user: StaffUser; onAction: (a: 'edit' | 'deactivate' | 'activate' | 'resend' | 'revoke') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const item = (a: Parameters<typeof onAction>[0], label: string, Icon: typeof Check, danger?: boolean) => (
    <button
      role="menuitem"
      className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-adm-bg', danger && 'text-red-600')}
      onClick={() => {
        setOpen(false);
        onAction(a);
      }}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button className="adm-btn-ghost px-2 py-1" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${user.name}`} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-adm-line bg-white py-1 shadow-xl">
          {item('edit', 'Edit details & role', KeyRound)}
          {user.status === 'INVITED' && item('resend', 'Resend invitation', MailPlus)}
          {user.status !== 'DEACTIVATED' && item('revoke', user.isSelf ? 'Sign out my other sessions' : 'Revoke all sessions', ShieldOff)}
          {user.status === 'DEACTIVATED' ? item('activate', 'Reactivate', UserCheck) : !user.isSelf && item('deactivate', 'Deactivate', UserX, true)}
        </div>
      )}
    </div>
  );
}

function UsersTab({ roles, isSuper }: { roles: Role[]; isSuper: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const users = useQuery({ queryKey: ['staff-users', q, status, roleKey], queryFn: () => api.get<StaffUser[]>('/admin/staff/users', { q, status, roleKey }) });
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '', roleKey: '', title: '', phone: '' });
  const [inviteResult, setInviteResult] = useState<{ delivery: Delivery; email: string } | null>(null);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [edit, setEdit] = useState({ name: '', title: '', phone: '', roleKey: '' });
  const [confirm, setConfirm] = useState<{ user: StaffUser; action: 'deactivate' | 'revoke' } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const assignable = roles.filter((r) => r.key !== 'CLIENT' && (isSuper || r.key !== 'SUPER_ADMIN'));
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-users'] });

  const inviteM = useMutation({
    mutationFn: () => api.post<{ user: StaffUser } & Delivery>('/admin/staff/users', { ...invite, title: invite.title || undefined, phone: invite.phone || undefined }),
    onSuccess: (r) => {
      refresh();
      qc.invalidateQueries({ queryKey: ['staff-directory'] });
      setInviteResult({ delivery: r, email: r.user.email });
      toast.success('Invitation created', r.user.email);
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not invite', errorMessage(err));
    },
  });
  const editM = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: edit.name, title: edit.title || null, phone: edit.phone || null };
      if (edit.roleKey !== editing!.roleKey) body.roleKey = edit.roleKey;
      return api.patch(`/admin/staff/users/${editing!.id}`, body);
    },
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ['staff-roles'] });
      setEditing(null);
      toast.success('Staff member updated');
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not update', errorMessage(err));
    },
  });
  const action = useMutation({
    mutationFn: ({ user, a }: { user: StaffUser; a: 'deactivate' | 'activate' | 'resend' | 'revoke' }) =>
      api.post<Record<string, unknown>>(`/admin/staff/users/${user.id}/${a === 'resend' ? 'resend-invite' : a === 'revoke' ? 'revoke-sessions' : a}`),
    onSuccess: (r, { user, a }) => {
      refresh();
      setConfirm(null);
      if (a === 'resend') {
        setInviteResult({ delivery: r as unknown as Delivery, email: user.email });
        setInviting(true);
      } else if (a === 'revoke') toast.success('Sessions revoked', `${(r as { revoked: number }).revoked} session(s) signed out`);
      else toast.success(a === 'deactivate' ? `${user.name} deactivated` : `${user.name} reactivated`, a === 'activate' && (r as { status?: string }).status === 'INVITED' ? 'They have never set a password — resend their invitation.' : undefined);
    },
    onError: (err) => {
      setConfirm(null);
      toast.error('Action not allowed', errorMessage(err));
    },
  });

  const onAction = (user: StaffUser, a: 'edit' | 'deactivate' | 'activate' | 'resend' | 'revoke') => {
    if (a === 'edit') {
      setErrors({});
      setEdit({ name: user.name, title: user.title ?? '', phone: user.phone ?? '', roleKey: user.roleKey });
      setEditing(user);
    } else if (a === 'deactivate' || a === 'revoke') setConfirm({ user, action: a });
    else action.mutate({ user, a });
  };

  const columns: Column<StaffUser>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (u) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-adm-bg text-xs font-semibold text-adm-muted ring-1 ring-adm-line">
            {u.name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {u.name} {u.isSelf && <span className="text-xs font-normal text-adm-muted">(you)</span>}
            </p>
            <p className="truncate text-xs text-adm-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', cell: (u) => <span>{u.role.name}{u.title && <span className="block text-xs text-adm-muted">{u.title}</span>}</span> },
    { key: 'status', header: 'Status', cell: (u) => <span className="flex flex-wrap gap-1"><StatusBadge status={u.status} />{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="red">Locked</Badge>}</span> },
    { key: 'mfa', header: 'MFA', className: 'hidden md:table-cell', cell: (u) => (u.mfaEnabled ? <Badge tone="green"><ShieldCheck className="mr-1 h-3 w-3" />On</Badge> : <span className="text-xs text-adm-muted">Off</span>) },
    { key: 'login', header: 'Last sign-in', className: 'hidden lg:table-cell', cell: (u) => (u.lastLoginAt ? <span title={fmtDateTime(u.lastLoginAt)}>{fromNow(u.lastLoginAt)}<span className="block text-xs text-adm-muted">{u.activeSessions} active session{u.activeSessions === 1 ? '' : 's'}</span></span> : <span className="text-xs text-adm-muted">Never</span>) },
    { key: 'act', header: <span className="sr-only">Actions</span>, className: 'text-right', cell: (u) => <RowMenu user={u} onAction={(a) => onAction(u, a)} /> },
  ];

  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!invite.name.trim()) errs.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(invite.email)) errs.email = 'Enter a valid email';
    if (!invite.roleKey) errs.roleKey = 'Choose a role';
    setErrors(errs);
    if (!Object.keys(errs).length) inviteM.mutate();
  };

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_170px_auto]">
        <SearchInput value={q} onChange={setQ} placeholder="Search name or email…" />
        <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} aria-label="Role">
          <option value="">All roles</option>
          {roles
            .filter((r) => r.key !== 'CLIENT')
            .map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="INVITED">Invited</option>
          <option value="DEACTIVATED">Deactivated</option>
        </Select>
        <button
          className="adm-btn-primary"
          onClick={() => {
            setErrors({});
            setInviteResult(null);
            setInvite({ name: '', email: '', roleKey: assignable.find((r) => r.key === 'EVENT_MANAGER')?.key ?? assignable[0]?.key ?? '', title: '', phone: '' });
            setInviting(true);
          }}
        >
          <MailPlus className="h-4 w-4" /> Invite staff
        </button>
      </div>
      {users.isError ? <AdmError error={users.error} onRetry={() => users.refetch()} /> : <DataTable columns={columns} rows={users.data} rowKey={(u) => u.id} loading={users.isLoading} empty="No staff match these filters." />}

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title={inviteResult ? 'Invitation ready' : 'Invite a staff member'}
        footer={
          inviteResult ? (
            <button className="adm-btn-primary" onClick={() => setInviting(false)}>
              Done
            </button>
          ) : (
            <>
              <button className="adm-btn-secondary" onClick={() => setInviting(false)}>
                Cancel
              </button>
              <button className="adm-btn-primary" type="submit" form="invite-form" disabled={inviteM.isPending}>
                {inviteM.isPending ? 'Inviting…' : 'Send invitation'}
              </button>
            </>
          )
        }
      >
        {inviteResult ? (
          <InviteResult delivery={inviteResult.delivery} email={inviteResult.email} />
        ) : (
          <form id="invite-form" onSubmit={submitInvite} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Full name" required error={errors.name}>
              <Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} maxLength={120} invalid={!!errors.name} />
            </Field>
            <Field label="Work email" required error={errors.email}>
              <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} maxLength={200} invalid={!!errors.email} />
            </Field>
            <Field label="Role" required error={errors.roleKey} hint={roles.find((r) => r.key === invite.roleKey)?.description}>
              <Select value={invite.roleKey} onChange={(e) => setInvite({ ...invite, roleKey: e.target.value })} aria-label="Role" invalid={!!errors.roleKey}>
                {assignable.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Job title" error={errors.title}>
              <Input value={invite.title} onChange={(e) => setInvite({ ...invite, title: e.target.value })} maxLength={120} placeholder="e.g. Senior planner" />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input type="tel" value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} maxLength={40} />
            </Field>
            <p className="text-xs text-adm-muted sm:col-span-2">They’ll receive a link to set their password. The link is valid for 72 hours.</p>
          </form>
        )}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : ''}
        footer={
          <>
            <button className="adm-btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="adm-btn-primary" type="submit" form="edit-staff" disabled={editM.isPending}>
              {editM.isPending ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {editing && (
          <form
            id="edit-staff"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!edit.name.trim()) return setErrors({ name: 'Name is required' });
              editM.mutate();
            }}
          >
            <Field label="Full name" required error={errors.name}>
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={120} invalid={!!errors.name} />
            </Field>
            <Field label="Role" error={errors.roleKey} hint={editing.isSelf ? 'You cannot change your own role.' : undefined}>
              <Select value={edit.roleKey} onChange={(e) => setEdit({ ...edit, roleKey: e.target.value })} disabled={editing.isSelf || (editing.roleKey === 'SUPER_ADMIN' && !isSuper)} aria-label="Role">
                {roles
                  .filter((r) => r.key !== 'CLIENT' && (isSuper || r.key !== 'SUPER_ADMIN' || r.key === editing.roleKey))
                  .map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Job title" error={errors.title}>
              <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} maxLength={40} />
            </Field>
            <p className="text-xs text-adm-muted sm:col-span-2">Email: {editing.email}</p>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'deactivate' ? `Deactivate ${confirm.user.name}?` : `Revoke sessions for ${confirm?.user.name}?`}
        body={confirm?.action === 'deactivate' ? 'They will be signed out everywhere and cannot sign in until reactivated. Their records and history are kept.' : 'They will be signed out on every device and must sign in again.'}
        confirmLabel={confirm?.action === 'deactivate' ? 'Deactivate' : 'Revoke sessions'}
        danger={confirm?.action === 'deactivate'}
        loading={action.isPending}
        onConfirm={() => confirm && action.mutate({ user: confirm.user, a: confirm.action })}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function RolesTab({ roles, isSuper, myPermissions }: { roles: Role[]; isSuper: boolean; myPermissions: string[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const ordered = useMemo(() => {
    const order = ['SUPER_ADMIN', 'OWNER', 'EVENT_MANAGER', 'SALES_EXECUTIVE', 'FINANCE_MANAGER', 'CONTENT_EDITOR', 'VENDOR_COORDINATOR', 'OPERATIONS_STAFF', 'CLIENT'];
    const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : 50);
    return [...roles].sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name));
  }, [roles]);
  const current = (r: Role) => draft[r.key] ?? new Set(r.permissions);
  const diffOf = (r: Role) => {
    const now = current(r);
    return { added: [...now].filter((p) => !r.permissions.includes(p)), removed: r.permissions.filter((p) => !now.has(p)) };
  };
  const dirty = (r: Role) => {
    const d = diffOf(r);
    return d.added.length + d.removed.length > 0;
  };
  const toggle = (r: Role, p: string) =>
    setDraft((d) => {
      const s = new Set(d[r.key] ?? r.permissions);
      if (s.has(p)) s.delete(p);
      else s.add(p);
      return { ...d, [r.key]: s };
    });
  const save = useMutation({
    mutationFn: (r: Role) => api.put<Role>(`/admin/staff/roles/${r.key}`, { permissions: [...current(r)] }),
    onSuccess: (_row, r) => {
      toast.success(`${r.name} permissions saved`, 'Members get the new access on their next request.');
      setDraft((d) => {
        const n = { ...d };
        delete n[r.key];
        return n;
      });
      setConfirmKey(null);
      qc.invalidateQueries({ queryKey: ['staff-roles'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => {
      setConfirmKey(null);
      toast.error('Permissions not saved', errorMessage(err));
    },
  });
  const confirmRole = ordered.find((r) => r.key === confirmKey);
  const confirmDiff = confirmRole ? diffOf(confirmRole) : null;
  const locked = (r: Role) => !r.editable || (r.key === 'SUPER_ADMIN' && !isSuper);
  const groups = PERM_GROUPS.map((g) => ({ ...g, perms: ALL_PERMISSIONS.filter((p) => g.prefix.includes(p.split('.')[0])) }));

  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-adm-muted">
        Tick the permissions each role should have, then save that role. Super Admin always has every permission and the Client role never holds staff permissions.
        {!isSuper && ' You can only grant permissions you hold yourself.'}
      </p>
      <div className="adm-card overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 min-w-[260px] border-b border-r border-adm-line bg-white px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-adm-muted">Permission</th>
                {ordered.map((r) => (
                  <th key={r.key} className="min-w-[118px] border-b border-adm-line px-2 py-3 text-center align-bottom">
                    <span className="flex items-center justify-center gap-1 text-xs font-semibold">
                      {locked(r) && <Lock className="h-3 w-3 text-adm-muted" aria-label="Locked" />}
                      {r.name}
                    </span>
                    <span className="block text-[11px] font-normal text-adm-muted">
                      {r.userCount} member{r.userCount === 1 ? '' : 's'}
                    </span>
                    {dirty(r) ? (
                      <span className="mt-1.5 flex justify-center gap-1">
                        <button className="adm-btn-gold px-2 py-0.5 text-[11px]" onClick={() => setConfirmKey(r.key)}>
                          Save
                        </button>
                        <button
                          className="adm-btn-ghost px-1.5 py-0.5 text-[11px]"
                          aria-label={`Discard changes to ${r.name}`}
                          onClick={() =>
                            setDraft((d) => {
                              const n = { ...d };
                              delete n[r.key];
                              return n;
                            })
                          }
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <span className="mt-1.5 block h-[22px]" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.label} label={g.label} perms={g.perms} roles={ordered} current={current} locked={locked} toggle={toggle} canGrant={(p) => isSuper || myPermissions.includes(p)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={!!confirmRole}
        title={`Save permissions for ${confirmRole?.name ?? ''}?`}
        confirmLabel="Save permissions"
        loading={save.isPending}
        onConfirm={() => confirmRole && save.mutate(confirmRole)}
        onClose={() => setConfirmKey(null)}
        body={`${confirmRole?.userCount ?? 0} member(s) will be affected immediately.`}
      >
        {confirmDiff && (
          <div className="mt-4 space-y-3 text-sm">
            {confirmDiff.added.length > 0 && (
              <div>
                <p className="adm-label text-emerald-700">Granting</p>
                <ul className="space-y-1">
                  {confirmDiff.added.map((p) => (
                    <li key={p} className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-900">
                      + {PERMISSIONS[p as Permission] ?? p} <code className="text-[11px] opacity-60">{p}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {confirmDiff.removed.length > 0 && (
              <div>
                <p className="adm-label text-red-700">Removing</p>
                <ul className="space-y-1">
                  {confirmDiff.removed.map((p) => (
                    <li key={p} className="rounded-md bg-red-50 px-2 py-1 text-red-900">
                      − {PERMISSIONS[p as Permission] ?? p} <code className="text-[11px] opacity-60">{p}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

function GroupRows({ label, perms, roles, current, locked, toggle, canGrant }: { label: string; perms: Permission[]; roles: Role[]; current: (r: Role) => Set<string>; locked: (r: Role) => boolean; toggle: (r: Role, p: string) => void; canGrant: (p: string) => boolean }) {
  return (
    <>
      <tr>
        <th colSpan={roles.length + 1} className="sticky left-0 border-b border-adm-line bg-adm-bg/80 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-adm-muted">
          {label}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="group">
          <th scope="row" className="sticky left-0 z-10 border-b border-r border-adm-line/70 bg-white px-4 py-2 text-left font-normal group-hover:bg-adm-bg">
            <span className="block text-sm">{PERMISSIONS[p]}</span>
            <code className="text-[11px] text-adm-muted">{p}</code>
          </th>
          {roles.map((r) => {
            const on = current(r).has(p);
            const isLocked = locked(r);
            const orig = r.permissions.includes(p);
            const noGrant = !on && !canGrant(p);
            return (
              <td key={r.key} className={cn('border-b border-adm-line/70 text-center group-hover:bg-adm-bg/60', on !== orig && 'bg-[#FBF5E8]')}>
                <label className={cn('inline-flex h-9 w-9 items-center justify-center rounded-md', !isLocked && !noGrant && 'cursor-pointer hover:bg-adm-bg')}>
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={on}
                    disabled={isLocked || noGrant}
                    onChange={() => toggle(r, p)}
                    aria-label={`${r.name}: ${PERMISSIONS[p]}`}
                  />
                  <span
                    className={cn(
                      'flex h-[18px] w-[18px] items-center justify-center rounded border transition peer-focus-visible:ring-2 peer-focus-visible:ring-adm-gold/50',
                      on ? (isLocked ? 'border-adm-muted/40 bg-adm-muted/40 text-white' : 'border-adm-dark bg-adm-dark text-white') : 'border-adm-line bg-white',
                      (isLocked || noGrant) && !on && 'bg-adm-bg',
                    )}
                    aria-hidden
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </label>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function StaffScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const roles = useRoles();
  const isSuper = user?.roleKey === 'SUPER_ADMIN';
  return (
    <div>
      <PageHeader title="Staff & roles" subtitle="Invite your team, manage access and decide what each role can see and do." />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Staff' },
          { value: 'roles', label: 'Roles & permissions' },
        ]}
      />
      {roles.isLoading ? <SkeletonRows rows={6} /> : roles.isError ? <AdmError error={roles.error} onRetry={() => roles.refetch()} /> : tab === 'users' ? <UsersTab roles={roles.data!} isSuper={isSuper} /> : <RolesTab roles={roles.data!} isSuper={isSuper} myPermissions={user?.permissions ?? []} />}
    </div>
  );
}

export default function StaffPage() {
  return (
    <RequirePerm any={['staff.manage']}>
      <StaffScreen />
    </RequirePerm>
  );
}
