import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye, Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, DataTable, PageHeader, Pagination, SearchInput, Select, StatusBadge, type Column } from '@/admin/ui';
import { Img } from '@/components/ui/Img';
import { api } from '@/lib/api';
import { money, titleCase } from '@/lib/format';
import { AdmError, RequirePerm } from '../shared';
import type { VenueRecord } from '../venues/types';

function VenuesScreen() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = { q, status, page, limit: 25 };
  const list = useQuery({ queryKey: ['venues', query], queryFn: () => api.getPaged<VenueRecord[]>('/admin/content/venues', query), placeholderData: keepPreviousData });
  const meta = list.data?.meta;
  const columns: Column<VenueRecord>[] = [
    {
      key: 'name',
      header: 'Venue',
      cell: (v) => (
        <div className="flex min-w-[220px] items-center gap-3">
          <Img src={v.coverImage || v.images[0]?.url} alt="" width={120} className="h-11 w-16 shrink-0 rounded-md object-cover" fallbackClassName="bg-adm-bg" />
          <div className="min-w-0">
            <p className="truncate font-medium">{v.name}</p>
            <p className="truncate text-xs text-adm-muted">{[v.city, v.region].filter(Boolean).join(', ') || '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'cap', header: 'Capacity', className: 'hidden md:table-cell tabular-nums', cell: (v) => (v.capacityMin || v.capacityMax ? `${v.capacityMin ?? '—'} – ${v.capacityMax ?? '—'}` : '—') },
    { key: 'own', header: 'Ownership', className: 'hidden md:table-cell', cell: (v) => <span>{titleCase(v.ownership)}{v.vendor && <span className="block text-xs text-adm-muted">{v.vendor.name}</span>}</span> },
    { key: 'price', header: 'Rental (internal)', className: 'hidden lg:table-cell tabular-nums', cell: (v) => (v.rentalPriceMinor ? money(v.rentalPriceMinor) : '—') },
    {
      key: 'flags',
      header: 'Flags',
      cell: (v) => (
        <div className="flex flex-wrap gap-1">
          {v.isPublic && (
            <Badge tone="blue">
              <Eye className="mr-1 h-3 w-3" /> Website
            </Badge>
          )}
          {v.exclusive && (
            <Badge tone="violet">
              <Lock className="mr-1 h-3 w-3" /> Exclusive
            </Badge>
          )}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (v) => <StatusBadge status={v.status} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Venues"
        subtitle="Partner, external and company venues — capacity, facilities, internal pricing and availability."
        actions={
          <button className="adm-btn-primary" onClick={() => nav('/admin/venues/new')}>
            <Plus className="h-4 w-4" /> New venue
          </button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search venues by name, city or slug…"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="">Draft & published</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>
      {list.isError ? (
        <AdmError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={list.data?.data} rowKey={(r) => r.id} loading={list.isLoading} onRowClick={(r) => nav(`/admin/venues/${r.id}`)} empty={q || status ? 'No venues match.' : 'No venues yet. Add the venues you work with to check availability and prevent double-booking.'} />
          {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
        </>
      )}
    </div>
  );
}

export default function VenuesPage() {
  return (
    <RequirePerm any={['venues.manage']}>
      <VenuesScreen />
    </RequirePerm>
  );
}
