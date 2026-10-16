import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { INQUIRY_STATUS_LABELS, INQUIRY_STATUSES, type InquiryStatus } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { api, download, errorMessage, type Query } from '@/lib/api';
import { fmtDate, fromNow } from '@/lib/format';
import { DataTable, Input, PageHeader, Pagination, Select, StatusBadge, Tabs, Textarea, type Column } from '@/admin/ui';
import { PanelError, SearchInput, Field } from '../components/common';
import { fieldErrorsOf, SOURCES, useStaff, type InquiryRow } from '../lib';

type Tab = 'ALL' | 'OPEN' | InquiryStatus;
const FILTER_KEYS = ['status', 'open', 'assignedToId', 'categoryId', 'source', 'from', 'to', 'q', 'sort', 'page'] as const;

export default function InquiriesList() {
  const { can } = useAuth();
  const { bootstrap } = useSite();
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const staff = useStaff();

  const get = (k: (typeof FILTER_KEYS)[number]) => sp.get(k) ?? '';
  const set = (patch: Partial<Record<(typeof FILTER_KEYS)[number], string>>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };
  const tab: Tab = get('status') ? (get('status') as InquiryStatus) : get('open') === 'true' ? 'OPEN' : 'ALL';
  const filters: Query = {
    status: get('status') || undefined,
    open: get('open') || undefined,
    assignedToId: get('assignedToId') || undefined,
    categoryId: get('categoryId') || undefined,
    source: get('source') || undefined,
    from: get('from') || undefined,
    to: get('to') || undefined,
    q: get('q') || undefined,
    sort: get('sort') || 'newest',
  };
  const page = Number(get('page') || 1);
  const q = useQuery({ queryKey: ['inquiries', filters, page], queryFn: () => api.getPaged<InquiryRow[]>('/admin/inquiries', { ...filters, page, limit: 25 }), placeholderData: (p) => p });
  const counts = (q.data?.meta?.statusCounts ?? {}) as Record<string, number>;
  const sum = (pred: (s: string) => boolean) => Object.entries(counts).reduce((s, [k, v]) => (pred(k) ? s + v : s), 0);

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'ALL', label: 'All', count: sum((s) => s !== 'ARCHIVED') },
    { value: 'OPEN', label: 'Open', count: sum((s) => !['WON', 'LOST', 'ARCHIVED'].includes(s)) },
    ...INQUIRY_STATUSES.map((s) => ({ value: s as Tab, label: INQUIRY_STATUS_LABELS[s], count: counts[s] ?? 0 })),
  ];

  const columns: Column<InquiryRow>[] = [
    { key: 'ref', header: 'Reference', cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{r.reference}</span> },
    {
      key: 'client',
      header: 'Client',
      cell: (r) => (
        <div className="min-w-[140px]">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-adm-muted">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Event type · location',
      cell: (r) => (
        <div className="min-w-[140px]">
          <p>{r.eventType}</p>
          <p className="text-xs text-adm-muted">{r.location}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Event date', cell: (r) => <span className="whitespace-nowrap">{r.eventDate ? fmtDate(r.eventDate.slice(0, 10)) : <span className="text-adm-muted">Flexible</span>}</span> },
    { key: 'guests', header: 'Guests', className: 'text-right tabular-nums', cell: (r) => r.guestCount },
    { key: 'budget', header: 'Budget', cell: (r) => <span className="whitespace-nowrap">{r.budgetRange}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} label={INQUIRY_STATUS_LABELS[r.status]} /> },
    { key: 'assignee', header: 'Assignee', cell: (r) => <span className="whitespace-nowrap">{r.assignedTo?.name ?? <span className="text-adm-muted">Unassigned</span>}</span> },
    { key: 'received', header: 'Received', cell: (r) => <time className="whitespace-nowrap text-adm-muted" dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString()}>{fromNow(r.createdAt)}</time> },
  ];

  const hasFilters = FILTER_KEYS.some((k) => !['status', 'open', 'page', 'sort'].includes(k) && get(k));

  return (
    <div>
      <PageHeader
        title="Inquiries"
        subtitle="Every lead from the website, phone and walk-ins — triage, assign and convert."
        actions={
          <>
            {can('clients.view') && (
              <button
                className="adm-btn-secondary"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await download('/admin/inquiries/export.csv', filters, 'inquiries.csv');
                  } catch (err) {
                    toast.error('Export failed', errorMessage(err));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            )}
            {can('inquiries.manage') && (
              <button className="adm-btn-primary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> New inquiry
              </button>
            )}
          </>
        }
      />

      <Tabs tabs={tabs} value={tab} onChange={(t) => set(t === 'ALL' ? { status: '', open: '' } : t === 'OPEN' ? { status: '', open: 'true' } : { status: t, open: '' })} className="mb-4" />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1.4fr)_repeat(3,minmax(0,1fr))_auto_auto_auto]">
        <SearchInput value={get('q')} onChange={(v) => set({ q: v })} placeholder="Search name, email, reference…" />
        <Select aria-label="Assignee" value={get('assignedToId')} onChange={(e) => set({ assignedToId: e.target.value })}>
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {staff.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={get('categoryId')} onChange={(e) => set({ categoryId: e.target.value })}>
          <option value="">All categories</option>
          {bootstrap?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Source" value={get('source')} onChange={(e) => set({ source: e.target.value })}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
        <Input type="date" aria-label="Received from" value={get('from')} max={get('to') || undefined} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="Received to" value={get('to')} min={get('from') || undefined} onChange={(e) => set({ to: e.target.value })} />
        <Select aria-label="Sort" value={get('sort') || 'newest'} onChange={(e) => set({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="eventDate">Event date</option>
        </Select>
      </div>
      {hasFilters && (
        <button className="mb-3 text-xs text-adm-gold hover:underline" onClick={() => set({ assignedToId: '', categoryId: '', source: '', from: '', to: '', q: '' })}>
          Clear filters
        </button>
      )}

      {q.isError ? (
        <PanelError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={q.data?.data} rowKey={(r) => r.id} loading={q.isLoading} onRowClick={(r) => nav(`/admin/inquiries/${r.id}`)} empty={hasFilters ? 'No inquiries match these filters.' : 'No inquiries here yet.'} />
          {q.data?.meta && <Pagination page={q.data.meta.page} pages={q.data.meta.pages} total={q.data.meta.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}

      <NewInquiryModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => nav(`/admin/inquiries/${id}`)} />
    </div>
  );
}

function NewInquiryModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { bootstrap } = useSite();
  const qc = useQueryClient();
  const toast = useToast();
  const blank = { name: '', email: '', phone: '', eventType: '', eventDate: '', location: '', guestCount: '', budgetRange: '', notes: '', source: 'phone', categoryId: '' };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/admin/inquiries', {
        name: f.name,
        email: f.email,
        phone: f.phone,
        eventType: f.eventType,
        eventDate: f.eventDate || null,
        location: f.location,
        guestCount: Number(f.guestCount) || 0,
        budgetRange: f.budgetRange || undefined,
        notes: f.notes,
        source: f.source,
        categoryId: f.categoryId || null,
      }),
    onSuccess: (r) => {
      toast.success('Inquiry created');
      void qc.invalidateQueries({ queryKey: ['inquiries'] });
      setF(blank);
      onClose();
      onCreated(r.id);
    },
    onError: (err) => {
      setErrs(fieldErrorsOf(err));
      toast.error('Could not create inquiry', errorMessage(err));
    },
  });
  const bind = (k: keyof typeof blank) => ({ value: f[k], invalid: !!errs[k], onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New inquiry"
      size="lg"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" form="new-inquiry" type="submit" disabled={m.isPending}>
            {m.isPending ? 'Creating…' : 'Create inquiry'}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-adm-muted">For phone calls and walk-ins. A client profile is created automatically (or matched by email), and the inquiry is assigned to you.</p>
      <form
        id="new-inquiry"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErrs({});
          m.mutate();
        }}
      >
        <Field label="Client name" required error={errs.name}>
          <Input required minLength={2} {...bind('name')} />
        </Field>
        <Field label="Email" required error={errs.email}>
          <Input type="email" required {...bind('email')} />
        </Field>
        <Field label="Phone" error={errs.phone}>
          <Input type="tel" {...bind('phone')} />
        </Field>
        <Field label="Source" error={errs.source}>
          <Select {...bind('source')}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event type" required error={errs.eventType}>
          <Input required placeholder="e.g. Wedding reception" {...bind('eventType')} />
        </Field>
        <Field label="Category" error={errs.categoryId}>
          <Select {...bind('categoryId')}>
            <option value="">—</option>
            {bootstrap?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event date" hint="Leave empty if flexible" error={errs.eventDate}>
          <Input type="date" {...bind('eventDate')} />
        </Field>
        <Field label="Location" required error={errs.location}>
          <Input required {...bind('location')} />
        </Field>
        <Field label="Guests" required error={errs.guestCount}>
          <Input type="number" min={1} max={100000} required {...bind('guestCount')} />
        </Field>
        <Field label="Budget" error={errs.budgetRange}>
          <Input placeholder="e.g. ₹15–30 lakh" {...bind('budgetRange')} />
        </Field>
        <Field label="Notes" className="sm:col-span-2" error={errs.notes}>
          <Textarea rows={3} {...bind('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
