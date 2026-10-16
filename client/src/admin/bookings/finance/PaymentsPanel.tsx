import { useQuery } from '@tanstack/react-query';
import { PAYMENT_STATUSES } from '@maison/shared';
import { Download, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { api, download, errorMessage } from '@/lib/api';
import { fmtDateTime, money, titleCase } from '@/lib/format';
import { DataTable, Input, Pagination, SearchInput, Select, StatusBadge, type Column } from '@/admin/ui';
import type { Payment } from '../types';
import { methodLabel, providerLabel } from '../shared/hooks';
import { ManualPaymentModal, RefundRequestModal } from '../shared/financeModals';
import { LoadError } from '../shared/ui';

export function PaymentsPanel() {
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ q: '', status: '', provider: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(false);
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [exporting, setExporting] = useState(false);
  const filters = { q: f.q || undefined, status: f.status || undefined, provider: f.provider || undefined, from: f.from || undefined, to: f.to || undefined };
  const list = useQuery({ queryKey: ['finance', 'payments', filters, page], queryFn: () => api.getPaged<Payment[]>('/admin/finance/payments', { ...filters, page, limit: 25 }), placeholderData: (p) => p });
  const set = (k: keyof typeof f, v: string) => (setF((x) => ({ ...x, [k]: v })), setPage(1));
  const manage = can('finance.manage');

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download('/admin/finance/payments/export.csv', filters, 'payments.csv');
    } catch (err) {
      toast.error('Export failed', errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const cols: Column<Payment>[] = [
    { key: 'date', header: 'Date', cell: (p) => <span className="whitespace-nowrap">{fmtDateTime(p.paidAt ?? p.createdAt)}</span> },
    {
      key: 'booking',
      header: 'Booking',
      cell: (p) =>
        p.booking ? (
          <div className="min-w-[170px]">
            <Link to={`/admin/bookings/${p.booking.id}?tab=finance`} className="hover:text-adm-gold">
              {p.booking.reference}
            </Link>
            <p className="text-xs text-adm-muted">
              {p.booking.client.name}
              {p.installment ? ` · ${p.installment.label}` : ''}
            </p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'via',
      header: 'Via',
      cell: (p) => (
        <div className="whitespace-nowrap">
          <p>{providerLabel(p.provider)}</p>
          <p className="text-xs text-adm-muted">{methodLabel(p.method)}</p>
        </div>
      ),
    },
    { key: 'ref', header: 'Reference', cell: (p) => <span className="block max-w-[180px] truncate font-mono text-xs" title={p.reference || p.providerPaymentId || ''}>{p.reference || p.providerPaymentId || '—'}</span> },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right whitespace-nowrap tabular-nums',
      cell: (p) => (
        <>
          {money(p.amountMinor, p.currency)}
          {p.refundedMinor > 0 && <span className="block text-xs text-adm-muted">−{money(p.refundedMinor, p.currency)} refunded</span>}
        </>
      ),
    },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
    ...(manage
      ? [
          {
            key: 'act',
            header: <span className="relative block"><span className="sr-only">Actions</span></span>,
            className: 'text-right',
            cell: (p: Payment) =>
              (p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') && p.amountMinor > p.refundedMinor ? (
                <button className="adm-btn-ghost whitespace-nowrap !px-2 !py-1 text-xs" onClick={() => setRefundFor(p)}>
                  Refund…
                </button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <button className="adm-btn-secondary" onClick={exportCsv} disabled={exporting}>
          <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        {manage && (
          <button className="adm-btn-primary" onClick={() => setRecording(true)}>
            <Plus className="h-4 w-4" /> Record manual payment
          </button>
        )}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <SearchInput value={f.q} onChange={(v) => set('q', v)} placeholder="Booking reference or client…" />
        <Select aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        <Select aria-label="Provider" value={f.provider} onChange={(e) => set('provider', e.target.value)}>
          <option value="">All providers</option>
          <option value="razorpay">Razorpay</option>
          <option value="manual">Manual</option>
          <option value="sandbox">Sandbox</option>
        </Select>
        <Input type="date" aria-label="From" value={f.from} onChange={(e) => set('from', e.target.value)} />
        <Input type="date" aria-label="To" value={f.to} min={f.from || undefined} onChange={(e) => set('to', e.target.value)} />
      </div>
      {list.isError ? (
        <LoadError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <DataTable columns={cols} rows={list.data?.data} rowKey={(p) => p.id} loading={list.isLoading} empty="No payments match these filters." />
          {list.data?.meta && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={setPage} />}
        </>
      )}
      <ManualPaymentModal open={recording} onClose={() => setRecording(false)} />
      <RefundRequestModal open={!!refundFor} onClose={() => setRefundFor(null)} payment={refundFor} />
    </div>
  );
}
