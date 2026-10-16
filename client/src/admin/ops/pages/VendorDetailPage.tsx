import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Globe, Mail, Phone, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Card, ConfirmDialog, DataTable, Field, Input, KeyValue, PageHeader, Select, Stat, StatusBadge, Tabs, type Column } from '@/admin/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fmtDate, money, titleCase } from '@/lib/format';
import { AdmError, fieldErrorsOf, InternalNote, RequirePerm, SkeletonRows, Stars } from '../shared';
import { pickVendorInput, VENDOR_STATUS_LABEL, VENDOR_STATUS_TONE, VendorForm, type VendorInput, type VendorStatus } from '../vendors/VendorForm';

interface Assignment {
  id: string;
  service: string;
  poNumber: string | null;
  agreedAmountMinor: number;
  status: string;
  deliveryAt: string | null;
  performanceRating: number | null;
  performanceNotes: string;
  createdAt: string;
  booking: { id: string; reference: string; title: string; eventDate: string | null; status: string };
}
interface Expense {
  id: string;
  bookingId: string | null;
  category: string;
  description: string;
  amountMinor: number;
  currency: string;
  incurredOn: string | null;
  status: string;
  paidOn: string | null;
  reference: string;
}
interface VendorDoc {
  id: string;
  name: string;
  kind: string;
  createdAt: string;
  fileUrl: string;
  file: { mime: string; sizeBytes: number; filename: string } | null;
}
interface VendorDetail extends VendorInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  assignments: Assignment[];
  expenses: Expense[];
  documents: VendorDoc[];
  resources: { id: string; name: string; category: string; quantity: number }[];
  venues: { id: string; name: string; city: string }[];
  performance: {
    avgRating: number | null;
    ratedCount: number;
    assignmentCounts: Record<string, number>;
    totalAssignments: number;
    totalAgreedMinor: number;
    paidMinor: number;
    unpaidMinor: number;
    outstandingMinor: number;
  };
}

const DOC_KINDS = ['CONTRACT', 'SIGNED_CONTRACT', 'INVOICE', 'PLAN', 'OTHER'] as const;
const fileSize = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

type Tab = 'profile' | 'assignments' | 'payments' | 'documents';

function DocumentsPanel({ vendor, canManage }: { vendor: VendorDetail; canManage: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<(typeof DOC_KINDS)[number]>('CONTRACT');
  const [del, setDel] = useState<VendorDoc | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!);
      if (name.trim()) fd.append('name', name.trim());
      fd.append('kind', kind);
      return api.upload(`/admin/vendors/${vendor.id}/documents`, fd);
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      setFile(null);
      setName('');
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['vendor', vendor.id] });
    },
    onError: (err) => toast.error('Upload failed', errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/vendors/documents/${id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      setDel(null);
      qc.invalidateQueries({ queryKey: ['vendor', vendor.id] });
    },
    onError: (err) => toast.error('Could not delete', errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error('Choose a file to upload');
    upload.mutate();
  };
  return (
    <div className="space-y-4">
      <InternalNote>Documents are stored privately and can only be opened by signed-in staff with vendor access.</InternalNote>
      {canManage && (
        <Card title="Upload a document">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-end">
            <Field label="File (PDF, image or office document)">
              <input
                ref={fileRef}
                type="file"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-adm-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-adm-bg"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
                }}
                aria-label="Choose file"
              />
            </Field>
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. 2026 rate contract" />
            </Field>
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value as (typeof DOC_KINDS)[number])} options={DOC_KINDS.map((k) => ({ value: k, label: titleCase(k) }))} aria-label="Document kind" />
            </Field>
            <button className="adm-btn-primary" disabled={upload.isPending || !file}>
              <Upload className="h-4 w-4" /> {upload.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        </Card>
      )}
      <div className="adm-card overflow-hidden">
        {vendor.documents.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-adm-muted">No documents yet. Upload contracts, rate cards and invoices to keep them with the vendor.</p>
        ) : (
          <ul className="divide-y divide-adm-line/70">
            {vendor.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-adm-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="text-xs text-adm-muted">
                    {titleCase(d.kind)} · {d.file ? `${fileSize(d.file.sizeBytes)} · ` : ''}uploaded {fmtDate(d.createdAt)}
                  </p>
                </div>
                <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="adm-btn-secondary px-2.5 py-1.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
                <a href={d.fileUrl} download={d.file?.filename ?? d.name} className="adm-btn-secondary px-2.5 py-1.5 text-xs">
                  Download
                </a>
                {canManage && (
                  <button className="adm-btn-ghost px-2 py-1.5 text-red-600" onClick={() => setDel(d)} aria-label={`Delete ${d.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog open={!!del} title="Delete document?" body={`“${del?.name}” will be permanently removed.`} confirmLabel="Delete" danger loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(null)} />
    </div>
  );
}

function VendorScreen() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canManage = can('vendors.manage');
  const [tab, setTab] = useState<Tab>('profile');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const q = useQuery({ queryKey: ['vendor', id], queryFn: () => api.get<VendorDetail>(`/admin/vendors/${id}`) });
  const save = useMutation({
    mutationFn: (v: VendorInput) => api.put(`/admin/vendors/${id}`, v),
    onSuccess: async () => {
      setErrors({});
      toast.success('Vendor saved');
      await qc.invalidateQueries({ queryKey: ['vendor', id] });
      qc.invalidateQueries({ queryKey: ['vendors'] });
      setFormKey((k) => k + 1);
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not save', errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/vendors/${id}`),
    onSuccess: () => {
      toast.success('Vendor deleted');
      qc.invalidateQueries({ queryKey: ['vendors'] });
      nav('/admin/vendors');
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error(err instanceof ApiError && err.status === 409 ? 'This vendor is in use' : 'Could not delete', errorMessage(err));
    },
  });

  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError) return <AdmError error={q.error} onRetry={() => q.refetch()} />;
  const v = q.data!;
  const p = v.performance;

  const assignmentCols: Column<Assignment>[] = [
    {
      key: 'booking',
      header: 'Booking',
      cell: (a) => (
        <Link to={`/admin/bookings/${a.booking.id}?tab=vendors`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          <span className="font-medium">{a.booking.reference}</span>
          <span className="block text-xs text-adm-muted">{a.booking.title}</span>
        </Link>
      ),
    },
    { key: 'service', header: 'Service', cell: (a) => <span>{a.service}<span className="block text-xs text-adm-muted">{a.poNumber ?? ''}</span></span> },
    { key: 'event', header: 'Event date', className: 'hidden md:table-cell', cell: (a) => fmtDate(a.booking.eventDate) },
    { key: 'amount', header: 'Agreed', className: 'text-right tabular-nums', cell: (a) => money(a.agreedAmountMinor) },
    { key: 'perf', header: 'Performance', className: 'hidden lg:table-cell', cell: (a) => <Stars value={a.performanceRating} /> },
    { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
  ];
  const expenseCols: Column<Expense>[] = [
    { key: 'date', header: 'Date', cell: (e) => fmtDate(e.incurredOn) },
    { key: 'desc', header: 'Description', cell: (e) => <span>{e.description || e.category}<span className="block text-xs text-adm-muted">{[e.category, e.reference].filter(Boolean).join(' · ')}</span></span> },
    { key: 'booking', header: 'Booking', className: 'hidden md:table-cell', cell: (e) => (e.bookingId ? <Link to={`/admin/bookings/${e.bookingId}?tab=finance`} className="text-adm-gold hover:underline">Open</Link> : '—') },
    { key: 'amount', header: 'Amount', className: 'text-right tabular-nums', cell: (e) => money(e.amountMinor, e.currency) },
    { key: 'status', header: 'Status', cell: (e) => <span><StatusBadge status={e.status} />{e.paidOn && <span className="block text-xs text-adm-muted">paid {fmtDate(e.paidOn)}</span>}</span> },
  ];

  return (
    <div>
      <PageHeader
        back={{ to: '/admin/vendors', label: 'All vendors' }}
        title={v.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{v.category}</span>
            <Badge tone={VENDOR_STATUS_TONE[v.status as VendorStatus] ?? 'gray'}>{VENDOR_STATUS_LABEL[v.status as VendorStatus] ?? v.status}</Badge>
            <Stars value={v.rating} />
          </span>
        }
        actions={
          <>
            {v.phone && (
              <a className="adm-btn-secondary" href={`tel:${v.phone}`}>
                <Phone className="h-4 w-4" /> Call
              </a>
            )}
            {v.email && (
              <a className="adm-btn-secondary" href={`mailto:${v.email}`}>
                <Mail className="h-4 w-4" /> Email
              </a>
            )}
            {canManage && (
              <button className="adm-btn-ghost text-red-600 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
        <Stat label="Assignments" value={p.totalAssignments} hint={`${p.assignmentCounts.DELIVERED ?? 0} delivered · ${p.assignmentCounts.CANCELLED ?? 0} cancelled`} />
        <Stat label="Avg performance" value={p.avgRating ? `${p.avgRating} / 5` : '—'} hint={p.ratedCount ? `${p.ratedCount} rated job${p.ratedCount === 1 ? '' : 's'}` : 'No ratings yet'} tone="gold" />
        <Stat label="Total agreed" value={money(p.totalAgreedMinor)} hint="Excludes cancelled" />
        <Stat label="Paid" value={money(p.paidMinor)} tone="good" hint={p.unpaidMinor ? `${money(p.unpaidMinor)} billed, unpaid` : undefined} />
        <Stat label="Outstanding" value={money(p.outstandingMinor)} tone={p.outstandingMinor > 0 ? 'warn' : 'default'} />
      </div>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'profile', label: 'Profile' },
          { value: 'assignments', label: 'Assignments', count: v.assignments.length },
          { value: 'payments', label: 'Payments & expenses', count: v.expenses.length },
          { value: 'documents', label: 'Documents', count: v.documents.length },
        ]}
      />

      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {canManage ? (
            <Card
              title="Details"
              actions={
                <button className="adm-btn-primary px-3 py-1.5" type="submit" form="vendor-edit" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save changes'}
                </button>
              }
            >
              <VendorForm key={`${v.updatedAt}-${formKey}`} id="vendor-edit" initial={pickVendorInput(v)} errors={errors} onSubmit={(x) => save.mutate(x)} />
            </Card>
          ) : (
            <Card title="Details">
              <KeyValue
                items={[
                  ['Contact', v.contactName],
                  ['Phone', v.phone],
                  ['Email', v.email],
                  ['Website', v.website],
                  ['Services', v.services.join(', ')],
                  ['Service areas', v.serviceAreas.join(', ')],
                ]}
              />
              <InternalNote className="mt-5" />
              <div className="mt-3">
                <KeyValue cols={1} items={[['Price notes', <span className="whitespace-pre-line">{v.priceNotes || '—'}</span>], ['Availability', <span className="whitespace-pre-line">{v.availabilityNotes || '—'}</span>], ['Notes', <span className="whitespace-pre-line">{v.notes || '—'}</span>]]} />
              </div>
            </Card>
          )}
          <div className="space-y-4">
            <Card title="Quick facts">
              <KeyValue
                cols={1}
                items={[
                  ['Contact', v.contactName || '—'],
                  ['Website', v.website ? <a href={v.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-adm-gold hover:underline"><Globe className="h-3.5 w-3.5" /> {v.website.replace(/^https?:\/\//, '')}</a> : '—'],
                  ['Added', fmtDate(v.createdAt)],
                  ['Last updated', fmtDate(v.updatedAt)],
                ]}
              />
            </Card>
            {(v.venues.length > 0 || v.resources.length > 0) && (
              <Card title="Linked">
                {v.venues.length > 0 && (
                  <div className="mb-3">
                    <p className="adm-label">Venues</p>
                    <ul className="space-y-1 text-sm">
                      {v.venues.map((x) => (
                        <li key={x.id}>
                          <Link to={`/admin/venues/${x.id}`} className="hover:underline">
                            {x.name}
                          </Link>
                          {x.city && <span className="text-adm-muted"> · {x.city}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {v.resources.length > 0 && (
                  <div>
                    <p className="adm-label">Inventory supplied</p>
                    <ul className="space-y-1 text-sm">
                      {v.resources.map((r) => (
                        <li key={r.id}>
                          {r.name} <span className="text-adm-muted">× {r.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === 'assignments' && (
        <DataTable columns={assignmentCols} rows={v.assignments} rowKey={(a) => a.id} onRowClick={(a) => nav(`/admin/bookings/${a.booking.id}?tab=vendors`)} empty="This vendor hasn’t been assigned to any booking yet. Assign vendors from a booking’s Vendors tab." />
      )}
      {tab === 'payments' && (
        <>
          <InternalNote className="mb-3">Payments and expenses recorded against this vendor (managed from each booking’s finance tab).</InternalNote>
          <DataTable columns={expenseCols} rows={v.expenses} rowKey={(e) => e.id} empty="No payments or expenses recorded for this vendor." />
        </>
      )}
      {tab === 'documents' && <DocumentsPanel vendor={v} canManage={canManage} />}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${v.name}?`}
        body="Vendors with assignments or payments on record cannot be deleted — mark them Inactive instead. Uploaded documents will be removed."
        confirmLabel="Delete vendor"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default function VendorDetailPage() {
  return (
    <RequirePerm any={['vendors.view']}>
      <VendorScreen />
    </RequirePerm>
  );
}
