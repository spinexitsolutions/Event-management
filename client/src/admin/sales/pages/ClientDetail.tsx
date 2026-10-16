import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, KeyRound, Pencil, StickyNote } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BOOKING_STATUS_LABELS, INQUIRY_STATUS_LABELS, type BookingStatus } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, money, titleCase } from '@/lib/format';
import { Badge, Card, KeyValue, PageHeader, StatusBadge, Tabs } from '@/admin/ui';
import { LogCommunicationModal } from '../components/ActivityModals';
import { ClientFormModal } from '../components/ClientForm';
import { CopyField, PanelError, PortalBadge, SkeletonBlock } from '../components/common';
import { Timeline } from '../components/Timeline';
import { useStaff, type ClientDetail as Client } from '../lib';

type Tab = 'inquiries' | 'quotations' | 'bookings' | 'payments' | 'communication';

export default function ClientDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const staff = useStaff();
  const [tab, setTab] = useState<Tab>('inquiries');
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [invite, setInvite] = useState<{ alreadyActive: boolean; deliveredByEmail: boolean; inviteUrl: string | null } | null>(null);
  const q = useQuery({ queryKey: ['client', id], queryFn: () => api.get<Client>(`/admin/clients/${id}`) });
  const authors = useMemo(() => Object.fromEntries((staff.data ?? []).map((s) => [s.id, s.name])), [staff.data]);
  const inviteM = useMutation({
    mutationFn: () => api.post<{ alreadyActive: boolean; deliveredByEmail: boolean; inviteUrl: string | null }>(`/admin/clients/${id}/portal-invite`),
    onSuccess: (r) => {
      setInvite(r);
      void qc.invalidateQueries({ queryKey: ['client', id] });
    },
    onError: (err) => toast.error('Could not invite client', errorMessage(err)),
  });

  if (q.isError) return <PanelError error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  if (!c)
    return (
      <div className="space-y-4" aria-busy>
        <SkeletonBlock className="h-16 w-1/3" />
        <div className="grid gap-6 lg:grid-cols-3">
          <SkeletonBlock className="h-72" />
          <SkeletonBlock className="h-72 lg:col-span-2" />
        </div>
      </div>
    );
  const manage = can('clients.manage');
  const prefs = Object.entries(c.preferences ?? {});
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'inquiries', label: 'Inquiries', count: c.inquiries.length },
    ...(can('quotations.manage') ? [{ value: 'quotations' as Tab, label: 'Quotations', count: c.quotations.length }] : []),
    { value: 'bookings', label: 'Bookings', count: c.bookings.length },
    ...(c.payments ? [{ value: 'payments' as Tab, label: 'Payments', count: c.payments.length }] : []),
    { value: 'communication', label: 'Communication', count: c.communications.length },
  ];
  const lifetime = c.bookings.filter((b) => b.status !== 'CANCELLED').reduce((s, b) => s + Number(b.contractValueMinor), 0);

  return (
    <div>
      <PageHeader
        back={{ to: '/admin/clients', label: 'Clients' }}
        title={c.name}
        subtitle={[c.company, c.city, `Client since ${fmtDate(c.createdAt)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            {manage && (!c.user || c.user.status !== 'ACTIVE') && (
              <button className="adm-btn-secondary" disabled={inviteM.isPending} onClick={() => inviteM.mutate()}>
                <KeyRound className="h-4 w-4" /> {inviteM.isPending ? 'Inviting…' : c.user ? 'Resend portal invite' : 'Invite to client portal'}
              </button>
            )}
            {can('quotations.manage') && (
              <Link to={`/admin/quotations/new?clientId=${c.id}`} className="adm-btn-secondary">
                <FilePlus2 className="h-4 w-4" /> New quotation
              </Link>
            )}
            {manage && (
              <button className="adm-btn-primary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit profile
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <aside className="min-w-0 space-y-6">
          <Card title="Profile">
            <KeyValue
              cols={1}
              items={[
                ['Email', <a key="e" href={`mailto:${c.email}`} className="break-all hover:underline">{c.email}</a>],
                ['Phone', c.phone ? <a key="p" href={`tel:${c.phone.replace(/\s/g, '')}`} className="hover:underline">{c.phone}</a> : '—'],
                ['Company', c.company || '—'],
                ['City', c.city || '—'],
                ['Source', titleCase(c.source)],
                ['Relationship manager', c.relationshipManager?.name ?? '—'],
                ['Client portal', <span key="po" className="flex items-center gap-2"><PortalBadge status={c.user?.status} />{c.user?.lastLoginAt && <span className="text-xs text-adm-muted">last sign-in {fmtDateTime(c.user.lastLoginAt)}</span>}</span>],
                ['Tags', c.tags.length ? <div key="t" className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : '—'],
              ]}
            />
          </Card>
          <Card title="Preferences">
            {prefs.length ? (
              <dl className="space-y-2.5 text-sm">
                {prefs.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-adm-muted">{k}</dt>
                    <dd className="mt-0.5 whitespace-pre-line">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-adm-muted">No preferences recorded{manage ? ' — add style, cuisine or colour notes via Edit profile.' : '.'}</p>
            )}
          </Card>
          <Card title="Internal notes">{c.notes ? <p className="whitespace-pre-line text-sm">{c.notes}</p> : <p className="text-sm text-adm-muted">No notes.</p>}</Card>
        </aside>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="adm-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-adm-muted">Inquiries</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{c.inquiries.length}</p>
            </div>
            <div className="adm-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-adm-muted">Bookings</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{c.bookings.length}</p>
            </div>
            <div className="adm-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-adm-muted">Contract value</p>
              <p className="mt-2 truncate text-2xl font-semibold tabular-nums">{can('finance.view') || can('bookings.view') ? money(lifetime, c.bookings[0]?.currency) : '—'}</p>
            </div>
          </div>

          <div className="adm-card">
            <div className="px-5 pt-2">
              <Tabs tabs={tabs} value={tab} onChange={setTab} />
            </div>
            <div className="p-5">
              {tab === 'inquiries' &&
                (c.inquiries.length ? (
                  <List>
                    {c.inquiries.map((i) => (
                      <Row key={i.id} to={`/admin/inquiries/${i.id}`} title={i.eventType} meta={`${i.reference} · ${i.eventDate ? fmtDate(i.eventDate.slice(0, 10)) : 'Flexible date'} · received ${fmtDate(i.createdAt)}`} right={<StatusBadge status={i.status} label={INQUIRY_STATUS_LABELS[i.status]} />} />
                    ))}
                  </List>
                ) : (
                  <Empty text="No inquiries." />
                ))}
              {tab === 'quotations' &&
                (c.quotations.length ? (
                  <List>
                    {c.quotations.map((x) => (
                      <Row key={x.id} to={`/admin/quotations/${x.id}`} title={x.title} meta={`${x.number} · ${money(x.versions[0]?.totalMinor)} · ${fmtDate(x.createdAt)}`} right={<StatusBadge status={x.status} />} />
                    ))}
                  </List>
                ) : (
                  <Empty text="No quotations." />
                ))}
              {tab === 'bookings' &&
                (c.bookings.length ? (
                  <List>
                    {c.bookings.map((b) => (
                      <Row key={b.id} to={can('bookings.view') ? `/admin/bookings/${b.id}` : undefined} title={b.title} meta={`${b.reference} · ${fmtDate(b.eventDate.slice(0, 10))} · ${money(b.contractValueMinor, b.currency)}`} right={<StatusBadge status={b.status} label={BOOKING_STATUS_LABELS[b.status as BookingStatus]} />} />
                    ))}
                  </List>
                ) : (
                  <Empty text="No bookings." />
                ))}
              {tab === 'payments' &&
                c.payments &&
                (c.payments.length ? (
                  <div className="-mx-5 overflow-x-auto">
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Booking</th>
                          <th>Method</th>
                          <th className="text-right">Amount</th>
                          <th className="text-right">Refunded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                            <td className="font-mono text-xs">{p.booking.reference}</td>
                            <td>{titleCase(p.method)}</td>
                            <td className="text-right tabular-nums">{money(p.amountMinor, p.currency)}</td>
                            <td className="text-right tabular-nums text-adm-muted">{Number(p.refundedMinor) ? money(p.refundedMinor, p.currency) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="No payments received." />
                ))}
              {tab === 'communication' && (
                <>
                  {manage && (
                    <div className="mb-4 flex justify-end">
                      <button className="adm-btn-secondary" onClick={() => setNoting(true)}>
                        <StickyNote className="h-4 w-4" /> Add note / log contact
                      </button>
                    </div>
                  )}
                  <Timeline items={c.communications} authors={authors} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ClientFormModal open={editing} onClose={() => setEditing(false)} client={c} />
      <LogCommunicationModal open={noting} onClose={() => setNoting(false)} path={`/admin/clients/${c.id}/communications`} onDone={() => qc.invalidateQueries({ queryKey: ['client', id] })} />
      <Modal open={!!invite} onClose={() => setInvite(null)} title="Client portal invitation" size="sm" footer={<button className="adm-btn-primary" onClick={() => setInvite(null)}>Done</button>}>
        {invite?.alreadyActive ? (
          <p className="text-sm">This client already has an active portal account — they can sign in with their email.</p>
        ) : invite?.deliveredByEmail ? (
          <p className="text-sm">An invitation email has been sent to {c.email}. The link is valid for 72 hours.</p>
        ) : invite?.inviteUrl ? (
          <div className="space-y-3 text-sm" aria-live="polite">
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Email isn’t configured on this server, so no invitation was emailed. Share this one-time activation link with the client yourself (e.g. WhatsApp). It expires in 72 hours.
            </p>
            <CopyField value={invite.inviteUrl} label="Portal invitation link" />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="-my-2 divide-y divide-adm-line">{children}</ul>;
}
function Row({ to, title, meta, right }: { to?: string; title: string; meta: string; right: ReactNode }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-xs text-adm-muted">{meta}</p>
      </div>
      {right}
    </>
  );
  return <li>{to ? <Link to={to} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-adm-bg/60">{inner}</Link> : <div className="flex items-center gap-3 py-3">{inner}</div>}</li>;
}
const Empty = ({ text }: { text: string }) => <p className="py-8 text-center text-sm text-adm-muted">{text}</p>;
