import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VENDOR_CATEGORIES } from '@maison/shared';
import { Download, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, DataTable, PageHeader, Pagination, SearchInput, Select, type Column } from '@/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, download, errorMessage } from '@/lib/api';
import { AdmError, fieldErrorsOf, RequirePerm, Stars } from '../shared';
import { emptyVendor, VENDOR_STATUS_LABEL, VENDOR_STATUS_TONE, VENDOR_STATUSES, VendorForm, type VendorInput, type VendorStatus } from '../vendors/VendorForm';

interface VendorRow extends VendorInput {
  id: string;
  createdAt: string;
  _count: { assignments: number; documents: number };
}
interface VendorMeta {
  page: number;
  pages: number;
  total: number;
  serviceAreas: string[];
}

function VendorsScreen() {
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const category = sp.get('category') ?? '';
  const status = sp.get('status') ?? '';
  const area = sp.get('area') ?? '';
  const sort = sp.get('sort') ?? 'name';
  const page = Number(sp.get('page') ?? 1) || 1;
  const setParam = (k: string, v: string) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (v) n.set(k, v);
        else n.delete(k);
        if (k !== 'page') n.delete('page');
        return n;
      },
      { replace: true },
    );
  const query = { q, category, status, area, sort, page, limit: 25 };
  const list = useQuery({ queryKey: ['vendors', query], queryFn: () => api.getPaged<VendorRow[]>('/admin/vendors', query), placeholderData: keepPreviousData });
  const meta = list.data?.meta as unknown as VendorMeta | undefined;
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  const create = useMutation({
    mutationFn: (v: VendorInput) => api.post<VendorRow>('/admin/vendors', v),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor added', row.name);
      setCreating(false);
      nav(`/admin/vendors/${row.id}`);
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not add the vendor', errorMessage(err));
    },
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download('/admin/vendors/export.csv', { q, category, status, area }, 'vendors.csv');
    } catch (err) {
      toast.error('Export failed', errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<VendorRow>[] = [
    {
      key: 'name',
      header: 'Vendor',
      cell: (v) => (
        <div className="min-w-[180px]">
          <p className="font-medium">{v.name}</p>
          <p className="text-xs text-adm-muted">{[v.contactName, v.phone].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (v) => <span className="whitespace-nowrap">{v.category}</span> },
    { key: 'areas', header: 'Service areas', className: 'hidden lg:table-cell', cell: (v) => <span className="text-adm-muted">{v.serviceAreas.slice(0, 3).join(', ') || '—'}{v.serviceAreas.length > 3 ? ` +${v.serviceAreas.length - 3}` : ''}</span> },
    { key: 'rating', header: 'Rating', cell: (v) => <Stars value={v.rating} /> },
    { key: 'jobs', header: 'Assignments', className: 'hidden md:table-cell text-right tabular-nums', cell: (v) => v._count.assignments },
    { key: 'status', header: 'Status', cell: (v) => <Badge tone={VENDOR_STATUS_TONE[v.status as VendorStatus] ?? 'gray'}>{VENDOR_STATUS_LABEL[v.status as VendorStatus] ?? v.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Your supplier database — contacts, pricing notes, performance and documents."
        actions={
          <>
            <button className="adm-btn-secondary" onClick={exportCsv} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            {can('vendors.manage') && (
              <button
                className="adm-btn-primary"
                onClick={() => {
                  setErrors({});
                  setCreating(true);
                }}
              >
                <Plus className="h-4 w-4" /> New vendor
              </button>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Search name, contact, email, phone…" />
        <Select value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {VENDOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {VENDOR_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={area} onChange={(e) => setParam('area', e.target.value)} aria-label="Service area">
          <option value="">All areas</option>
          {meta?.serviceAreas?.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setParam('sort', e.target.value === 'name' ? '' : e.target.value)} aria-label="Sort">
          <option value="name">Sort: name</option>
          <option value="rating">Sort: rating</option>
          <option value="recent">Sort: recently added</option>
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
            onRowClick={(r) => nav(`/admin/vendors/${r.id}`)}
            empty={q || category || status || area ? 'No vendors match these filters.' : 'No vendors yet. Add your first supplier to start building your database.'}
          />
          {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={(p) => setParam('page', String(p))} />}
        </>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New vendor"
        size="lg"
        footer={
          <>
            <button className="adm-btn-secondary" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="adm-btn-primary" type="submit" form="vendor-create" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Add vendor'}
            </button>
          </>
        }
      >
        <VendorForm id="vendor-create" initial={emptyVendor} errors={errors} onSubmit={(v) => create.mutate(v)} areaSuggestions={meta?.serviceAreas} />
      </Modal>
    </div>
  );
}

export default function VendorsPage() {
  return (
    <RequirePerm any={['vendors.view']}>
      <VendorsScreen />
    </RequirePerm>
  );
}
