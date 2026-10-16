import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RSVP_STATUSES } from '@maison/shared';
import { Download, Globe, Mail, Plus, QrCode, ScanLine, Table2, Upload, Users } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { api, download, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { titleCase } from '@/lib/format';
import { AdminSpinner, Pagination, SearchInput, Select, Stat, StatusBadge } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { Guest, GuestSummary } from '../types';
import { LoadError, SectionEmpty, SkeletonRows } from '../shared/ui';
import { GuestDrawer, ImportModal, InviteResultModal, QrModal, TablesModal, type InviteResult } from './guestModals';

const CheckInPanel = lazy(() => import('./CheckInPanel'));
const MicrositeEditor = lazy(() => import('./MicrositeEditor'));

export const guestsKey = (bookingId: string) => ['booking-guests', bookingId] as const;
const RSVP_TONE: Record<string, string> = { PENDING: 'PENDING', ATTENDING: 'ACTIVE', DECLINED: 'DECLINED', MAYBE: 'VIEWED' };
type View = 'list' | 'checkin' | 'microsite';

export default function GuestsTab({ booking: b }: TabProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('list');
  const [filters, setFilters] = useState({ q: '', rsvp: '', group: '', table: '', checkedIn: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Guest | 'new' | null>(null);
  const [qr, setQr] = useState<Guest | null>(null);
  const [importing, setImporting] = useState(false);
  const [tables, setTables] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const query = { bookingId: b.id, page, limit: 100, q: filters.q || undefined, rsvp: filters.rsvp || undefined, group: filters.group || undefined, table: filters.table || undefined, checkedIn: filters.checkedIn || undefined };
  const list = useQuery({
    queryKey: [...guestsKey(b.id), query],
    queryFn: () => api.getPaged<Guest[]>('/admin/guests', query),
    placeholderData: (prev) => prev,
  });
  const summary = list.data?.meta?.summary as GuestSummary | undefined;
  const rows = list.data?.data ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: guestsKey(b.id) });
    qc.invalidateQueries({ queryKey: ['admin-booking', b.id] });
  };
  const setFilter = (k: keyof typeof filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
    setSelected(new Set());
  };

  const invite = useMutation({
    mutationFn: async (v: { ids?: string[]; resend: boolean }) => {
      let ids = v.ids;
      if (!ids) {
        // All guests still pending (paged fetch, server caps a page at 500).
        ids = [];
        for (let p = 1; p < 10; p++) {
          const r = await api.getPaged<Guest[]>('/admin/guests', { bookingId: b.id, rsvp: 'PENDING', limit: 500, page: p });
          ids.push(...r.data.map((g) => g.id));
          if (!r.meta || p >= r.meta.pages) break;
        }
        if (!ids.length) throw new Error('No pending guests to invite');
      }
      return api.post<InviteResult>('/admin/guests/invite', { guestIds: ids.slice(0, 2000), resend: v.resend });
    },
    onSuccess: (r) => {
      setInviteResult(r);
      setSelected(new Set());
    },
    onError: (err) => toast.error('Invitations not sent', errorMessage(err)),
  });
  const exportCsv = async () => {
    setExporting(true);
    try {
      await download('/admin/guests/export.csv', { ...query, page: undefined, limit: undefined }, 'guests.csv');
    } catch (err) {
      toast.error('Export failed', errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const allSelected = rows.length > 0 && rows.every((g) => selected.has(g.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((g) => g.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectedGuests = rows.filter((g) => selected.has(g.id));
  const pending = summary?.byStatus.PENDING ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Invited" value={summary?.total ?? '—'} />
        <Stat label="Attending" value={summary?.attending ?? '—'} tone="good" hint={summary?.attendingPlusOnes ? `+${summary.attendingPlusOnes} plus-ones` : undefined} />
        <Stat label="Declined" value={summary?.byStatus.DECLINED ?? '—'} />
        <Stat label="Pending" value={summary ? pending + (summary.byStatus.MAYBE ?? 0) : '—'} tone={pending ? 'warn' : 'default'} hint={summary?.byStatus.MAYBE ? `${summary.byStatus.MAYBE} maybe` : undefined} />
        <Stat label="Headcount" value={summary?.headcount ?? '—'} tone="gold" hint={b.guestCount ? `Planned ${b.guestCount}` : undefined} />
        <Stat label="Checked in" value={summary ? summary.checkedInPeople : '—'} hint={summary ? `${summary.checkedInGuests} parties` : undefined} />
      </div>

      <div className="flex gap-1 rounded-lg bg-adm-line/50 p-1 sm:inline-flex" role="tablist" aria-label="Guest tools">
        {(
          [
            ['list', 'Guest list', Users],
            ['checkin', 'Check-in', ScanLine],
            ['microsite', 'Microsite', Globe],
          ] as const
        ).map(([v, label, Icon]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition sm:flex-none sm:px-3 sm:text-sm', view === v ? 'bg-white font-medium shadow-sm' : 'text-adm-muted hover:text-adm-ink')}>
            <Icon className="h-4 w-4" /> <span className="whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>

      {view === 'checkin' ? (
        <Suspense fallback={<AdminSpinner />}>
          <CheckInPanel booking={b} onChange={refresh} />
        </Suspense>
      ) : view === 'microsite' ? (
        <Suspense fallback={<AdminSpinner />}>
          <MicrositeEditor booking={b} />
        </Suspense>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button className="adm-btn-primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add guest
            </button>
            <button className="adm-btn-secondary" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </button>
            <button className="adm-btn-secondary" onClick={exportCsv} disabled={exporting || !summary?.total}>
              <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <div className="ml-auto flex flex-wrap gap-2">
              {selected.size > 0 ? (
                <>
                  <button className="adm-btn-secondary" onClick={() => setTables(true)}>
                    <Table2 className="h-4 w-4" /> Assign table ({selected.size})
                  </button>
                  <button className="adm-btn-secondary" onClick={() => invite.mutate({ ids: [...selected], resend: true })} disabled={invite.isPending}>
                    Resend ({selected.size})
                  </button>
                  <button className="adm-btn-gold" onClick={() => invite.mutate({ ids: [...selected], resend: false })} disabled={invite.isPending}>
                    <Mail className="h-4 w-4" /> Invite selected ({selected.size})
                  </button>
                </>
              ) : (
                <button className="adm-btn-gold" onClick={() => invite.mutate({ resend: false })} disabled={invite.isPending || !pending || b.status === 'CANCELLED'}>
                  <Mail className="h-4 w-4" /> {invite.isPending ? 'Sending…' : `Invite all pending (${pending})`}
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
            <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search name, email, phone or invite code…" />
            <Select aria-label="RSVP" value={filters.rsvp} onChange={(e) => setFilter('rsvp', e.target.value)}>
              <option value="">All RSVPs</option>
              {RSVP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
            <Select aria-label="Group" value={filters.group} onChange={(e) => setFilter('group', e.target.value)}>
              <option value="">All groups</option>
              {summary?.groups
                .filter((g) => g.name)
                .map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name} ({g.count})
                  </option>
                ))}
            </Select>
            <Select aria-label="Table" value={filters.table} onChange={(e) => setFilter('table', e.target.value)}>
              <option value="">All tables</option>
              <option value="__none">Not seated</option>
              {summary?.tables.map((t) => (
                <option key={t.label} value={t.label}>
                  {t.label} ({t.seats} seats)
                </option>
              ))}
            </Select>
            <Select aria-label="Check-in" value={filters.checkedIn} onChange={(e) => setFilter('checkedIn', e.target.value)}>
              <option value="">Any check-in</option>
              <option value="true">Checked in</option>
              <option value="false">Not checked in</option>
            </Select>
          </div>

          {list.isError ? (
            <LoadError error={list.error} onRetry={() => list.refetch()} />
          ) : list.isLoading ? (
            <SkeletonRows rows={6} />
          ) : rows.length === 0 ? (
            <div className="adm-card">
              {summary?.total ? (
                <p className="px-6 py-12 text-center text-sm text-adm-muted">No guests match these filters.</p>
              ) : (
                <SectionEmpty
                  icon={<Users className="h-5 w-5" />}
                  title="No guests yet"
                  body="Add guests one by one or import a spreadsheet. Each guest gets a personal invite code and RSVP link."
                  action={
                    <div className="flex justify-center gap-2">
                      <button className="adm-btn-primary" onClick={() => setImporting(true)}>
                        Import CSV
                      </button>
                      <button className="adm-btn-secondary" onClick={() => setEditing('new')}>
                        Add guest
                      </button>
                    </div>
                  }
                />
              )}
            </div>
          ) : (
            <div className="adm-card overflow-x-auto">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-adm-line bg-white bg-center bg-no-repeat transition checked:border-adm-gold checked:bg-adm-gold checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4 8.5l2.5 2.5L12 5.5%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22/></svg>')] focus-visible:outline focus-visible:outline-2 focus-visible:outline-adm-gold" checked={allSelected} onChange={toggleAll} aria-label="Select all guests on this page" />
                    </th>
                    <th>Guest</th>
                    <th>Group</th>
                    <th className="text-right">Party</th>
                    <th>RSVP</th>
                    <th>Table</th>
                    <th>Check-in</th>
                    <th className="text-right">
                      <span className="relative block"><span className="sr-only">Actions</span></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => (
                    <tr key={g.id} className={cn(selected.has(g.id) && 'bg-[#FBF7EE]')}>
                      <td>
                        <input type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-adm-line bg-white bg-center bg-no-repeat transition checked:border-adm-gold checked:bg-adm-gold checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4 8.5l2.5 2.5L12 5.5%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22/></svg>')] focus-visible:outline focus-visible:outline-2 focus-visible:outline-adm-gold" checked={selected.has(g.id)} onChange={() => toggle(g.id)} aria-label={`Select ${g.name}`} />
                      </td>
                      <td className="min-w-[180px]">
                        <button className="text-left font-medium hover:text-adm-gold" onClick={() => setEditing(g)}>
                          {g.name}
                        </button>
                        <p className="text-xs text-adm-muted">{g.email || g.phone || <span className="text-amber-700">No email — share the link or QR</span>}</p>
                      </td>
                      <td className="text-sm">
                        {g.group || '—'}
                        {g.side && <span className="block text-xs text-adm-muted">{g.side}</span>}
                      </td>
                      <td className="text-right tabular-nums">{1 + g.plusOnes}</td>
                      <td>
                        <StatusBadge status={RSVP_TONE[g.rsvpStatus]} label={titleCase(g.rsvpStatus)} />
                        {g.dietary && <span className="mt-0.5 block text-xs text-adm-muted">{g.dietary}</span>}
                      </td>
                      <td className="whitespace-nowrap">{g.tableLabel ? `${g.tableLabel}${g.seatNumber ? ` · ${g.seatNumber}` : ''}` : <span className="text-adm-muted">—</span>}</td>
                      <td className="whitespace-nowrap text-xs">{g.checkedInAt ? <span className="font-medium text-emerald-700">✓ {g.checkedInCount}/{1 + g.plusOnes}</span> : <span className="text-adm-muted">—</span>}</td>
                      <td className="text-right">
                        <button className="adm-btn-ghost !px-2 !py-1" onClick={() => setQr(g)} aria-label={`Invite QR code for ${g.name}`}>
                          <QrCode className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.data?.meta && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={(p) => (setPage(p), setSelected(new Set()))} />}
        </>
      )}

      <GuestDrawer open={!!editing} guest={editing === 'new' ? null : editing} bookingId={b.id} onClose={() => setEditing(null)} onSaved={refresh} onShowQr={(g) => setQr(g)} />
      <QrModal guest={qr} onClose={() => setQr(null)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} bookingId={b.id} onImported={refresh} />
      <TablesModal open={tables} onClose={() => setTables(false)} bookingId={b.id} guests={selectedGuests} existing={summary?.tables ?? []} onSaved={() => (refresh(), setSelected(new Set()))} />
      <InviteResultModal result={inviteResult} onClose={() => setInviteResult(null)} />
    </div>
  );
}
