import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { money } from '@/lib/format';
import { Field, Input, MoneyInput, Select, Textarea } from '@/admin/ui';
import type { BookingDetail, BookingListItem, Payment } from '../types';
import { bookingKey, fieldErrors, PAYMENT_METHODS, todayIso } from './hooks';
import { Alert, BookingPicker } from './ui';

/**
 * Records an offline payment (bank transfer, cheque, cash…). The server re-checks the outstanding balance,
 * rejects duplicate references and audits the entry. When `bookingId` is omitted, a booking search is shown.
 */
export function ManualPaymentModal({ open, onClose, bookingId, installmentId }: { open: boolean; onClose: () => void; bookingId?: string; installmentId?: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<BookingListItem | null>(null);
  const id = bookingId ?? picked?.id ?? '';
  const detail = useQuery({ queryKey: bookingKey(id), queryFn: () => api.get<BookingDetail>(`/admin/bookings/${id}`), enabled: open && !!id });
  const b = detail.data;
  const [form, setForm] = useState({ installmentId: '', amountMinor: 0 as number | null, method: 'bank_transfer', reference: '', paidAt: todayIso() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setErrors({});
    setServerError(null);
    setForm({ installmentId: installmentId ?? '', amountMinor: 0, method: 'bank_transfer', reference: '', paidAt: todayIso() });
  }, [open, installmentId]);

  // Default the amount to the selected instalment's unpaid amount (capped by the booking balance).
  useEffect(() => {
    if (!b?.financials) return;
    const inst = b.installments.find((i) => i.id === form.installmentId);
    const due = inst ? Math.max(0, (inst.amountMinor ?? 0) - (inst.paidMinor ?? 0)) : b.financials.balanceMinor;
    setForm((f) => ({ ...f, amountMinor: Math.min(due, b.financials!.balanceMinor) }));
  }, [b, form.installmentId]);

  const balance = b?.financials?.balanceMinor ?? 0;
  const currency = b?.currency ?? 'INR';
  const tooMuch = (form.amountMinor ?? 0) > balance;

  const save = useMutation({
    mutationFn: () =>
      api.post<Payment>('/admin/finance/payments/manual', {
        bookingId: id,
        installmentId: form.installmentId || null,
        amountMinor: form.amountMinor ?? 0,
        method: form.method,
        reference: form.reference.trim(),
        paidAt: form.paidAt,
      }),
    onSuccess: () => {
      toast.success('Payment recorded', 'The entry has been added to the audit log.');
      qc.invalidateQueries({ queryKey: bookingKey(id) });
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      setServerError(errorMessage(err));
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!id) e.bookingId = 'Choose a booking';
    if (!form.amountMinor || form.amountMinor <= 0) e.amountMinor = 'Enter the amount received';
    else if (tooMuch) e.amountMinor = `Cannot exceed the outstanding balance of ${money(balance, currency)}`;
    if (form.reference.trim().length < 2) e.reference = 'Enter the bank / cheque / receipt reference';
    if (!form.paidAt) e.paidAt = 'Choose the date received';
    setErrors(e);
    if (Object.keys(e).length) return;
    setServerError(null);
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record manual payment"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" onClick={submit} disabled={save.isPending || !b || balance <= 0}>
            {save.isPending ? 'Recording…' : 'Record payment'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!bookingId && <BookingPicker value={picked} onChange={setPicked} required error={errors.bookingId} />}
        {id && detail.isLoading && <div className="h-16 animate-pulse rounded-lg bg-adm-line/60" />}
        {detail.isError && <Alert tone="error">{errorMessage(detail.error)}</Alert>}
        {b && b.financials && (
          <>
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-adm-bg p-3 text-sm">
              <div>
                <p className="text-xs text-adm-muted">Contract</p>
                <p className="font-medium tabular-nums">{money(b.financials.contractValueMinor, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-adm-muted">Received</p>
                <p className="font-medium tabular-nums">{money(b.financials.paidMinor, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-adm-muted">Balance</p>
                <p className="font-medium tabular-nums text-adm-gold">{money(balance, currency)}</p>
              </div>
            </div>
            {balance <= 0 && <Alert tone="info">Nothing is outstanding on this booking.</Alert>}
            {b.status === 'CANCELLED' && <Alert tone="error">This booking is cancelled — payments cannot be recorded.</Alert>}
            <Field label="Instalment" hint="Allocate the payment to an instalment (optional).">
              <Select value={form.installmentId} onChange={(e) => setForm({ ...form, installmentId: e.target.value })}>
                <option value="">Not linked to an instalment</option>
                {b.installments.map((i) => (
                  <option key={i.id} value={i.id} disabled={i.status === 'PAID' || i.status === 'WAIVED'}>
                    {i.label} — {money(i.amountMinor, currency)} ({i.status.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount received" required error={errors.amountMinor} hint={`Max ${money(balance, currency)}`}>
                <MoneyInput value={form.amountMinor} onChange={(v) => setForm({ ...form, amountMinor: v })} currency={currency} invalid={!!errors.amountMinor || tooMuch} />
              </Field>
              <Field label="Date received" required error={errors.paidAt}>
                <Input type="date" value={form.paidAt} max={todayIso()} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} invalid={!!errors.paidAt} />
              </Field>
              <Field label="Method" required>
                <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} options={PAYMENT_METHODS} />
              </Field>
              <Field label="Reference" required error={errors.reference} hint="UTR, cheque number or receipt number">
                <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} invalid={!!errors.reference} maxLength={120} />
              </Field>
            </div>
            <p className="text-xs text-adm-muted">Manual payments are recorded under your name in the audit log. Duplicate references are rejected.</p>
          </>
        )}
        {serverError && <Alert tone="error">{serverError}</Alert>}
      </div>
    </Modal>
  );
}

/** Requests a refund against a received payment. Approval happens in Finance → Refunds (by another person). */
export function RefundRequestModal({ open, onClose, payment, suggestedMinor }: { open: boolean; onClose: () => void; payment: Payment | null; suggestedMinor?: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const refundable = payment ? payment.amountMinor - payment.refundedMinor - payment.refunds.filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED').reduce((s, r) => s + r.amountMinor, 0) : 0;
  const [amount, setAmount] = useState<number | null>(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !payment) return;
    setAmount(Math.max(0, Math.min(refundable, suggestedMinor ?? refundable)));
    setReason('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment?.id]);
  const save = useMutation({
    mutationFn: () => api.post('/admin/finance/refunds', { paymentId: payment!.id, amountMinor: amount ?? 0, reason: reason.trim() }),
    onSuccess: () => {
      toast.success('Refund requested', 'A finance approver must approve it in Finance → Refunds.');
      qc.invalidateQueries({ queryKey: bookingKey(payment!.bookingId) });
      qc.invalidateQueries({ queryKey: ['finance'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const invalid = !amount || amount <= 0 || amount > refundable || reason.trim().length < 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request refund"
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={invalid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Requesting…' : 'Request refund'}
          </button>
        </>
      }
    >
      {payment && (
        <div className="space-y-4">
          <p className="text-sm text-adm-muted">
            Payment of <strong className="text-adm-ink">{money(payment.amountMinor, payment.currency)}</strong> via {payment.provider}
            {payment.reference ? ` (${payment.reference})` : ''}. Up to <strong className="text-adm-ink">{money(refundable, payment.currency)}</strong> can be refunded.
          </p>
          <Field label="Refund amount" required error={amount && amount > refundable ? `Cannot exceed ${money(refundable, payment.currency)}` : undefined}>
            <MoneyInput value={amount} onChange={setAmount} currency={payment.currency} invalid={!!amount && amount > refundable} />
          </Field>
          <Field label="Reason" required hint="Visible to finance approvers and recorded in the audit log.">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
