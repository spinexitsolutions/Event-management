import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, DataTable, PageHeader, Pagination, Select, type Column } from '@/admin/ui';
import { ClientFormModal } from '../components/ClientForm';
import { PanelError, PortalBadge, SearchInput } from '../components/common';
import { useStaff, type ClientRow } from '../lib';

export default function ClientsList() {
  const { can } = useAuth();
  const nav = useNavigate();
  const staff = useStaff();
  const [sp, setSp] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const qText = sp.get('q') ?? '';
  const managerId = sp.get('managerId') ?? '';
  const page = Number(sp.get('page') || 1);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== 'page') n.delete('page');
    setSp(n, { replace: true });
  };
  const q = useQuery({ queryKey: ['clients', qText, managerId, page], queryFn: () => api.getPaged<ClientRow[]>('/admin/clients', { q: qText, managerId, page, limit: 25 }), placeholderData: (p) => p });

  const columns: Column<ClientRow>[] = [
    {
      key: 'name',
      header: 'Client',
      cell: (c) => (
        <div className="min-w-[160px]">
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-adm-muted">{c.company || c.email}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (c) => (
        <div className="text-xs">
          <p>{c.email}</p>
          <p className="text-adm-muted">{c.phone || '—'}</p>
        </div>
      ),
    },
    { key: 'city', header: 'City', cell: (c) => c.city || <span className="text-adm-muted">—</span> },
    { key: 'inq', header: 'Inquiries', className: 'text-right tabular-nums', cell: (c) => c._count.inquiries },
    { key: 'quo', header: 'Quotations', className: 'text-right tabular-nums', cell: (c) => c._count.quotations },
    { key: 'bk', header: 'Bookings', className: 'text-right tabular-nums', cell: (c) => c._count.bookings },
    { key: 'mgr', header: 'Manager', cell: (c) => c.relationshipManager?.name ?? <span className="text-adm-muted">—</span> },
    { key: 'portal', header: 'Portal', cell: (c) => <PortalBadge status={c.user?.status} /> },
    { key: 'tags', header: 'Tags', cell: (c) => <div className="flex max-w-[180px] flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}</div> },
    { key: 'since', header: 'Since', cell: (c) => <span className="whitespace-nowrap text-adm-muted">{fmtDate(c.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Profiles, preferences and history for every client relationship."
        actions={
          can('clients.manage') && (
            <button className="adm-btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New client
            </button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={qText} onChange={(v) => set('q', v)} placeholder="Search name, email, phone, company…" className="sm:max-w-sm sm:flex-1" />
        <Select aria-label="Relationship manager" value={managerId} onChange={(e) => set('managerId', e.target.value)} className="sm:w-56">
          <option value="">All managers</option>
          {staff.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      {q.isError ? (
        <PanelError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={q.data?.data} rowKey={(c) => c.id} loading={q.isLoading} onRowClick={(c) => nav(`/admin/clients/${c.id}`)} empty={qText || managerId ? 'No clients match your search.' : 'No clients yet.'} />
          {q.data?.meta && <Pagination page={q.data.meta.page} pages={q.data.meta.pages} total={q.data.meta.total} onPage={(p) => set('page', String(p))} />}
        </>
      )}
      <ClientFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => nav(`/admin/clients/${id}`)} />
    </div>
  );
}
