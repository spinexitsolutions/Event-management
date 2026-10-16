import { useQuery } from '@tanstack/react-query';
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS } from '@maison/shared';
import { Download, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RequireStaff } from '@/app/guards';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { useToast } from '@/components/ui/Toast';
import { api, download, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, money } from '@/lib/format';
import { DataTable, Field, Input, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, type Column } from '@/admin/ui';
import type { BookingListItem } from '../types';
import { countdownLabel, daysUntil, useStaff } from '../shared/hooks';
import { NewBookingModal } from '../shared/NewBookingModal';
import { LoadError } from '../shared/ui';

type Scope = 'upcoming' | 'active' | 'past' | 'all' | 'archived';
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
  { value: 'archived', label: 'Archived' },
];
const FILTER_KEYS = ['status', 'managerId', 'city', 'categoryId', 'from', 'to'] as const;

function BookingsListInner() {
  const { can } = useAuth();
  const { bootstrap } = useSite();
  const toast = useToast();
  const nav = useNavigate();
  const staff = useStaff();
  const [sp, setSp] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((k) => sp.get(k)));
  const [exporting, setExporting] = useState(false);
  const finance = can('finance.view');

  const scope = (sp.get('scope') as Scope) || 'upcoming';
  const page = Number(sp.get('page') || 1);
  const params = {
    scope: scope === 'archived' ? 'all' : scope,
    archived: scope === 'archived' ? 'true' : 'false',
    q: sp.get('q') || undefined,
    status: sp.get('status') || undefined,
    managerId: sp.get('managerId') || undefined,
    city: sp.get('city') || undefined,
    categoryId: sp.get('categoryId') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
  };
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };

  const list = useQuery({
    queryKey: ['admin-bookings', params, page],
    queryFn: () => api.getPaged<BookingListItem[]>('/admin/bookings', { ...params, page, limit: 25 }),
    placeholderData: (prev) => prev,
  });
  const activeFilters = FILTER_KEYS.filter((k) => sp.get(k)).length;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download('/admin/bookings/export.csv', params, 'bookings.csv');
    } catch (err) {
      toast.error('Export failed', errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<BookingListItem>[] = [
    {
      key: 'ref',
      header: 'Booking',
      cell: (b) => (
        <div className="min-w-[160px] max-w-[260px]">
          <Link to={`/admin/bookings/${b.id}`} className="font-medium hover:text-adm-gold" onClick={(e) => e.stopPropagation()}>
            {b.title}
          </Link>
          <p className="text-xs text-adm-muted">
            {b.reference}
            {b.category ? ` · ${b.category.name}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'client', header: 'Client', cell: (b) => <span className="block min-w-[120px] max-w-[200px]">{b.client.name}</span> },
    {
      key: 'date',
      header: 'Event date',
      cell: (b) => {
        const d = daysUntil(b.eventDate);
        return (
          <div className="whitespace-nowrap">
            <p>
              {fmtDate(b.eventDate)}
              {b.eventEndDate && b.eventEndDate !== b.eventDate ? ` – ${fmtDate(b.eventEndDate, { day: 'numeric', month: 'short' })}` : ''}
            </p>
            {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && <p className={cn('text-xs', d >= 0 && d <= 14 ? 'text-amber-700' : 'text-adm-muted')}>{countdownLabel(b.eventDate)}</p>}
          </div>
        );
      },
    },
    {
      key: 'venue',
      header: 'Venue / city',
      cell: (b) => (
        <div className="max-w-[190px]">
          <p className="truncate" title={b.venueName}>{b.venueName || '—'}</p>
          <p className="text-xs text-adm-muted">{b.city || '—'}</p>
        </div>
      ),
    },
    { key: 'guests', header: 'Guests', className: 'text-right tabular-nums', cell: (b) => b.guestCount ?? '—' },
    { key: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} label={BOOKING_STATUS_LABELS[b.status]} /> },
    { key: 'manager', header: 'Manager', cell: (b) => <span className="block min-w-[90px] text-adm-muted">{b.manager?.name ?? 'Unassigned'}</span> },
    ...(finance ? [{ key: 'value', header: 'Contract value', className: 'text-right tabular-nums whitespace-nowrap', cell: (b: BookingListItem) => money(b.contractValueMinor, b.currency) }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Every confirmed engagement, from signed contract to final settlement."
        actions={
          <>
            {finance && (
              <button className="adm-btn-secondary" onClick={exportCsv} disabled={exporting}>
                <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            )}
            {can('bookings.manage') && (
              <button className="adm-btn-primary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> New booking
              </button>
            )}
          </>
        }
      />

      <Tabs tabs={SCOPES} value={scope} onChange={(v) => update({ scope: v === 'upcoming' ? null : v })} className="mb-4" />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={sp.get('q') ?? ''} onChange={(v) => update({ q: v || null })} placeholder="Search reference, title, client or venue…" className="sm:max-w-md sm:flex-1" />
        <button className={cn('adm-btn-secondary', activeFilters && 'border-adm-gold')} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="booking-filters">
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeFilters > 0 && <span className="rounded-full bg-adm-gold px-1.5 text-xs text-white">{activeFilters}</span>}
        </button>
        {activeFilters > 0 && (
          <button className="adm-btn-ghost" onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>
            Clear filters
          </button>
        )}
      </div>

      {showFilters && (
        <div id="booking-filters" className="adm-card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Status">
            <Select value={sp.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
              <option value="">Any status</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BOOKING_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Manager">
            <Select value={sp.get('managerId') ?? ''} onChange={(e) => update({ managerId: e.target.value || null })}>
              <option value="">Anyone</option>
              {staff.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City">
            <CityInput value={sp.get('city') ?? ''} onCommit={(v) => update({ city: v || null })} />
          </Field>
          <Field label="Category">
            <Select value={sp.get('categoryId') ?? ''} onChange={(e) => update({ categoryId: e.target.value || null })}>
              <option value="">Any category</option>
              {bootstrap?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Event from">
            <Input type="date" value={sp.get('from') ?? ''} onChange={(e) => update({ from: e.target.value || null })} />
          </Field>
          <Field label="Event to">
            <Input type="date" value={sp.get('to') ?? ''} min={sp.get('from') ?? undefined} onChange={(e) => update({ to: e.target.value || null })} />
          </Field>
        </div>
      )}

      {list.isError ? (
        <LoadError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <ul className="space-y-3 sm:hidden" aria-label="Bookings">
            {list.isLoading && [0, 1, 2].map((i) => <li key={i} className="h-24 animate-pulse rounded-xl bg-adm-line/60" />)}
            {!list.isLoading && !list.data?.data.length && <li className="adm-card px-5 py-10 text-center text-sm text-adm-muted">No bookings match.</li>}
            {list.data?.data.map((b) => (
              <li key={b.id}>
                <Link to={`/admin/bookings/${b.id}`} className="adm-card block p-4 transition hover:border-adm-gold/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{b.title}</p>
                      <p className="text-xs text-adm-muted">
                        {b.reference} · {b.client.name}
                      </p>
                    </div>
                    <StatusBadge status={b.status} label={BOOKING_STATUS_LABELS[b.status]} />
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-adm-muted">
                    <span>
                      {fmtDate(b.eventDate)}
                      {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' ? ` · ${countdownLabel(b.eventDate)}` : ''}
                    </span>
                    <span>{[b.venueName, b.city].filter(Boolean).join(', ') || '—'}</span>
                    {finance && <span className="font-medium tabular-nums text-adm-ink">{money(b.contractValueMinor, b.currency)}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <DataTable
            className="hidden sm:block"
            columns={columns}
            rows={list.data?.data}
            rowKey={(b) => b.id}
            loading={list.isLoading}
            onRowClick={(b) => nav(`/admin/bookings/${b.id}`)}
            empty={
              params.q || activeFilters ? (
                'No bookings match these filters.'
              ) : (
                <span>
                  No {scope === 'all' ? '' : `${SCOPES.find((s) => s.value === scope)?.label.toLowerCase()} `}bookings yet. Bookings are created when a client accepts a quotation
                  {can('bookings.manage') ? ', or manually with “New booking”.' : '.'}
                </span>
              )
            }
          />
          {list.data?.meta && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={(p) => update({ page: String(p) })} />}
        </>
      )}

      <NewBookingModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CityInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Input
      value={v}
      placeholder="e.g. Udaipur"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && onCommit(v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && onCommit(v.trim())}
    />
  );
}

export default function BookingsList() {
  return (
    <RequireStaff permission="bookings.view">
      <BookingsListInner />
    </RequireStaff>
  );
}
