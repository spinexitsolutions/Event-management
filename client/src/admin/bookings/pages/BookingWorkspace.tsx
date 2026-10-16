import { useMutation, useQuery } from '@tanstack/react-query';
import { BOOKING_STATUS_LABELS, BOOKING_TRANSITIONS, type BookingStatus } from '@maison/shared';
import { Archive, ArchiveRestore, CalendarDays, ChevronDown, ChevronLeft, MapPin, Users, XCircle } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { RequireStaff } from '@/app/guards';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, money } from '@/lib/format';
import { AdminSpinner, Field, Input, Select, StatusBadge, Tabs, Textarea } from '@/admin/ui';
import type { BookingDetail } from '../types';
import { countdownLabel, daysUntil, isConflict, todayIso, useBooking, useRefreshBooking, useStaff } from '../shared/hooks';
import { Alert, LoadError, ProgressBar, ReasonDialog } from '../shared/ui';

export interface TabProps {
  booking: BookingDetail;
}
const tab = (load: () => Promise<{ default: ComponentType<TabProps> }>) => lazy(load);
const TABS = {
  overview: tab(() => import('../workspace/OverviewTab')),
  finance: tab(() => import('../workspace/FinanceTab')),
  tasks: tab(() => import('../workspace/TasksTab')),
  vendors: tab(() => import('../workspace/VendorsTab')),
  resources: tab(() => import('../workspace/ResourcesTab')),
  guests: tab(() => import('../workspace/GuestsTab')),
  documents: tab(() => import('../workspace/DocumentsTab')),
  messages: tab(() => import('../workspace/MessagesTab')),
  requests: tab(() => import('../workspace/RequestsTab')),
  activity: tab(() => import('../workspace/ActivityTab')),
};
type TabKey = keyof typeof TABS;

interface Action {
  label: string;
  to?: BookingStatus;
  contract?: boolean;
}
function primaryAction(b: BookingDetail): Action | null {
  switch (b.status) {
    case 'AWAITING_CONTRACT':
      return { label: 'Record signed contract', contract: true };
    case 'AWAITING_ADVANCE':
      return b.contractSignedAt ? { label: 'Confirm booking', to: 'CONFIRMED' } : { label: 'Record signed contract', contract: true };
    case 'CONFIRMED':
      return { label: 'Start event', to: 'IN_PROGRESS' };
    case 'IN_PROGRESS':
      return { label: 'Mark awaiting final payment', to: 'AWAITING_FINAL_PAYMENT' };
    case 'AWAITING_FINAL_PAYMENT':
      return { label: 'Complete', to: 'COMPLETED' };
    default:
      return null;
  }
}

function Workspace() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshBooking(id);
  const staff = useStaff();
  const q = useBooking(id);
  const [sp, setSp] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [signedAt, setSignedAt] = useState(todayIso());
  const [override, setOverride] = useState<{ to: BookingStatus; message: string } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const manage = can('bookings.manage');
  const mayOverride = can('finance.manage') || user?.roleKey === 'OWNER' || user?.roleKey === 'SUPER_ADMIN';

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  const status = useMutation({
    mutationFn: (v: { to: BookingStatus; reason?: string; override?: boolean }) => api.post<BookingDetail>(`/admin/bookings/${id}/status`, { status: v.to, reason: v.reason ?? '', override: v.override ?? false }),
    onSuccess: (b, v) => {
      toast.success(v.override ? 'Status changed with override' : 'Status updated', BOOKING_STATUS_LABELS[b.status]);
      setOverride(null);
      setRefused(null);
      setCancelOpen(false);
      refresh();
    },
    onError: (err, v) => {
      if (isConflict(err) && !v.override && (v.to === 'CONFIRMED' || v.to === 'COMPLETED') && !/signed contract/i.test(errorMessage(err))) {
        if (mayOverride) setOverride({ to: v.to, message: errorMessage(err) });
        else setRefused(errorMessage(err));
        return;
      }
      if (!override) toast.error('Could not change status', errorMessage(err));
    },
  });
  const contract = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${id}/contract-signed`, { signedAt }),
    onSuccess: () => {
      toast.success('Signed contract recorded');
      setContractOpen(false);
      refresh();
    },
    onError: (err) => toast.error('Could not record the contract', errorMessage(err)),
  });
  const patch = useMutation({
    mutationFn: (body: Partial<{ managerId: string | null; archived: boolean }>) => api.patch(`/admin/bookings/${id}`, body),
    onSuccess: (_d, body) => {
      toast.success('archived' in body ? (body.archived ? 'Booking archived' : 'Booking restored') : 'Manager updated');
      refresh();
    },
    onError: (err) => toast.error('Could not update booking', errorMessage(err)),
  });

  if (q.isLoading) return <AdminSpinner />;
  if (q.isError || !q.data)
    return (
      <div>
        <Link to="/admin/bookings" className="mb-4 inline-flex items-center gap-1 text-xs text-adm-muted hover:text-adm-ink">
          <ChevronLeft className="h-3.5 w-3.5" /> Bookings
        </Link>
        <LoadError error={q.error instanceof ApiError && q.error.status === 404 ? new Error('This booking does not exist or was removed.') : q.error} onRetry={() => q.refetch()} />
      </div>
    );
  const b = q.data;

  const tabs: { value: TabKey; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    ...(can('finance.view') ? [{ value: 'finance' as const, label: 'Finance' }] : []),
    { value: 'tasks', label: 'Tasks', count: b._count.tasks || undefined },
    ...(can('vendors.view') ? [{ value: 'vendors' as const, label: 'Vendors', count: b._count.vendorAssignments || undefined }] : []),
    ...(can('venues.manage') ? [{ value: 'resources' as const, label: 'Resources' }] : []),
    ...(can('guests.manage') ? [{ value: 'guests' as const, label: 'Guests', count: b._count.guests || undefined }] : []),
    { value: 'documents', label: 'Documents', count: b.documents.length || undefined },
    { value: 'messages', label: b.unreadMessages ? `Messages · ${b.unreadMessages} new` : 'Messages' },
    { value: 'requests', label: 'Requests', count: b.changeRequests.filter((c) => c.status === 'OPEN').length || undefined },
    { value: 'activity', label: 'Activity' },
  ];
  const requested = sp.get('tab') as TabKey | null;
  const current: TabKey = requested && tabs.some((t) => t.value === requested) ? requested : 'overview';
  const Active = TABS[current];
  const setTab = (t: TabKey) => {
    const next = new URLSearchParams(sp);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    next.delete('task');
    setSp(next, { replace: true });
  };

  const action = primaryAction(b);
  const transitions = BOOKING_TRANSITIONS[b.status].filter((s) => s !== 'CANCELLED');
  const canCancel = BOOKING_TRANSITIONS[b.status].includes('CANCELLED');
  const days = daysUntil(b.eventDate);
  const live = b.status !== 'CANCELLED' && b.status !== 'COMPLETED';
  const runAction = (a: Action) => (a.contract ? setContractOpen(true) : a.to && status.mutate({ to: a.to }));

  return (
    <div>
      <Link to="/admin/bookings" className="mb-3 inline-flex items-center gap-1 text-xs text-adm-muted hover:text-adm-ink">
        <ChevronLeft className="h-3.5 w-3.5" /> Bookings
      </Link>

      <header className="adm-card mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs tracking-wide text-adm-muted">{b.reference}</span>
              <StatusBadge status={b.status} label={BOOKING_STATUS_LABELS[b.status]} />
              {b.archived && <StatusBadge status="ARCHIVED" label="Archived" />}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{b.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-adm-muted">
              <span>
                for{' '}
                {can('clients.view') ? (
                  <Link to={`/admin/clients/${b.client.id}`} className="font-medium text-adm-ink underline-offset-4 hover:underline">
                    {b.client.name}
                  </Link>
                ) : (
                  <span className="font-medium text-adm-ink">{b.client.name}</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden />
                {fmtDate(b.eventDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                {b.startTime && ` · ${b.startTime}`}
                {live && <span className={cn('ml-1 rounded-full px-2 py-0.5 text-xs font-medium', days >= 0 && days <= 14 ? 'bg-amber-50 text-amber-800' : 'bg-adm-bg text-adm-ink')}>{countdownLabel(b.eventDate)}</span>}
              </span>
              {(b.venueName || b.city) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {[b.venueName, b.city].filter(Boolean).join(', ')}
                </span>
              )}
              {b.guestCount && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4" aria-hidden /> {b.guestCount} guests
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {manage && action && (
                <button className="adm-btn-gold" onClick={() => runAction(action)} disabled={status.isPending || contract.isPending}>
                  {status.isPending ? 'Working…' : action.label}
                </button>
              )}
              {manage && b.status === 'IN_PROGRESS' && (
                <button className="adm-btn-secondary" onClick={() => status.mutate({ to: 'COMPLETED' })} disabled={status.isPending}>
                  Complete
                </button>
              )}
              {manage && (
                <div className="relative" ref={menuRef}>
                  <button className="adm-btn-secondary" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                    More <ChevronDown className="h-4 w-4" />
                  </button>
                  {menuOpen && (
                    <div role="menu" className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-adm-line bg-white py-1 shadow-xl">
                      {transitions.length > 0 && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-adm-muted">Move to</p>}
                      {transitions.map((s) => (
                        <button
                          key={s}
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-adm-bg"
                          onClick={() => {
                            setMenuOpen(false);
                            if (s === 'AWAITING_ADVANCE' && !b.contractSignedAt) setContractOpen(true);
                            else status.mutate({ to: s });
                          }}
                        >
                          {BOOKING_STATUS_LABELS[s]}
                        </button>
                      ))}
                      {b.status === 'AWAITING_CONTRACT' || (b.status === 'AWAITING_ADVANCE' && !b.contractSignedAt) ? null : !b.contractSignedAt && live ? (
                        <button role="menuitem" className="block w-full px-3 py-2 text-left text-sm hover:bg-adm-bg" onClick={() => (setMenuOpen(false), setContractOpen(true))}>
                          Record signed contract
                        </button>
                      ) : null}
                      <div className="my-1 border-t border-adm-line" />
                      <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-adm-bg" onClick={() => (setMenuOpen(false), patch.mutate({ archived: !b.archived }))}>
                        {b.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {b.archived ? 'Restore from archive' : 'Archive'}
                      </button>
                      {canCancel && (
                        <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => (setMenuOpen(false), setCancelOpen(true))}>
                          <XCircle className="h-4 w-4" /> Cancel booking
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex w-full items-center gap-2 lg:w-auto">
              <label htmlFor="mgr" className="whitespace-nowrap text-xs text-adm-muted">
                Event manager
              </label>
              <Select id="mgr" className="!py-1.5 lg:!w-52" value={b.managerId ?? ''} disabled={!manage || patch.isPending} onChange={(e) => patch.mutate({ managerId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {b.manager && !staff.data?.some((s) => s.id === b.manager!.id) && <option value={b.manager.id}>{b.manager.name}</option>}
              </Select>
            </div>
          </div>
        </div>
        <div className="grid gap-4 border-t border-adm-line bg-adm-bg/40 px-5 py-3 text-sm sm:grid-cols-3 lg:px-6">
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-adm-muted">
              <span>Planning progress</span>
              <span className="tabular-nums">
                {b.tasksDone}/{b._count.tasks} tasks
              </span>
            </div>
            <ProgressBar value={b.tasksDone} total={b._count.tasks} label="Tasks completed" />
          </div>
          {b.financials ? (
            <>
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-adm-muted">
                  <span>Received</span>
                  <span className="tabular-nums">
                    {money(b.financials.paidMinor, b.currency)} of {money(b.financials.contractValueMinor, b.currency)}
                  </span>
                </div>
                <ProgressBar value={Math.min(b.financials.paidMinor, b.financials.contractValueMinor)} total={b.financials.contractValueMinor} label="Payments received" />
              </div>
              <div className="flex items-center justify-between sm:justify-end sm:gap-2">
                <span className="text-xs text-adm-muted">Balance due</span>
                <span className="font-semibold tabular-nums">{money(b.financials.balanceMinor, b.currency)}</span>
              </div>
            </>
          ) : (
            <div className="text-xs text-adm-muted sm:col-span-2 sm:self-center">{b.contractSignedAt ? `Contract signed ${fmtDate(b.contractSignedAt)}` : 'Contract not yet signed'}</div>
          )}
        </div>
      </header>

      {b.status === 'CANCELLED' && (
        <Alert tone="error" title={`Cancelled ${fmtDate(b.cancelledAt)}`} className="mb-4">
          {b.cancelReason || 'No reason recorded.'} {can('finance.manage') ? 'Refunds are requested from the Finance tab.' : ''}
        </Alert>
      )}
      {refused && (
        <Alert tone="warn" title="The server refused this change" className="mb-4">
          {refused} Ask a finance manager or owner to apply an override.
        </Alert>
      )}

      <Tabs tabs={tabs} value={current} onChange={setTab} className="mb-6" />
      <Suspense fallback={<AdminSpinner />}>
        <Active booking={b} />
      </Suspense>

      <Modal
        open={contractOpen}
        onClose={() => setContractOpen(false)}
        title="Record signed contract"
        size="sm"
        footer={
          <>
            <button className="adm-btn-secondary" onClick={() => setContractOpen(false)}>
              Cancel
            </button>
            <button className="adm-btn-primary" onClick={() => contract.mutate()} disabled={contract.isPending || !signedAt}>
              {contract.isPending ? 'Saving…' : 'Record contract'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-adm-muted">The booking moves to “Awaiting advance payment”, or straight to “Confirmed” if the advance has already been received. Upload the signed copy in Documents.</p>
          <Field label="Signed on" required>
            <Input type="date" value={signedAt} max={todayIso()} onChange={(e) => setSignedAt(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <ReasonDialog
        open={!!override}
        title="Override payment rule"
        confirmLabel={override ? `Move to ${BOOKING_STATUS_LABELS[override.to].toLowerCase()}` : 'Override'}
        description={
          <div className="space-y-2">
            <Alert tone="warn">{override?.message}</Alert>
            <p>As a finance manager or owner you can apply this change anyway. The override and your reason are recorded in the audit log.</p>
          </div>
        }
        label="Reason for override"
        loading={status.isPending}
        error={status.isError && status.variables?.override ? errorMessage(status.error) : null}
        onClose={() => setOverride(null)}
        onSubmit={(reason) => override && status.mutate({ to: override.to, reason, override: true })}
      />

      <CancelDialog booking={b} open={cancelOpen} onClose={() => setCancelOpen(false)} loading={status.isPending} onConfirm={(reason) => status.mutate({ to: 'CANCELLED', reason })} />
    </div>
  );
}

interface CancelPreview {
  contractValueMinor: number;
  paidMinor: number;
  balanceMinor: number;
  currency: string;
  suggestion: { daysBeforeEvent: number; refundBps: number; amountMinor: number };
  policy: string;
}
function CancelDialog({ booking, open, onClose, onConfirm, loading }: { booking: BookingDetail; open: boolean; onClose: () => void; onConfirm: (reason: string) => void; loading: boolean }) {
  const { can } = useAuth();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const preview = useQuery({
    queryKey: ['cancel-preview', booking.id],
    queryFn: () => api.get<CancelPreview>(`/admin/bookings/${booking.id}/cancellation-preview`),
    enabled: open && can('finance.view'),
  });
  const p = preview.data;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cancel ${booking.reference}`}
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Keep booking
          </button>
          <button className="adm-btn-danger" disabled={reason.trim().length < 3 || loading} onClick={() => onConfirm(reason.trim())}>
            {loading ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-adm-muted">The client is notified, the venue and inventory holds are released, and the booking can no longer be edited. This cannot be undone.</p>
        {can('finance.view') &&
          (preview.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-adm-line/60" />
          ) : preview.isError ? (
            <Alert tone="error">{errorMessage(preview.error)}</Alert>
          ) : p ? (
            <div className="rounded-lg border border-adm-line">
              <div className="grid grid-cols-3 divide-x divide-adm-line">
                <div className="p-3">
                  <p className="text-xs text-adm-muted">Paid to date</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{money(p.paidMinor, p.currency)}</p>
                </div>
                <div className="p-3">
                  <p className="text-xs text-adm-muted">Days before event</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{p.suggestion.daysBeforeEvent}</p>
                </div>
                <div className="p-3">
                  <p className="text-xs text-adm-muted">Suggested refund</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-adm-gold">{money(p.suggestion.amountMinor, p.currency)}</p>
                  <p className="text-xs text-adm-muted">{(p.suggestion.refundBps / 100).toFixed(0)}% per policy</p>
                </div>
              </div>
              {p.policy && <p className="whitespace-pre-line border-t border-adm-line bg-adm-bg/50 p-3 text-xs text-adm-muted">{p.policy}</p>}
            </div>
          ) : null)}
        <Alert tone="info">Refunds are not issued automatically. After cancelling, request refunds against individual payments in the Finance tab — they require approval by a second person.</Alert>
        <Field label="Cancellation reason" required hint="Shared with the team and recorded in the audit log.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function BookingWorkspace() {
  return (
    <RequireStaff permission="bookings.view">
      <Workspace />
    </RequireStaff>
  );
}
