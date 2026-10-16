import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck2, Plus, Trash2, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ConfirmDialog, DataTable, Field, Input, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, type Column } from '@/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { AdmError, fieldErrorsOf, RequirePerm, SkeletonRows, ymd } from '../shared';

type Ownership = 'OWNED' | 'VENDOR';
type Condition = 'GOOD' | 'NEEDS_REPAIR' | 'RETIRED';
interface ResourceInput {
  name: string;
  category: string;
  sku: string;
  ownership: Ownership;
  vendorId: string;
  quantity: number;
  unit: string;
  location: string;
  condition: Condition;
  notes: string;
}
interface ResourceRow extends Omit<ResourceInput, 'sku' | 'vendorId'> {
  id: string;
  sku: string | null;
  vendorId: string | null;
  vendor: { id: string; name: string } | null;
  inUseToday: number;
  availableToday: number;
  updatedAt: string;
}
interface Allocation {
  id: string;
  quantity: number;
  fromDate: string;
  toDate: string;
  status: string;
  returnedQty: number | null;
  damagedQty: number;
  damageNotes: string;
  booking: { id: string; reference: string; title: string };
}
interface AvailabilityResult {
  from: string;
  to: string;
  quantity: number;
  allocated: number;
  available: number;
  allocations: { id: string; quantity: number; fromDate: string; toDate: string; status: string; booking: { id: string; reference: string; title: string } }[];
}

const CONDITION_LABEL: Record<Condition, string> = { GOOD: 'Good', NEEDS_REPAIR: 'Needs repair', RETIRED: 'Retired' };
const CONDITION_TONE = { GOOD: 'green', NEEDS_REPAIR: 'red', RETIRED: 'gray' } as const;
const DEFAULT_CATEGORIES = ['Furniture', 'Lighting', 'Sound', 'Staging', 'Décor', 'Linen', 'Tableware', 'Power', 'Signage', 'Other'];

const emptyResource: ResourceInput = { name: '', category: 'Furniture', sku: '', ownership: 'OWNED', vendorId: '', quantity: 1, unit: 'pcs', location: '', condition: 'GOOD', notes: '' };
const toInput = (r: ResourceRow): ResourceInput => ({ name: r.name, category: r.category, sku: r.sku ?? '', ownership: r.ownership, vendorId: r.vendorId ?? '', quantity: r.quantity, unit: r.unit, location: r.location, condition: r.condition, notes: r.notes });

function ResourceForm({ id, initial, errors, onSubmit, categories }: { id: string; initial: ResourceInput; errors: Record<string, string>; onSubmit: (v: ResourceInput) => void; categories: string[] }) {
  const { can } = useAuth();
  const [v, setV] = useState(initial);
  const [local, setLocal] = useState<Record<string, string>>({});
  const vendors = useQuery({ queryKey: ['vendors-select'], queryFn: () => api.get<{ id: string; name: string; category: string }[]>('/admin/vendors', { limit: 200 }), enabled: can('vendors.view'), staleTime: 5 * 60_000 });
  const set = <K extends keyof ResourceInput>(k: K, val: ResourceInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const err = (k: string) => local[k] ?? errors[k];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const l: Record<string, string> = {};
    if (!v.name.trim()) l.name = 'Name is required';
    if (!v.category.trim()) l.category = 'Category is required';
    if (!Number.isInteger(v.quantity) || v.quantity < 0) l.quantity = 'Enter a whole number';
    if (v.ownership === 'VENDOR' && !v.vendorId) l.vendorId = 'Choose the vendor that supplies this item';
    setLocal(l);
    if (Object.keys(l).length) return;
    onSubmit(v);
  };
  const catList = [...new Set([...categories, ...DEFAULT_CATEGORIES])].sort();
  return (
    <form id={id} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Item name" required error={err('name')} className="sm:col-span-2">
        <Input value={v.name} maxLength={160} onChange={(e) => set('name', e.target.value)} invalid={!!err('name')} placeholder="e.g. Chiavari chair — gold" />
      </Field>
      <Field label="Category" required error={err('category')}>
        <Input value={v.category} maxLength={60} list={`${id}-cats`} onChange={(e) => set('category', e.target.value)} invalid={!!err('category')} />
        <datalist id={`${id}-cats`}>
          {catList.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="SKU / code" error={err('sku')}>
        <Input value={v.sku} maxLength={60} onChange={(e) => set('sku', e.target.value)} />
      </Field>
      <Field label="Ownership" error={err('ownership')}>
        <Select value={v.ownership} onChange={(e) => set('ownership', e.target.value as Ownership)} aria-label="Ownership">
          <option value="OWNED">Owned by us</option>
          <option value="VENDOR">Supplied by a vendor</option>
        </Select>
      </Field>
      <Field label={v.ownership === 'VENDOR' ? 'Vendor' : 'Vendor (optional)'} required={v.ownership === 'VENDOR'} error={err('vendorId')}>
        {can('vendors.view') ? (
          <Select value={v.vendorId} onChange={(e) => set('vendorId', e.target.value)} invalid={!!err('vendorId')} aria-label="Vendor">
            <option value="">{v.ownership === 'VENDOR' ? 'Choose a vendor…' : 'None'}</option>
            {vendors.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.category}
              </option>
            ))}
            {v.vendorId && !vendors.data?.some((x) => x.id === v.vendorId) && <option value={v.vendorId}>Current vendor</option>}
          </Select>
        ) : (
          <p className="py-2 text-xs text-adm-muted">Vendor list requires vendor access.</p>
        )}
      </Field>
      <Field label="Quantity" required error={err('quantity')}>
        <Input type="number" min={0} value={v.quantity} onChange={(e) => set('quantity', Math.max(0, Math.round(Number(e.target.value) || 0)))} invalid={!!err('quantity')} />
      </Field>
      <Field label="Unit" error={err('unit')}>
        <Input value={v.unit} maxLength={20} onChange={(e) => set('unit', e.target.value)} placeholder="pcs, sets, metres…" />
      </Field>
      <Field label="Storage location" error={err('location')}>
        <Input value={v.location} maxLength={200} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Warehouse A, bay 3" />
      </Field>
      <Field label="Condition" error={err('condition')} hint={v.condition === 'RETIRED' ? 'Retired items cannot be allocated.' : undefined}>
        <Select value={v.condition} onChange={(e) => set('condition', e.target.value as Condition)} aria-label="Condition">
          {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" error={err('notes')} className="sm:col-span-2">
        <Textarea rows={3} value={v.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </form>
  );
}

function AvailabilityPanel({ resource }: { resource: ResourceRow }) {
  const today = ymd(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const q = useQuery({ queryKey: ['resource-availability', resource.id, range], queryFn: () => api.get<AvailabilityResult>(`/admin/resources/${resource.id}/availability`, range!), enabled: !!range });
  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ from, to: to < from ? from : to });
        }}
      >
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <button className="adm-btn-secondary" disabled={q.isFetching}>
          <CalendarCheck2 className="h-4 w-4" /> {q.isFetching ? 'Checking…' : 'Check'}
        </button>
      </form>
      <div aria-live="polite">
        {q.isError && <p className="text-sm text-red-600">{errorMessage(q.error)}</p>}
        {q.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Total', q.data.quantity],
                ['Allocated (peak)', q.data.allocated],
                ['Available', q.data.available],
              ].map(([k, n]) => (
                <div key={k} className="rounded-lg border border-adm-line px-2 py-3">
                  <p className={cn('text-xl font-semibold tabular-nums', k === 'Available' && (Number(n) > 0 ? 'text-emerald-700' : 'text-red-700'))}>{n}</p>
                  <p className="text-[11px] text-adm-muted">{k}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-adm-muted">
              {fmtDate(q.data.from)} – {fmtDate(q.data.to)} · {resource.unit}
            </p>
            {q.data.allocations.length > 0 && (
              <ul className="divide-y divide-adm-line rounded-lg border border-adm-line text-sm">
                {q.data.allocations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <Link to={`/admin/bookings/${a.booking.id}`} className="min-w-0 truncate hover:underline">
                      {a.booking.reference} · {a.booking.title}
                    </Link>
                    <span className="shrink-0 tabular-nums text-adm-muted">
                      {a.quantity} · {fmtDate(a.fromDate, { day: 'numeric', month: 'short' })}–{fmtDate(a.toDate, { day: 'numeric', month: 'short' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AllocationsPanel({ resource }: { resource: ResourceRow }) {
  const q = useQuery({ queryKey: ['resource-allocations', resource.id], queryFn: () => api.get<Allocation[]>('/admin/resources/allocations', { resourceId: resource.id }) });
  if (q.isLoading) return <SkeletonRows rows={3} />;
  if (q.isError) return <AdmError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <p className="py-8 text-center text-sm text-adm-muted">No allocations yet. Allocate stock to an event from the booking’s resources section.</p>;
  return (
    <ul className="divide-y divide-adm-line rounded-lg border border-adm-line">
      {q.data.map((a) => (
        <li key={a.id} className="px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to={`/admin/bookings/${a.booking.id}`} className="min-w-0 font-medium hover:underline">
              {a.booking.reference} <span className="font-normal text-adm-muted">· {a.booking.title}</span>
            </Link>
            <StatusBadge status={a.status === 'RETURNED' ? 'DONE' : a.status === 'RESERVED' ? 'PENDING' : a.status === 'DISPATCHED' ? 'IN_PROGRESS' : a.status} label={a.status.charAt(0) + a.status.slice(1).toLowerCase()} />
          </div>
          <p className="mt-0.5 text-xs text-adm-muted">
            {a.quantity} {resource.unit} · {fmtDate(a.fromDate)} – {fmtDate(a.toDate)}
            {a.status === 'RETURNED' && ` · ${a.returnedQty ?? a.quantity} returned`}
            {a.damagedQty > 0 && <span className="text-red-700"> · {a.damagedQty} damaged</span>}
          </p>
          {a.damageNotes && <p className="mt-1 text-xs text-red-700">{a.damageNotes}</p>}
        </li>
      ))}
    </ul>
  );
}

function InventoryScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [ownership, setOwnership] = useState('');
  const [condition, setCondition] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ResourceRow | null>(null);
  const [tab, setTab] = useState<'details' | 'availability' | 'allocations'>('details');
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = { q, category, ownership, condition, page, limit: 50 };
  const list = useQuery({ queryKey: ['resources', query], queryFn: () => api.getPaged<ResourceRow[]>('/admin/resources', query), placeholderData: keepPreviousData });
  const meta = list.data?.meta as unknown as { page: number; pages: number; total: number; categories: { name: string; count: number }[] } | undefined;
  const categories = meta?.categories?.map((c) => c.name) ?? [];

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ResourceInput }) => {
      const payload = { ...body, sku: body.sku || null, vendorId: body.vendorId || null };
      return id ? api.put<ResourceRow>(`/admin/resources/${id}`, payload) : api.post<ResourceRow>('/admin/resources', payload);
    },
    onSuccess: (row, vars) => {
      toast.success(vars.id ? 'Item saved' : 'Item added to inventory');
      qc.invalidateQueries({ queryKey: ['resources'] });
      setErrors({});
      if (vars.id) setSelected((s) => (s ? { ...s, ...row } : s));
      else setCreating(false);
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error(err instanceof ApiError && err.status === 409 ? 'Stock is already allocated' : 'Could not save the item', errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/resources/${id}`),
    onSuccess: () => {
      toast.success('Item deleted');
      setConfirmDelete(false);
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['resources'] });
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error('Could not delete', errorMessage(err));
    },
  });

  const columns: Column<ResourceRow>[] = [
    {
      key: 'name',
      header: 'Item',
      cell: (r) => (
        <div className="min-w-[180px]">
          <p className="flex items-center gap-1.5 font-medium">
            {r.condition === 'NEEDS_REPAIR' && <Wrench className="h-3.5 w-3.5 text-red-600" aria-label="Needs repair" />}
            {r.name}
          </p>
          <p className="text-xs text-adm-muted">{[r.category, r.sku].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    { key: 'own', header: 'Ownership', className: 'hidden md:table-cell', cell: (r) => (r.ownership === 'VENDOR' ? <span>Vendor<span className="block text-xs text-adm-muted">{r.vendor?.name ?? '—'}</span></span> : 'Owned') },
    { key: 'qty', header: 'Quantity', className: 'text-right tabular-nums', cell: (r) => `${r.quantity} ${r.unit}` },
    { key: 'today', header: 'Free today', className: 'hidden sm:table-cell text-right tabular-nums', cell: (r) => <span className={cn(r.availableToday === 0 && 'text-red-700')}>{r.availableToday}{r.inUseToday > 0 && <span className="block text-xs text-adm-muted">{r.inUseToday} out</span>}</span> },
    { key: 'loc', header: 'Location', className: 'hidden lg:table-cell', cell: (r) => r.location || '—' },
    { key: 'cond', header: 'Condition', cell: (r) => <Badge tone={CONDITION_TONE[r.condition]}>{CONDITION_LABEL[r.condition]}</Badge> },
  ];
  const repairCount = list.data?.data.filter((r) => r.condition === 'NEEDS_REPAIR').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Owned and vendor-supplied equipment, with availability and allocation history."
        actions={
          <button
            className="adm-btn-primary"
            onClick={() => {
              setErrors({});
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" /> New item
          </button>
        }
      />
      {repairCount > 0 && !condition && (
        <button className="mb-4 flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-left text-sm text-red-800 hover:bg-red-100" onClick={() => setCondition('NEEDS_REPAIR')}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {repairCount} item{repairCount === 1 ? '' : 's'} on this page need{repairCount === 1 ? 's' : ''} repair — show only those
        </button>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search name, SKU or location…"
        />
        <Select value={category} onChange={(e) => (setCategory(e.target.value), setPage(1))} aria-label="Category">
          <option value="">All categories</option>
          {meta?.categories?.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </Select>
        <Select value={ownership} onChange={(e) => (setOwnership(e.target.value), setPage(1))} aria-label="Ownership">
          <option value="">Owned & vendor</option>
          <option value="OWNED">Owned</option>
          <option value="VENDOR">Vendor-supplied</option>
        </Select>
        <Select value={condition} onChange={(e) => (setCondition(e.target.value), setPage(1))} aria-label="Condition">
          <option value="">Any condition</option>
          <option value="GOOD">Good</option>
          <option value="NEEDS_REPAIR">Needs repair</option>
          <option value="RETIRED">Retired</option>
        </Select>
      </div>
      {list.isError ? (
        <AdmError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={list.data?.data}
            rowKey={(r) => r.id}
            loading={list.isLoading}
            onRowClick={(r) => {
              setErrors({});
              setTab('details');
              setSelected(r);
            }}
            empty={q || category || ownership || condition ? 'No items match these filters.' : 'No inventory yet. Add chairs, lighting, staging and décor to track availability.'}
          />
          {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
        </>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New inventory item"
        size="lg"
        footer={
          <>
            <button className="adm-btn-secondary" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="adm-btn-primary" type="submit" form="res-create" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Add item'}
            </button>
          </>
        }
      >
        <ResourceForm id="res-create" initial={emptyResource} errors={errors} categories={categories} onSubmit={(body) => save.mutate({ body })} />
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        side
        title={selected?.name}
        footer={
          tab === 'details' && selected ? (
            <>
              <button className="adm-btn-ghost mr-auto text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
              <button className="adm-btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
              <button className="adm-btn-primary" type="submit" form="res-edit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div>
            {selected.condition === 'NEEDS_REPAIR' && (
              <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <Wrench className="h-4 w-4" aria-hidden /> Flagged for repair — set the condition back to Good once fixed.
              </p>
            )}
            <Tabs
              className="mb-4"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'details', label: 'Details' },
                { value: 'availability', label: 'Availability' },
                { value: 'allocations', label: 'Allocations' },
              ]}
            />
            {tab === 'details' && <ResourceForm key={selected.id + selected.updatedAt} id="res-edit" initial={toInput(selected)} errors={errors} categories={categories} onSubmit={(body) => save.mutate({ id: selected.id, body })} />}
            {tab === 'availability' && <AvailabilityPanel resource={selected} />}
            {tab === 'allocations' && <AllocationsPanel resource={selected} />}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this item?"
        body="Items with allocation history cannot be deleted — mark them Retired instead."
        confirmLabel="Delete item"
        danger
        loading={remove.isPending}
        onConfirm={() => selected && remove.mutate(selected.id)}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <RequirePerm any={['venues.manage']}>
      <InventoryScreen />
    </RequirePerm>
  );
}
