import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { INVOICE_STATUSES } from '@maison/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, money, titleCase } from '@/lib/format';
import { DataTable, Input, Pagination, SearchInput, Select, StatusBadge, type Column } from '@/admin/ui';
import type { Invoice } from '../types';
import { dateOnly, openFile } from '../shared/hooks';
import { LoadError, ReasonDialog } from '../shared/ui';

export function InvoicesPanel() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ q: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const query = { page, limit: 25, q: f.q || undefined, status: f.status || undefined, from: f.from || undefined, to: f.to || undefined };
  const list = useQuery({ queryKey: ['finance', 'invoices', query], queryFn: () => api.getPaged<Invoice[]>('/admin/finance/invoices', query), placeholderData: (p) => p });
  const set = (k: keyof typeof f, v: string) => (setF((x) => ({ ...x, [k]: v })), setPage(1));
  const voidInv = useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post(`/admin/finance/invoices/${v.id}/void`, { reason: v.reason }),
    onSuccess: () => {
      toast.success('Invoice voided');
      setVoiding(null);
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });

  const cols: Column<Invoice>[] = [
    { key: 'num', header: 'Invoice', cell: (i) => <span className="font-medium">{i.number}</span> },
    {
      key: 'booking',
      header: 'Booking',
      cell: (i) =>
        i.booking ? (
          <div className="min-w-[180px]">
            <Link to={`/admin/bookings/${i.booking.id}?tab=finance`} className="hover:text-adm-gold">
              {i.booking.reference}
            </Link>
            <p className="text-xs text-adm-muted">{i.booking.client.name}</p>
          </div>
        ) : (
          '—'
        ),
    },
    { key: 'kind', header: 'Type', cell: (i) => <span className="text-adm-muted">{titleCase(i.kind)}</span> },
    { key: 'issued', header: 'Issued', cell: (i) => <span className="whitespace-nowrap">{fmtDate(i.issuedAt)}</span> },
    { key: 'due', header: 'Due', cell: (i) => <span className="whitespace-nowrap">{fmtDate(dateOnly(i.dueDate))}</span> },
    { key: 'total', header: 'Total', className: 'text-right tabular-nums whitespace-nowrap', cell: (i) => money(i.totalMinor, i.currency) },
    { key: 'paid', header: 'Paid', className: 'text-right tabular-nums whitespace-nowrap', cell: (i) => money(i.paidMinor, i.currency) },
    { key: 'status', header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
    {
      key: 'act',
      header: <span className="relative block"><span className="sr-only">Actions</span></span>,
      className: 'text-right whitespace-nowrap',
      cell: (i) => (
        <>
          <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => openFile(`/admin/finance/invoices/${i.id}/pdf`)}>
            PDF
          </button>
          {can('finance.manage') && i.status !== 'VOID' && i.paidMinor === 0 && (
            <button className="adm-btn-ghost !px-2 !py-1 text-xs text-red-700" onClick={() => setVoiding(i)}>
              Void
            </button>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <SearchInput value={f.q} onChange={(v) => set('q', v)} placeholder="Invoice number, booking or client…" />
        <Select aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        <Input type="date" aria-label="Issued from" value={f.from} onChange={(e) => set('from', e.target.value)} />
        <Input type="date" aria-label="Issued to" value={f.to} min={f.from || undefined} onChange={(e) => set('to', e.target.value)} />
      </div>
      {list.isError ? (
        <LoadError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <DataTable columns={cols} rows={list.data?.data} rowKey={(i) => i.id} loading={list.isLoading} empty="No invoices match. Invoices are issued from a booking’s Finance tab." />
          {list.data?.meta && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={setPage} />}
        </>
      )}
      <ReasonDialog
        open={!!voiding}
        title={`Void invoice ${voiding?.number ?? ''}`}
        description="Voided invoices stay on record but no longer count towards the booking."
        confirmLabel="Void invoice"
        danger
        loading={voidInv.isPending}
        error={voidInv.isError ? errorMessage(voidInv.error) : null}
        onClose={() => (setVoiding(null), voidInv.reset())}
        onSubmit={(reason) => voiding && voidInv.mutate({ id: voiding.id, reason })}
      />
    </div>
  );
}
