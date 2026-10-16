import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FlaskConical, Lock, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, money, titleCase } from '@/lib/format';
import { Notice } from '@/auth/ui';
import type { BookingDetail, Installment, PaymentOrder } from '../types';
import { daysUntil, Panel, SectionHead, Tag, type Tone } from '../ui';
import { openRazorpay } from './checkout';

type Result = { tone: 'success' | 'info' | 'error'; title: string; body?: string };

function installmentState(i: Installment): { label: string; tone: Tone } {
  if (i.status === 'PAID') return { label: 'Paid', tone: 'success' };
  if (i.status === 'WAIVED') return { label: 'Waived', tone: 'muted' };
  const d = daysUntil(i.dueDate);
  if (d !== null && d < 0) return { label: i.status === 'PARTIAL' ? 'Part paid · overdue' : 'Overdue', tone: 'danger' };
  if (i.status === 'PARTIAL') return { label: 'Part paid', tone: 'warning' };
  if (d !== null && d <= 14) return { label: 'Due soon', tone: 'gold' };
  return { label: 'Upcoming', tone: 'muted' };
}

const INVOICE_TONE: Record<string, Tone> = { PAID: 'success', PARTIALLY_PAID: 'warning', ISSUED: 'gold', DRAFT: 'muted' };

export default function PaymentsTab({ booking: b }: { booking: BookingDetail }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState<PaymentOrder | null>(null);
  const [sandboxBusy, setSandboxBusy] = useState<'success' | 'failure' | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [paid, setPaid] = useState<PaymentOrder | null>(null);
  const fin = b.financials;
  const progress = fin.contractValueMinor > 0 ? Math.min(100, Math.round((fin.paidMinor / fin.contractValueMinor) * 100)) : 0;
  const open = b.installments.filter((i) => i.status === 'PENDING' || i.status === 'PARTIAL');

  const refetch = () => {
    void qc.invalidateQueries({ queryKey: ['portal', 'booking', b.id] });
    void qc.invalidateQueries({ queryKey: ['portal', 'overview'] });
  };
  const onSuccess = (order: PaymentOrder) => {
    setResult(null);
    setPaid(order);
    refetch();
  };
  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'PAYMENT_PENDING') setResult({ tone: 'info', title: 'Payment processing', body: err.message });
    else setResult({ tone: 'error', title: 'Payment not completed', body: errorMessage(err) });
    refetch();
  };
  const reportFailed = (orderId: string, reason: string) => api.post('/portal/payments/failed', { orderId, reason }).catch(() => undefined);

  async function pay(installmentId: string | null) {
    setBusy(installmentId ?? 'balance');
    setResult(null);
    try {
      const order = await api.post<PaymentOrder>(`/portal/bookings/${b.id}/payments/order`, { installmentId });
      if (order.provider === 'sandbox') {
        setSandbox(order);
        return;
      }
      const out = await openRazorpay(order);
      if (out.kind === 'success') {
        try {
          await api.post('/portal/payments/verify', { orderId: order.orderId, paymentId: out.paymentId, signature: out.signature });
          onSuccess(order);
        } catch (err) {
          onError(err);
        }
      } else {
        await reportFailed(order.orderId, out.kind === 'dismissed' ? 'Checkout closed by client' : out.reason);
        setResult(out.kind === 'dismissed' ? { tone: 'info', title: 'Payment cancelled', body: 'No money was taken. You can try again whenever you’re ready.' } : { tone: 'error', title: 'Payment failed', body: `${out.reason}. No money was taken.` });
      }
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  async function sandboxOutcome(outcome: 'success' | 'failure') {
    if (!sandbox) return;
    setSandboxBusy(outcome);
    const order = sandbox;
    try {
      await api.post('/portal/payments/sandbox', { orderId: order.orderId, outcome });
      setSandbox(null);
      onSuccess(order);
    } catch (err) {
      setSandbox(null);
      onError(err);
    } finally {
      setSandboxBusy(null);
    }
  }

  function closeSandbox() {
    if (!sandbox || sandboxBusy) return;
    void reportFailed(sandbox.orderId, 'Checkout closed by client');
    setSandbox(null);
    setResult({ tone: 'info', title: 'Payment cancelled', body: 'No money was taken.' });
  }

  return (
    <div className="space-y-14">
      <section aria-labelledby="sum-h">
        <div aria-live="polite" className={result ? 'mb-8' : undefined}>
          {result && (
            <Notice tone={result.tone}>
              <p className="text-ink">{result.title}</p>
              {result.body && <p className="mt-0.5 text-muted">{result.body}</p>}
            </Notice>
          )}
        </div>
        <h2 id="sum-h" className="sr-only">
          Summary
        </h2>
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3" style={{ borderRadius: 'var(--radius)' }}>
          {[
            { label: 'Contract value', value: fin.contractValueMinor },
            { label: 'Paid to date', value: fin.paidMinor },
            { label: 'Balance', value: fin.balanceMinor, accent: true },
          ].map((s) => (
            <div key={s.label} className="bg-surface p-6 sm:p-8">
              <p className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
                {s.label}
              </p>
              <p className={cn('mt-3 font-heading text-[2rem] leading-none', s.accent && fin.balanceMinor > 0 ? 'text-primary' : 'text-ink')}>{money(s.value, b.currency)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <div className="h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Share of contract paid">
            <div className="h-full bg-primary transition-[width] duration-1000 ease-lux" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">{progress}% paid</p>
        </div>
        {fin.overpaidMinor > 0 && <p className="mt-3 text-sm text-muted">You have a credit of {money(fin.overpaidMinor, b.currency)} — your planner will be in touch about it.</p>}
      </section>

      <section aria-labelledby="sched-h">
        <SectionHead
          eyebrow="Schedule"
          title="Instalments"
          id="sched-h"
          action={
            b.paymentsEnabled && fin.balanceMinor > 0 && open.length > 1 ? (
              <Button size="sm" variant="secondary" loading={busy === 'balance'} disabled={!!busy} onClick={() => pay(null)}>
                Pay full balance · {money(fin.balanceMinor, b.currency)}
              </Button>
            ) : undefined
          }
        />
        {!b.paymentsEnabled && b.status !== 'COMPLETED' && (
          <Notice className="mb-6">
            {b.status === 'AWAITING_CONTRACT' ? 'Online payments open once your agreement has been signed.' : b.status === 'CANCELLED' ? 'This booking is cancelled, so payments are closed.' : 'Online payments are not open for this booking right now.'}
          </Notice>
        )}
        {b.installments.length ? (
          <Panel as="div" className="divide-y divide-line">
            {b.installments.map((i) => {
              const st = installmentState(i);
              const due = i.amountMinor - i.paidMinor;
              const canPay = b.paymentsEnabled && (i.status === 'PENDING' || i.status === 'PARTIAL') && due >= 100 && fin.balanceMinor > 0;
              return (
                <div key={i.id} className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-8">
                  <div className="min-w-0">
                    <p className="text-ink">{i.label}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {i.dueDate ? `Due ${fmtDate(i.dueDate)}` : 'Due date to be confirmed'}
                      {i.status === 'PARTIAL' && <> · {money(i.paidMinor, b.currency)} paid</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 sm:justify-end">
                    <Tag tone={st.tone}>{st.label}</Tag>
                    <span className="font-heading text-xl">{money(i.amountMinor, b.currency)}</span>
                  </div>
                  <div className="sm:w-40 sm:text-right">
                    {canPay ? (
                      <Button size="sm" className="w-full sm:w-auto" loading={busy === i.id} disabled={!!busy} onClick={() => pay(i.id)}>
                        Pay {i.status === 'PARTIAL' ? money(due, b.currency) : 'now'}
                      </Button>
                    ) : i.status === 'PAID' ? (
                      <CheckCircle2 className="ml-auto hidden h-5 w-5 text-success sm:block" aria-label="Paid" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Panel>
        ) : (
          <p className="text-sm text-muted">Your payment schedule will appear here once the booking is finalised.</p>
        )}
        {b.paymentsEnabled && fin.balanceMinor > 0 && open.length === 1 && open[0].amountMinor - open[0].paidMinor < fin.balanceMinor && (
          <div className="mt-4 text-right">
            <Button size="sm" variant="secondary" loading={busy === 'balance'} disabled={!!busy} onClick={() => pay(null)}>
              Pay full balance · {money(fin.balanceMinor, b.currency)}
            </Button>
          </div>
        )}
        {b.paymentsEnabled && (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {b.paymentProvider === 'razorpay' ? 'Payments are processed securely by Razorpay. We never see or store your card details.' : 'Test mode: payments are simulated and no real money is taken.'}
          </p>
        )}
      </section>

      <div className="grid gap-14 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="hist-h">
          <SectionHead eyebrow="Received" title="Payment history" id="hist-h" />
          {b.payments.length ? (
            <Panel as="div" className="divide-y divide-line">
              {b.payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div>
                    <p className="text-ink">{money(p.amountMinor, b.currency)}</p>
                    <p className="text-xs text-muted">
                      {fmtDate(p.paidAt)} · {p.method ? titleCase(p.method) : 'Payment'}
                      {p.refundedMinor > 0 && <> · {money(p.refundedMinor, b.currency)} refunded</>}
                    </p>
                  </div>
                  <Tag tone={p.status === 'PAID' ? 'success' : 'muted'}>{titleCase(p.status)}</Tag>
                </div>
              ))}
            </Panel>
          ) : (
            <Panel className="p-8 text-center text-sm text-muted">No payments yet.</Panel>
          )}
        </section>

        <section aria-labelledby="inv-h">
          <SectionHead eyebrow="Records" title="Invoices" id="inv-h" />
          {b.invoices.length ? (
            <Panel as="div" className="divide-y divide-line">
              {b.invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Receipt className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-ink">{inv.number}</p>
                      <p className="text-xs text-muted">
                        {money(inv.totalMinor, b.currency)} · issued {fmtDate(inv.issuedAt)}
                        {inv.dueDate && inv.status !== 'PAID' && <> · due {fmtDate(inv.dueDate)}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Tag tone={INVOICE_TONE[inv.status] ?? 'muted'}>{titleCase(inv.status)}</Tag>
                    <a href={api.url(`/portal/bookings/${b.id}/invoices/${inv.id}/pdf`)} download className="p-1.5 text-muted hover:text-primary" aria-label={`Download invoice ${inv.number} (PDF)`}>
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </Panel>
          ) : (
            <Panel className="p-8 text-center text-sm text-muted">Invoices will appear here as they are issued.</Panel>
          )}
        </section>
      </div>

      <Modal
        open={!!sandbox}
        onClose={closeSandbox}
        tone="site"
        size="sm"
        title="Test payment (sandbox — no real money)"
        footer={
          <>
            <Button variant="secondary" size="sm" loading={sandboxBusy === 'failure'} disabled={!!sandboxBusy} onClick={() => sandboxOutcome('failure')}>
              Decline
            </Button>
            <Button size="sm" loading={sandboxBusy === 'success'} disabled={!!sandboxBusy} onClick={() => sandboxOutcome('success')}>
              Approve
            </Button>
          </>
        }
      >
        {sandbox && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 border border-warning/40 bg-warning/10 p-4 text-sm" style={{ borderRadius: 'var(--radius)' }}>
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p>This site is in test mode. No card is charged — choose an outcome to simulate the payment gateway.</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">For</dt>
                <dd className="text-right">{sandbox.description}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Order</dt>
                <dd className="break-all text-right font-mono text-xs">{sandbox.orderId}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="text-muted">Amount</dt>
                <dd className="font-heading text-2xl">{money(sandbox.amountMinor, sandbox.currency)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      <Modal open={!!paid} onClose={() => setPaid(null)} tone="site" size="sm" title="Payment received">
        {paid && (
          <div className="space-y-4 py-2 text-center" role="status">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
            <p className="font-heading text-3xl">{money(paid.amountMinor, paid.currency)}</p>
            <p className="text-sm text-muted">
              Thank you — your payment for <span className="text-ink">{paid.label}</span> is confirmed. A receipt is on its way to your inbox.
            </p>
            <Button size="sm" onClick={() => setPaid(null)}>
              Done
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
