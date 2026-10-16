import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { Card, Field, Input, MoneyInput, Stat, StatusBadge, Textarea } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { Invoice, Payment } from '../types';
import { dateOnly, methodLabel, openFile, providerLabel, useRefreshBooking } from '../shared/hooks';
import { ManualPaymentModal, RefundRequestModal } from '../shared/financeModals';
import { Alert, ReasonDialog, SectionEmpty } from '../shared/ui';

const FINAL_ALLOWED = ['IN_PROGRESS', 'AWAITING_FINAL_PAYMENT', 'COMPLETED'];

export default function FinanceTab({ booking: b }: TabProps) {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshBooking(b.id);
  const manage = can('finance.manage');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [valueOpen, setValueOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const fin = b.financials;

  const issue = useMutation({
    mutationFn: (body: { kind: 'INSTALLMENT'; installmentId: string } | { kind: 'FINAL'; bookingId: string; notes: string }) => api.post<Invoice>('/admin/finance/invoices', body),
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.number} issued`);
      setFinalOpen(false);
      refresh();
    },
    onError: (err) => toast.error('Could not issue invoice', errorMessage(err)),
  });
  const voidInv = useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post(`/admin/finance/invoices/${v.id}/void`, { reason: v.reason }),
    onSuccess: () => {
      toast.success('Invoice voided');
      setVoiding(null);
      refresh();
    },
  });

  if (!fin) return <Alert tone="info">You don’t have access to financial information for this booking.</Alert>;
  const cur = b.currency;
  const activeInvoices = b.invoices.filter((i) => i.status !== 'VOID');
  const hasFinal = activeInvoices.some((i) => i.kind === 'FINAL');
  const scheduleTotal = b.installments.reduce((s, i) => s + (i.amountMinor ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Contract value" value={money(fin.contractValueMinor, cur)} hint={manage ? <button className="text-adm-gold hover:underline" onClick={() => setValueOpen(true)}>Change value</button> : undefined} />
        <Stat label="Received" value={money(fin.paidMinor, cur)} tone="good" hint={fin.contractValueMinor ? `${Math.round((fin.paidMinor / fin.contractValueMinor) * 100)}% of contract` : undefined} />
        <Stat label="Balance due" value={money(fin.balanceMinor, cur)} tone={fin.balanceMinor > 0 ? 'gold' : 'default'} />
        <Stat label="Overpaid" value={money(fin.overpaidMinor, cur)} tone={fin.overpaidMinor > 0 ? 'warn' : 'default'} hint={fin.overpaidMinor > 0 ? 'Request a refund against a payment' : 'None'} />
      </div>

      {scheduleTotal !== fin.contractValueMinor && b.installments.length > 0 && (
        <Alert tone="warn" title="Instalment schedule is out of balance">
          The instalments add up to {money(scheduleTotal, cur)}, but the contract value is {money(fin.contractValueMinor, cur)}. {manage ? 'Edit the schedule to rebalance it.' : 'Ask a finance manager to rebalance it.'}
        </Alert>
      )}

      <Card
        title="Instalment schedule"
        bodyClassName="p-0"
        actions={
          manage && b.status !== 'CANCELLED' ? (
            <>
              <button className="adm-btn-secondary !py-1.5" onClick={() => setScheduleOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit schedule
              </button>
              <button className="adm-btn-primary !py-1.5" onClick={() => setPayFor('')} disabled={fin.balanceMinor <= 0}>
                <Plus className="h-3.5 w-3.5" /> Record payment
              </button>
            </>
          ) : undefined
        }
      >
        {b.installments.length === 0 ? (
          <SectionEmpty icon={<Receipt className="h-5 w-5" />} title="No instalments yet" body="Split the contract value into an advance and further instalments so the client can pay online." action={manage ? <button className="adm-btn-primary" onClick={() => setScheduleOpen(true)}>Create schedule</button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Instalment</th>
                  <th>Due</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Paid</th>
                  <th>Status</th>
                  <th>Invoice</th>
                  {manage && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {b.installments.map((i) => {
                  const inv = activeInvoices.find((x) => x.installmentId === i.id);
                  const overdue = i.status !== 'PAID' && i.status !== 'WAIVED' && i.dueDate && dateOnly(i.dueDate) < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={i.id}>
                      <td className="font-medium">{i.label}</td>
                      <td className={cn('whitespace-nowrap', overdue && 'text-red-700')}>
                        {fmtDate(dateOnly(i.dueDate))}
                        {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                      </td>
                      <td className="text-right tabular-nums">{money(i.amountMinor, cur)}</td>
                      <td className="text-right tabular-nums">{money(i.paidMinor, cur)}</td>
                      <td>
                        <StatusBadge status={i.status} />
                      </td>
                      <td>
                        {inv ? (
                          <button className="text-adm-gold hover:underline" onClick={() => openFile(`/admin/finance/invoices/${inv.id}/pdf`)}>
                            {inv.number}
                          </button>
                        ) : manage && b.status !== 'CANCELLED' ? (
                          <button className="adm-btn-ghost !px-2 !py-1 text-xs" disabled={issue.isPending} onClick={() => issue.mutate({ kind: 'INSTALLMENT', installmentId: i.id })}>
                            Issue invoice
                          </button>
                        ) : (
                          <span className="text-adm-muted">—</span>
                        )}
                      </td>
                      {manage && (
                        <td className="text-right">
                          {i.status !== 'PAID' && i.status !== 'WAIVED' && b.status !== 'CANCELLED' && fin.balanceMinor > 0 && (
                            <button className="adm-btn-ghost whitespace-nowrap !px-2 !py-1 text-xs" onClick={() => setPayFor(i.id)}>
                              Record payment
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Invoices"
        bodyClassName="p-0"
        actions={
          manage && !hasFinal && FINAL_ALLOWED.includes(b.status) ? (
            <button className="adm-btn-secondary !py-1.5" onClick={() => setFinalOpen(true)}>
              <FileText className="h-3.5 w-3.5" /> Issue final invoice
            </button>
          ) : undefined
        }
      >
        {b.invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-adm-muted">No invoices issued. Issue one per instalment above{FINAL_ALLOWED.includes(b.status) ? ', or a final invoice' : '; the final invoice becomes available once the event is in execution'}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Type</th>
                  <th>Issued</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {b.invoices.map((inv) => (
                  <tr key={inv.id} className={inv.status === 'VOID' ? 'opacity-60' : undefined}>
                    <td className="font-medium">{inv.number}</td>
                    <td className="text-adm-muted">{inv.kind === 'FINAL' ? 'Final' : inv.kind === 'INSTALLMENT' ? (b.installments.find((i) => i.id === inv.installmentId)?.label ?? 'Instalment') : 'Custom'}</td>
                    <td className="whitespace-nowrap">{fmtDate(inv.issuedAt)}</td>
                    <td className="text-right tabular-nums">{money(inv.totalMinor, inv.currency)}</td>
                    <td className="text-right tabular-nums">{money(inv.paidMinor, inv.currency)}</td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => openFile(`/admin/finance/invoices/${inv.id}/pdf`)}>
                        PDF
                      </button>
                      {manage && inv.status !== 'VOID' && inv.paidMinor === 0 && (
                        <button className="adm-btn-ghost !px-2 !py-1 text-xs text-red-700" onClick={() => setVoiding(inv)}>
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Payments" bodyClassName="p-0">
        {b.payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-adm-muted">No payments yet. Online payments from the client portal and manual entries appear here.</p>
        ) : (
          <ul className="divide-y divide-adm-line">
            {b.payments.map((p) => (
              <PaymentRow key={p.id} payment={p} installment={b.installments.find((i) => i.id === p.installmentId)?.label} canRefund={manage} onRefund={() => setRefundFor(p)} />
            ))}
          </ul>
        )}
      </Card>

      <ScheduleEditor open={scheduleOpen} onClose={() => setScheduleOpen(false)} booking={b} />
      <ManualPaymentModal open={payFor !== null} onClose={() => setPayFor(null)} bookingId={b.id} installmentId={payFor || undefined} />
      <RefundRequestModal open={!!refundFor} onClose={() => setRefundFor(null)} payment={refundFor} suggestedMinor={fin.overpaidMinor > 0 ? fin.overpaidMinor : undefined} />
      <ReasonDialog
        open={!!voiding}
        title={`Void invoice ${voiding?.number ?? ''}`}
        description="Voided invoices stay on record but no longer count. You can then issue a replacement."
        confirmLabel="Void invoice"
        danger
        loading={voidInv.isPending}
        error={voidInv.isError ? errorMessage(voidInv.error) : null}
        onClose={() => (setVoiding(null), voidInv.reset())}
        onSubmit={(reason) => voiding && voidInv.mutate({ id: voiding.id, reason })}
      />
      <ContractValueModal open={valueOpen} onClose={() => setValueOpen(false)} bookingId={b.id} currency={cur} current={fin.contractValueMinor} paid={fin.paidMinor} />
      <FinalInvoiceModal open={finalOpen} onClose={() => setFinalOpen(false)} loading={issue.isPending} onIssue={(notes) => issue.mutate({ kind: 'FINAL', bookingId: b.id, notes })} />
    </div>
  );
}

function PaymentRow({ payment: p, installment, canRefund, onRefund }: { payment: Payment; installment?: string; canRefund: boolean; onRefund: () => void }) {
  const refundable = (p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') && p.amountMinor - p.refundedMinor > 0;
  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium tabular-nums">
            {money(p.amountMinor, p.currency)} <span className="ml-1 font-normal text-adm-muted">· {providerLabel(p.provider)}{p.method ? ` · ${methodLabel(p.method)}` : ''}</span>
          </p>
          <p className="mt-0.5 text-xs text-adm-muted">
            {p.paidAt ? fmtDateTime(p.paidAt) : `Started ${fmtDateTime(p.createdAt)}`}
            {installment ? ` · ${installment}` : ''}
            {p.reference || p.providerPaymentId ? ` · Ref ${p.reference || p.providerPaymentId}` : ''}
          </p>
          {p.failureReason && <p className="mt-0.5 text-xs text-red-700">{p.failureReason}</p>}
        </div>
        <div className="flex items-center gap-2">
          {p.refundedMinor > 0 && <span className="text-xs text-adm-muted">Refunded {money(p.refundedMinor, p.currency)}</span>}
          <StatusBadge status={p.status} />
          {canRefund && refundable && (
            <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={onRefund}>
              <RotateCcw className="h-3.5 w-3.5" /> Request refund
            </button>
          )}
        </div>
      </div>
      {p.refunds.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-adm-line pl-3">
          {p.refunds.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="tabular-nums">Refund {money(r.amountMinor, p.currency)}</span>
              <StatusBadge status={r.status} />
              <span className="text-adm-muted">
                {fmtDate(r.createdAt)} · {r.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface Row {
  id?: string;
  label: string;
  amountMinor: number | null;
  dueDate: string;
  paidMinor: number;
}
function ScheduleEditor({ open, onClose, booking: b }: { open: boolean; onClose: () => void } & TabProps) {
  const toast = useToast();
  const refresh = useRefreshBooking(b.id);
  const contract = b.financials?.contractValueMinor ?? 0;
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setRows(
      b.installments.length
        ? b.installments.map((i) => ({ id: i.id, label: i.label, amountMinor: i.amountMinor, dueDate: dateOnly(i.dueDate), paidMinor: i.paidMinor ?? 0 }))
        : [
            { label: 'Advance on confirmation', amountMinor: Math.round(contract * 0.4), dueDate: new Date().toISOString().slice(0, 10), paidMinor: 0 },
            { label: 'Final settlement', amountMinor: contract - Math.round(contract * 0.4), dueDate: b.eventDate, paidMinor: 0 },
          ],
    );
  }, [open, b, contract]);
  const total = rows.reduce((s, r) => s + (r.amountMinor ?? 0), 0);
  const diff = contract - total;
  const rowErrors = rows.map((r) => (!r.label.trim() ? 'Label required' : (r.amountMinor ?? 0) < r.paidMinor ? `Cannot be less than ${money(r.paidMinor, b.currency)} already paid` : null));
  const valid = diff === 0 && rows.length > 0 && rowErrors.every((e) => !e);
  const save = useMutation({
    mutationFn: () => api.put(`/admin/bookings/${b.id}/installments`, { installments: rows.map((r) => ({ id: r.id, label: r.label.trim(), amountMinor: r.amountMinor ?? 0, dueDate: r.dueDate || null })) }),
    onSuccess: () => {
      toast.success('Instalment schedule saved');
      refresh();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const upd = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const n = [...rs];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Instalment schedule"
      size="lg"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save schedule'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-adm-muted">The first instalment is the advance that confirms the booking. Instalments with payments cannot be removed or reduced below what has been paid.</p>
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="grid gap-3 rounded-lg border border-adm-line p-3 sm:grid-cols-[1fr_170px_150px_auto] sm:items-end">
            <Field label={i === 0 ? 'Label (advance)' : 'Label'} error={rowErrors[i] && !r.label.trim() ? rowErrors[i]! : undefined}>
              <Input value={r.label} onChange={(e) => upd(i, { label: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Amount" error={rowErrors[i] && r.label.trim() ? rowErrors[i]! : undefined}>
              <MoneyInput value={r.amountMinor} onChange={(v) => upd(i, { amountMinor: v })} currency={b.currency} invalid={!!rowErrors[i] && !!r.label.trim()} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={r.dueDate} onChange={(e) => upd(i, { dueDate: e.target.value })} />
            </Field>
            <div className="flex gap-1 pb-0.5">
              <button type="button" className="adm-btn-ghost !px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r.label} up`}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" className="adm-btn-ghost !px-2" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${r.label} down`}>
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" className="adm-btn-ghost !px-2 text-red-600" disabled={r.paidMinor > 0 || rows.length === 1} title={r.paidMinor > 0 ? 'Has payments — cannot be removed' : undefined} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.label}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="adm-btn-secondary !w-full" disabled={rows.length >= 20} onClick={() => setRows((rs) => [...rs, { label: `Instalment ${rs.length + 1}`, amountMinor: Math.max(0, diff), dueDate: '', paidMinor: 0 }])}>
          <Plus className="h-4 w-4" /> Add instalment
        </button>
        <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm', diff === 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900')} aria-live="polite">
          <span>
            Total <strong className="tabular-nums">{money(total, b.currency)}</strong> of contract <strong className="tabular-nums">{money(contract, b.currency)}</strong>
          </span>
          <span className="font-medium">{diff === 0 ? 'Balanced ✓' : diff > 0 ? `${money(diff, b.currency)} still to allocate` : `${money(-diff, b.currency)} over the contract value`}</span>
        </div>
        {diff !== 0 && rows.length > 0 && (
          <button type="button" className="text-xs text-adm-gold hover:underline" onClick={() => upd(rows.length - 1, { amountMinor: Math.max(0, (rows[rows.length - 1].amountMinor ?? 0) + diff) })}>
            Put the difference on the last instalment
          </button>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function ContractValueModal({ open, onClose, bookingId, currency, current, paid }: { open: boolean; onClose: () => void; bookingId: string; currency: string; current: number; paid: number }) {
  const toast = useToast();
  const refresh = useRefreshBooking(bookingId);
  const [value, setValue] = useState<number | null>(current);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setValue(current);
      setReason('');
      setError(null);
    }
  }, [open, current]);
  const save = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${bookingId}/contract-value`, { contractValueMinor: value ?? 0, reason: reason.trim() }),
    onSuccess: () => {
      toast.success('Contract value changed', 'Rebalance the instalment schedule to match.');
      refresh();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const tooLow = (value ?? 0) < paid;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change contract value"
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={value === null || value === current || tooLow || reason.trim().length < 3 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Change value'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-adm-muted">For an approved change in scope. The previous value, new value and reason are recorded on the booking and in the audit log.</p>
        <Field label="New contract value" required error={tooLow ? `Cannot be lower than ${money(paid, currency)} already received — issue a refund instead` : undefined} hint={`Currently ${money(current, currency)}`}>
          <MoneyInput value={value} onChange={setValue} currency={currency} invalid={tooLow} />
        </Field>
        <Field label="Reason" required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client added a sangeet night (approved by email 12 Oct)" />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function FinalInvoiceModal({ open, onClose, onIssue, loading }: { open: boolean; onClose: () => void; onIssue: (notes: string) => void; loading: boolean }) {
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (open) setNotes('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Issue final invoice"
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={loading} onClick={() => onIssue(notes.trim())}>
            {loading ? 'Issuing…' : 'Issue invoice'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-adm-muted">The final invoice lists every service against the full contract value and shows payments received and the balance due.</p>
        <Field label="Notes on the invoice" hint="Optional — defaults to a summary of payments received.">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Modal>
  );
}
