import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, money, titleCase } from '@/lib/format';
import { DataTable, Field, Input, Select, StatusBadge, type Column } from '@/admin/ui';
import type { Refund } from '../types';
import { providerLabel } from '../shared/hooks';
import { Alert, LoadError } from '../shared/ui';

const STATUSES = ['REQUESTED', 'APPROVED', 'PROCESSED', 'REJECTED', 'FAILED'];

export function RefundsPanel() {
  const { can, user } = useAuth();
  const [status, setStatus] = useState('');
  const [deciding, setDeciding] = useState<{ r: Refund; approve: boolean } | null>(null);
  const list = useQuery({ queryKey: ['finance', 'refunds'], queryFn: () => api.get<Refund[]>('/admin/finance/refunds') });
  const approver = can('refunds.approve');
  const rows = (list.data ?? []).filter((r) => !status || r.status === status);

  const cols: Column<Refund>[] = [
    { key: 'date', header: 'Requested', cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
    {
      key: 'booking',
      header: 'Booking',
      cell: (r) =>
        r.payment ? (
          <div className="min-w-[160px]">
            <Link to={`/admin/bookings/${r.payment.booking.id}?tab=finance`} className="hover:text-adm-gold">
              {r.payment.booking.reference}
            </Link>
            <p className="text-xs text-adm-muted">{r.payment.booking.client.name}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'amount',
      header: 'Refund',
      className: 'text-right whitespace-nowrap tabular-nums',
      cell: (r) => (
        <>
          {money(r.amountMinor, r.payment?.currency)}
          {r.payment && <span className="block text-xs text-adm-muted">of {money(r.payment.amountMinor, r.payment.currency)} · {providerLabel(r.payment.provider)}</span>}
        </>
      ),
    },
    { key: 'reason', header: 'Reason', cell: (r) => <p className="max-w-xs text-sm">{r.reason}</p> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div>
          <StatusBadge status={r.status} />
          {r.processedAt && <p className="mt-0.5 text-xs text-adm-muted">{fmtDateTime(r.processedAt)}</p>}
          {r.providerRefundId && <p className="mt-0.5 max-w-[160px] truncate font-mono text-[11px] text-adm-muted" title={r.providerRefundId}>{r.providerRefundId}</p>}
        </div>
      ),
    },
    ...(approver
      ? [
          {
            key: 'act',
            header: <span className="relative block"><span className="sr-only">Actions</span></span>,
            className: 'text-right whitespace-nowrap',
            cell: (r: Refund) =>
              r.status === 'REQUESTED' ? (
                <>
                  <button className="adm-btn-ghost !px-2 !py-1 text-xs text-red-700" onClick={() => setDeciding({ r, approve: false })}>
                    Reject
                  </button>
                  <button className="adm-btn-secondary !px-2 !py-1 text-xs" onClick={() => setDeciding({ r, approve: true })}>
                    Approve
                  </button>
                </>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-adm-muted">Refunds are requested from a payment and must be approved by a different person{approver ? '' : ' with refund-approval permission'}.</p>
        <Select aria-label="Status" className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
      </div>
      {list.isError ? <LoadError error={list.error} onRetry={() => list.refetch()} /> : <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={list.isLoading} empty={status ? 'No refunds with this status.' : 'No refunds have been requested.'} />}
      <DecideModal state={deciding} onClose={() => setDeciding(null)} selfRequested={!!deciding && deciding.r.requestedById === user?.id} />
    </div>
  );
}

function DecideModal({ state, onClose, selfRequested }: { state: { r: Refund; approve: boolean } | null; onClose: () => void; selfRequested: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [ref, setRef] = useState('');
  useEffect(() => {
    if (state) setRef('');
  }, [state]);
  const decide = useMutation({
    mutationFn: () => api.post<Refund>(`/admin/finance/refunds/${state!.r.id}/decide`, { approve: state!.approve, manualReference: ref.trim() }),
    onSuccess: (r) => {
      toast.success(state!.approve ? (r.status === 'PROCESSED' ? 'Refund approved and processed' : 'Refund approved — processing with the provider') : 'Refund rejected');
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['admin-booking'] });
      onClose();
    },
  });
  const r = state?.r;
  const manual = r?.payment?.provider === 'manual';
  return (
    <Modal
      open={!!state}
      onClose={() => (decide.reset(), onClose())}
      title={state?.approve ? 'Approve refund' : 'Reject refund'}
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className={state?.approve ? 'adm-btn-primary' : 'adm-btn-danger'} disabled={decide.isPending} onClick={() => decide.mutate()}>
            {decide.isPending ? 'Working…' : state?.approve ? `Approve ${r ? money(r.amountMinor, r.payment?.currency) : ''}` : 'Reject refund'}
          </button>
        </>
      }
    >
      {r && (
        <div className="space-y-4 text-sm">
          <p>
            <strong>{money(r.amountMinor, r.payment?.currency)}</strong> to {r.payment?.booking.client.name} ({r.payment?.booking.reference}). Reason: {r.reason}
          </p>
          {state?.approve &&
            (manual ? (
              <Field label="Refund reference" hint="The bank transfer / cheque reference you used to return the money (recorded on the refund).">
                <Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
              </Field>
            ) : (
              <Alert tone="info">This refund is sent to {providerLabel(r.payment?.provider ?? '')} automatically on approval.</Alert>
            ))}
          {state?.approve && selfRequested && <Alert tone="warn">You requested this refund. Unless you are an owner or super admin, a different person must approve it.</Alert>}
          {decide.isError && <Alert tone="error">{errorMessage(decide.error)}</Alert>}
        </div>
      )}
    </Modal>
  );
}
