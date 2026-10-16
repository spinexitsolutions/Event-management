import { useQuery } from '@tanstack/react-query';
import { Download, MailOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, DataTable, PageHeader, SearchInput, Select, Stat, type Column } from '@/admin/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Callout } from '../components/bits';
import { downloadCsv } from '../lib/util';

interface Subscriber {
  id: string;
  email: string;
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED' | string;
  source: string;
  createdAt: string;
}

export default function Subscribers() {
  const q = useQuery({ queryKey: ['cms-subscribers'], queryFn: () => api.get<Subscriber[]>('/admin/settings/newsletter') });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('SUBSCRIBED');
  const rows = useMemo(() => (q.data ?? []).filter((s) => (!status || s.status === status) && (!search || s.email.toLowerCase().includes(search.toLowerCase()) || s.source.toLowerCase().includes(search.toLowerCase()))), [q.data, search, status]);
  const subscribed = (q.data ?? []).filter((s) => s.status === 'SUBSCRIBED').length;
  const last30 = (q.data ?? []).filter((s) => s.status === 'SUBSCRIBED' && Date.now() - new Date(s.createdAt).getTime() < 30 * 86400_000).length;

  const columns: Column<Subscriber>[] = [
    { key: 'email', header: 'Email', cell: (s) => <span className="font-medium">{s.email}</span> },
    { key: 'status', header: 'Status', cell: (s) => <Badge tone={s.status === 'SUBSCRIBED' ? 'green' : 'gray'}>{s.status === 'SUBSCRIBED' ? 'Subscribed' : 'Unsubscribed'}</Badge> },
    { key: 'source', header: 'Source', cell: (s) => <span className="text-adm-muted">{s.source}</span>, className: 'hidden sm:table-cell' },
    { key: 'created', header: 'Signed up', cell: (s) => <span className="text-adm-muted">{fmtDateTime(s.createdAt)}</span>, className: 'hidden md:table-cell' },
  ];

  return (
    <div>
      <PageHeader
        title="Newsletter subscribers"
        subtitle="People who opted in to your newsletter from the website. Only email those who are subscribed."
        back={{ to: '/admin/website/content', label: 'Content library' }}
        actions={
          <button className="adm-btn-secondary" disabled={!rows.length} onClick={() => downloadCsv(`newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`, [['email', 'status', 'source', 'signed_up'], ...rows.map((s) => [s.email, s.status, s.source, s.createdAt])])}>
            <Download className="h-4 w-4" /> Export CSV ({rows.length})
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Subscribed" value={q.isLoading ? '—' : subscribed} tone="good" />
        <Stat label="New in the last 30 days" value={q.isLoading ? '—' : last30} />
        <Stat label="Unsubscribed" value={q.isLoading ? '—' : (q.data?.length ?? 0) - subscribed} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput className="min-w-[220px] flex-1" value={search} onChange={setSearch} placeholder="Search email or source" />
        <Select className="w-44" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="SUBSCRIBED">Subscribed</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
          <option value="">All</option>
        </Select>
      </div>
      {q.isError ? (
        <Callout tone="danger" title="Couldn’t load subscribers">
          {errorMessage(q.error)}
        </Callout>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          loading={q.isLoading}
          empty={
            <span className="flex flex-col items-center gap-2">
              <MailOpen className="h-6 w-6" strokeWidth={1.25} />
              {search || status !== 'SUBSCRIBED' ? 'No subscribers match.' : 'No subscribers yet — the signup form appears in the footer and newsletter sections.'}
            </span>
          }
        />
      )}
      {q.data && q.data.length >= 5000 && <p className="mt-2 text-xs text-adm-muted">Showing the latest 5,000 subscribers.</p>}
    </div>
  );
}
