import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, money } from '@/lib/format';
import { ConfirmDialog, Field, Input, MoneyInput, Select, StatusBadge, Textarea } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { VendorAssignment, VendorLite } from '../types';
import { fieldErrors, fromLocalInput, toLocalInput, useRefreshBooking } from '../shared/hooks';
import { Alert, LoadError, SectionEmpty, SkeletonRows, VendorPicker } from '../shared/ui';

const STATUSES = ['REQUESTED', 'CONFIRMED', 'DELIVERED', 'CANCELLED'] as const;
const STATUS_TEXT: Record<string, string> = { REQUESTED: 'Requested', CONFIRMED: 'Confirmed', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

export default function VendorsTab({ booking: b }: TabProps) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const refreshBooking = useRefreshBooking(b.id);
  const manage = can('vendors.manage');
  const finance = can('finance.view');
  const key = ['booking-vendors', b.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<VendorAssignment[]>('/admin/vendors/assignments', { bookingId: b.id }) });
  const [editing, setEditing] = useState<VendorAssignment | 'new' | null>(null);
  const [removing, setRemoving] = useState<VendorAssignment | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    refreshBooking();
  };
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => api.patch(`/admin/vendors/assignments/${v.id}`, v.body),
    onSuccess: () => refresh(),
    onError: (err) => toast.error('Not updated', errorMessage(err)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/vendors/assignments/${id}`),
    onSuccess: () => {
      toast.success('Vendor removed from booking');
      setRemoving(null);
      refresh();
    },
  });

  if (q.isError) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  const live = rows.filter((r) => r.status !== 'CANCELLED');
  const agreed = live.reduce((s, r) => s + r.agreedAmountMinor, 0);
  const paid = live.reduce((s, r) => s + r.paidMinor, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-adm-muted">
          {live.length} vendor{live.length === 1 ? '' : 's'} on this event{rows.length ? ` · ${money(agreed, b.currency)} agreed` : ''}
          {finance && rows.length ? ` · ${money(paid, b.currency)} paid` : ''}
        </p>
        {manage && b.status !== 'CANCELLED' && (
          <button className="adm-btn-primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Assign vendor
          </button>
        )}
      </div>

      {q.isLoading ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <div className="adm-card">
          <SectionEmpty icon={<Building2 className="h-5 w-5" />} title="No vendors assigned" body="Assign caterers, decorators, photographers and other partners. Each assignment gets a purchase-order number." action={manage && b.status !== 'CANCELLED' ? <button className="adm-btn-primary" onClick={() => setEditing('new')}>Assign vendor</button> : undefined} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((a) => (
            <article key={a.id} className={cn('adm-card flex flex-col p-4', a.status === 'CANCELLED' && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/admin/vendors/${a.vendor.id}`} className="inline-flex items-center gap-1 font-medium hover:text-adm-gold">
                    {a.vendor.name} <ExternalLink className="h-3 w-3 text-adm-muted" />
                  </Link>
                  <p className="text-xs text-adm-muted">
                    {a.vendor.category}
                    {a.poNumber ? ` · ${a.poNumber}` : ''}
                  </p>
                </div>
                {manage ? (
                  <Select aria-label={`Status of ${a.vendor.name}`} className="!w-32 !py-1 text-xs" value={a.status} onChange={(e) => patch.mutate({ id: a.id, body: { status: e.target.value } })}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_TEXT[s]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <StatusBadge status={a.status === 'DELIVERED' ? 'DONE' : a.status} label={STATUS_TEXT[a.status]} />
                )}
              </div>
              <p className="mt-3 text-sm">{a.service}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-adm-muted">Agreed</dt>
                  <dd className="tabular-nums">{money(a.agreedAmountMinor, b.currency)}</dd>
                </div>
                {finance && (
                  <div>
                    <dt className="text-xs text-adm-muted">Paid / billed</dt>
                    <dd className="tabular-nums">
                      {money(a.paidMinor, b.currency)}
                      {a.billedUnpaidMinor > 0 && <span className="text-xs text-amber-700"> +{money(a.billedUnpaidMinor, b.currency)} due</span>}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-adm-muted">Delivery</dt>
                  <dd>{a.deliveryAt ? fmtDateTime(a.deliveryAt) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-adm-muted">Rating</dt>
                  <dd>
                    <Stars value={a.performanceRating} onChange={manage ? (r) => patch.mutate({ id: a.id, body: { performanceRating: r } }) : undefined} label={a.vendor.name} />
                  </dd>
                </div>
              </dl>
              {a.notes && <p className="mt-3 whitespace-pre-line rounded-md bg-adm-bg/70 px-3 py-2 text-xs text-adm-muted">{a.notes}</p>}
              {manage && (
                <div className="mt-auto flex justify-end gap-1 pt-3">
                  <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(a)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button className="adm-btn-ghost !px-2 !py-1 text-xs text-red-700" onClick={() => setRemoving(a)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <AssignmentModal open={!!editing} onClose={() => setEditing(null)} assignment={editing === 'new' ? null : editing} bookingId={b.id} currency={b.currency} onSaved={refresh} />
      <ConfirmDialog
        open={!!removing}
        title="Remove vendor?"
        body={
          <>
            <p>
              Remove {removing?.vendor.name} ({removing?.service}) from this booking? If payments were recorded against it, mark it Cancelled instead.
            </p>
            {del.isError && <Alert tone="error" className="mt-3">{errorMessage(del.error)}</Alert>}
          </>
        }
        confirmLabel="Remove"
        danger
        loading={del.isPending}
        onConfirm={() => removing && del.mutate(removing.id)}
        onClose={() => (setRemoving(null), del.reset())}
      />
    </div>
  );
}

function Stars({ value, onChange, label }: { value: number | null; onChange?: (v: number | null) => void; label: string }) {
  return (
    <div className="flex gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${label} rating: ${value ?? 'not rated'}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="text-adm-gold hover:scale-110" onClick={() => onChange(value === n ? null : n)}>
            <Star className="h-4 w-4" fill={value && n <= value ? 'currentColor' : 'none'} />
          </button>
        ) : (
          <Star key={n} className="h-4 w-4 text-adm-gold" fill={value && n <= value ? 'currentColor' : 'none'} aria-hidden />
        ),
      )}
    </div>
  );
}

function AssignmentModal({ open, onClose, assignment: a, bookingId, currency, onSaved }: { open: boolean; onClose: () => void; assignment: VendorAssignment | null; bookingId: string; currency: string; onSaved: () => void }) {
  const toast = useToast();
  const [vendor, setVendor] = useState<VendorLite | null>(null);
  const [f, setF] = useState({ service: '', agreedAmountMinor: 0 as number | null, status: 'REQUESTED', deliveryAt: '', notes: '', performanceRating: '', performanceNotes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setVendor(a ? { id: a.vendor.id, name: a.vendor.name, category: a.vendor.category, status: a.vendor.status, rating: null } : null);
    setF({
      service: a?.service ?? '',
      agreedAmountMinor: a?.agreedAmountMinor ?? 0,
      status: a?.status ?? 'REQUESTED',
      deliveryAt: toLocalInput(a?.deliveryAt),
      notes: a?.notes ?? '',
      performanceRating: a?.performanceRating ? String(a.performanceRating) : '',
      performanceNotes: a?.performanceNotes ?? '',
    });
  }, [open, a]);
  const save = useMutation({
    mutationFn: () => {
      const base = { service: f.service.trim(), agreedAmountMinor: f.agreedAmountMinor ?? 0, status: f.status, deliveryAt: fromLocalInput(f.deliveryAt), notes: f.notes.trim() };
      return a
        ? api.patch(`/admin/vendors/assignments/${a.id}`, { ...base, performanceRating: f.performanceRating ? Number(f.performanceRating) : null, performanceNotes: f.performanceNotes.trim() })
        : api.post('/admin/vendors/assignments', { ...base, vendorId: vendor!.id, bookingId });
    },
    onSuccess: () => {
      toast.success(a ? 'Assignment updated' : 'Vendor assigned', a ? undefined : 'A purchase-order number has been issued.');
      onSaved();
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      setServerError(errorMessage(err));
    },
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!vendor) e.vendorId = 'Choose a vendor';
    if (!f.service.trim()) e.service = 'Describe the service';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={a ? `Edit ${a.vendor.name}` : 'Assign vendor'}
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : a ? 'Save' : 'Assign'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!a && <VendorPicker value={vendor} onChange={setVendor} required error={errors.vendorId} />}
        <Field label="Service" required error={errors.service}>
          <Input value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} placeholder="e.g. Mandap décor and floral installation" maxLength={200} invalid={!!errors.service} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Agreed amount">
            <MoneyInput value={f.agreedAmountMinor} onChange={(v) => setF({ ...f, agreedAmountMinor: v })} currency={currency} />
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_TEXT[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Delivery / arrival">
            <Input type="datetime-local" value={f.deliveryAt} onChange={(e) => setF({ ...f, deliveryAt: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes" hint="Internal — not shared with the client.">
          <Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={4000} />
        </Field>
        {a && (
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field label="Performance rating">
              <Select value={f.performanceRating} onChange={(e) => setF({ ...f, performanceRating: e.target.value })}>
                <option value="">Not rated</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {'★'.repeat(n)} ({n})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Performance notes">
              <Input value={f.performanceNotes} onChange={(e) => setF({ ...f, performanceNotes: e.target.value })} maxLength={4000} />
            </Field>
          </div>
        )}
        {serverError && <Alert tone="error">{serverError}</Alert>}
      </div>
    </Modal>
  );
}
