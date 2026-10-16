import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QUOTATION_STATUSES } from '@maison/shared';
import { api } from '@/lib/api';
import { fmtDate, fromNow, money, titleCase } from '@/lib/format';
import { DataTable, PageHeader, Pagination, Select, StatusBadge, type Column } from '@/admin/ui';
import { PanelError, SearchInput } from '../components/common';
import type { QuotationRow } from '../lib';

export default function QuotationsList() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? '';
  const qText = sp.get('q') ?? '';
  const clientId = sp.get('clientId') ?? '';
  const page = Number(sp.get('page') || 1);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== 'page') n.delete('page');
    setSp(n, { replace: true });
  };
  const q = useQuery({
    queryKey: ['quotations', status, qText, clientId, page],
    queryFn: () => api.getPaged<QuotationRow[]>('/admin/quotations', { status, q: qText, clientId, page, limit: 25 }),
    placeholderData: (p) => p,
  });
  const clientName = clientId ? q.data?.data[0]?.client.name : undefined;

  const columns: Column<QuotationRow>[] = [
    { key: 'num', header: 'Number', cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{r.number}</span> },
    {
      key: 'title',
      header: 'Title',
      cell: (r) => (
        <div className="min-w-[180px]">
          <p className="font-medium">{r.title}</p>
          <p className="text-xs text-adm-muted">{r.client.name}</p>
        </div>
      ),
    },
    { key: 'event', header: 'Event date', cell: (r) => <span className="whitespace-nowrap">{r.eventDate ? fmtDate(r.eventDate.slice(0, 10)) : '—'}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'ver', header: 'Version', className: 'text-center tabular-nums', cell: (r) => `v${r.currentVersion}` },
    { key: 'total', header: 'Total', className: 'text-right tabular-nums whitespace-nowrap font-medium', cell: (r) => money(r.versions[0]?.totalMinor, r.currency) },
    { key: 'upd', header: 'Updated', cell: (r) => <time className="whitespace-nowrap text-adm-muted" dateTime={r.updatedAt}>{fromNow(r.updatedAt)}</time> },
  ];

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Branded proposals with versioning, optional services and payment milestones."
        actions={
          <button className="adm-btn-primary" onClick={() => nav(clientId ? `/admin/quotations/new?clientId=${clientId}` : '/admin/quotations/new')}>
            <Plus className="h-4 w-4" /> New quotation
          </button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={qText} onChange={(v) => set('q', v)} placeholder="Search number, title or client…" className="sm:max-w-sm sm:flex-1" />
        <Select aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)} className="sm:w-56">
          <option value="">All statuses</option>
          {QUOTATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        {clientId && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#F5EEDF] px-3 py-1 text-xs text-[#7A5F2B] sm:self-auto">
            Client: {clientName ?? 'selected client'}
            <button aria-label="Clear client filter" onClick={() => set('clientId', '')}>
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      {q.isError ? (
        <PanelError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={q.data?.data} rowKey={(r) => r.id} loading={q.isLoading} onRowClick={(r) => nav(`/admin/quotations/${r.id}`)} empty={status || qText || clientId ? 'No quotations match these filters.' : 'No quotations yet — create one from an inquiry.'} />
          {q.data?.meta && <Pagination page={q.data.meta.page} pages={q.data.meta.pages} total={q.data.meta.total} onPage={(p) => set('page', String(p))} />}
        </>
      )}
    </div>
  );
}
