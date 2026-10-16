import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, money } from '@/lib/format';
import { ConfirmDialog, DataTable, Field, Input, MoneyInput, Pagination, Select, StatusBadge, type Column } from '@/admin/ui';
import type { BookingListItem, Expense, VendorLite } from '../types';
import { fieldErrors, openFile, todayIso } from '../shared/hooks';
import { Alert, BookingPicker, LoadError, VendorPicker } from '../shared/ui';

export const EXPENSE_CATEGORIES = ['Vendor payment', 'Venue', 'Décor & florals', 'Catering', 'Equipment rental', 'Transport & logistics', 'Staff & crew', 'Travel', 'Printing', 'Permits & licences', 'Marketing', 'Miscellaneous'];

export function ExpensesPanel() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const manage = can('finance.manage');
  const [booking, setBooking] = useState<BookingListItem | null>(null);
  const [vendor, setVendor] = useState<VendorLite | null>(null);
  const [f, setF] = useState({ category: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const query = { page, limit: 25, bookingId: booking?.id, vendorId: vendor?.id, category: f.category || undefined, status: f.status || undefined, from: f.from || undefined, to: f.to || undefined };
  const list = useQuery({ queryKey: ['finance', 'expenses', query], queryFn: () => api.getPaged<Expense[]>('/admin/finance/expenses', query), placeholderData: (p) => p });
  const set = (k: keyof typeof f, v: string) => (setF((x) => ({ ...x, [k]: v })), setPage(1));
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/finance/expenses/${id}`),
    onSuccess: () => {
      toast.success('Expense deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error('Could not delete', errorMessage(err)),
  });

  const cols: Column<Expense>[] = [
    { key: 'date', header: 'Date', cell: (e) => <span className="whitespace-nowrap">{fmtDate(e.incurredOn)}</span> },
    {
      key: 'desc',
      header: 'Description',
      cell: (e) => (
        <div className="min-w-[200px]">
          <p className="font-medium">{e.description}</p>
          <p className="text-xs text-adm-muted">
            {e.category}
            {e.reference ? ` · Ref ${e.reference}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'booking',
      header: 'Booking',
      cell: (e) =>
        e.booking ? (
          <Link to={`/admin/bookings/${e.booking.id}`} className="whitespace-nowrap hover:text-adm-gold" onClick={(ev) => ev.stopPropagation()}>
            {e.booking.reference}
          </Link>
        ) : (
          <span className="text-adm-muted">Overhead</span>
        ),
    },
    { key: 'vendor', header: 'Vendor', cell: (e) => (e.vendor ? <Link to={`/admin/vendors/${e.vendor.id}`} className="hover:text-adm-gold" onClick={(ev) => ev.stopPropagation()}>{e.vendor.name}</Link> : <span className="text-adm-muted">—</span>) },
    { key: 'amount', header: 'Amount', className: 'text-right tabular-nums whitespace-nowrap', cell: (e) => money(e.amountMinor, e.currency) },
    {
      key: 'status',
      header: 'Status',
      cell: (e) => (
        <div className="whitespace-nowrap">
          <StatusBadge status={e.status} />
          {e.paidOn && <span className="block text-xs text-adm-muted">{fmtDate(e.paidOn)}</span>}
        </div>
      ),
    },
    {
      key: 'act',
      header: <span className="relative block"><span className="sr-only">Actions</span></span>,
      className: 'text-right whitespace-nowrap',
      cell: (e) => (
        <>
          {e.receiptMediaId && (
            <button
              className="adm-btn-ghost !px-2 !py-1"
              onClick={(ev) => {
                ev.stopPropagation();
                openFile(`/admin/finance/expenses/${e.id}/receipt`);
              }}
              aria-label="View receipt"
              title="View receipt"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          )}
          {manage && (
            <button
              className="adm-btn-ghost !px-2 !py-1 text-red-700"
              onClick={(ev) => {
                ev.stopPropagation();
                setDeleting(e);
              }}
              aria-label={`Delete ${e.description}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="text-adm-muted">Total for these filters: </span>
          <strong className="tabular-nums">{list.data?.meta ? money(list.data.meta.totalMinor as number) : '—'}</strong>
        </p>
        {manage && (
          <button className="adm-btn-primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add expense
          </button>
        )}
      </div>
      <div className="adm-card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <BookingPicker value={booking} onChange={(b) => (setBooking(b), setPage(1))} />
        </div>
        {can('vendors.view') && (
          <div className="lg:col-span-2">
            <VendorPicker value={vendor} onChange={(v) => (setVendor(v), setPage(1))} />
          </div>
        )}
        <Field label="Category">
          <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid status">
          <Select value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PAID">Paid</option>
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set('to', e.target.value)} />
        </Field>
      </div>
      {list.isError ? (
        <LoadError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <DataTable columns={cols} rows={list.data?.data} rowKey={(e) => e.id} loading={list.isLoading} onRowClick={manage ? (e) => setEditing(e) : undefined} empty="No expenses match. Record vendor payments and event costs to track margins." />
          {list.data?.meta && <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={setPage} />}
        </>
      )}
      <ExpenseModal expense={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} title="Delete expense?" body={`“${deleting?.description}” (${deleting ? money(deleting.amountMinor, deleting.currency) : ''}) will be removed. This is recorded in the audit log.`} confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => deleting && del.mutate(deleting.id)} onClose={() => setDeleting(null)} />
    </div>
  );
}

const emptyForm = { category: 'Vendor payment', description: '', amountMinor: 0 as number | null, incurredOn: '', status: 'UNPAID', paidOn: '', reference: '' };

function ExpenseModal({ expense, onClose }: { expense: Expense | 'new' | null; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const e = expense === 'new' ? null : expense;
  const [booking, setBooking] = useState<BookingListItem | null>(null);
  const [vendor, setVendor] = useState<VendorLite | null>(null);
  const [f, setF] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => {
    if (!expense) return;
    setErrors({});
    setServerError(null);
    setFile(null);
    setBooking(e?.booking ? ({ id: e.booking.id, reference: e.booking.reference, title: '' } as BookingListItem) : null);
    setVendor(e?.vendor ? { id: e.vendor.id, name: e.vendor.name, category: '', status: 'ACTIVE', rating: null } : null);
    setF(e ? { category: e.category, description: e.description, amountMinor: e.amountMinor, incurredOn: e.incurredOn, status: e.status, paidOn: e.paidOn ?? '', reference: e.reference } : { ...emptyForm, incurredOn: todayIso() });
  }, [expense, e]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        bookingId: booking?.id ?? null,
        vendorId: vendor?.id ?? null,
        assignmentId: e?.assignmentId ?? null,
        category: f.category.trim(),
        description: f.description.trim(),
        amountMinor: f.amountMinor ?? 0,
        incurredOn: f.incurredOn,
        status: f.status,
        paidOn: f.status === 'PAID' ? f.paidOn || f.incurredOn : null,
        reference: f.reference.trim(),
      };
      const saved = e ? await api.put<Expense>(`/admin/finance/expenses/${e.id}`, body) : await api.post<Expense>('/admin/finance/expenses', body);
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        try {
          await api.upload(`/admin/finance/expenses/${saved.id}/receipt`, fd);
        } catch (err) {
          toast.error('Expense saved, but the receipt upload failed', errorMessage(err));
        }
      }
      return saved;
    },
    onSuccess: () => {
      toast.success(e ? 'Expense updated' : 'Expense added');
      qc.invalidateQueries({ queryKey: ['finance'] });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      setServerError(errorMessage(err));
    },
  });
  const submit = () => {
    const er: Record<string, string> = {};
    if (!f.category.trim()) er.category = 'Choose a category';
    if (!f.description.trim()) er.description = 'Describe the expense';
    if (!f.amountMinor || f.amountMinor < 1) er.amountMinor = 'Enter the amount';
    if (!f.incurredOn) er.incurredOn = 'Choose a date';
    setErrors(er);
    if (!Object.keys(er).length) save.mutate();
  };
  const set = (k: keyof typeof emptyForm, v: string | number | null) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Modal
      open={!!expense}
      onClose={onClose}
      title={e ? 'Edit expense' : 'Add expense'}
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : e ? 'Save' : 'Add expense'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <BookingPicker value={booking} onChange={setBooking} label="Booking (optional)" />
          {can('vendors.view') && <VendorPicker value={vendor} onChange={setVendor} label="Vendor (optional)" />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required error={errors.category}>
            <Input list="expense-categories" value={f.category} onChange={(ev) => set('category', ev.target.value)} maxLength={60} invalid={!!errors.category} />
            <datalist id="expense-categories">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Amount" required error={errors.amountMinor}>
            <MoneyInput value={f.amountMinor} onChange={(v) => set('amountMinor', v)} invalid={!!errors.amountMinor} />
          </Field>
        </div>
        <Field label="Description" required error={errors.description}>
          <Input value={f.description} onChange={(ev) => set('description', ev.target.value)} maxLength={300} invalid={!!errors.description} placeholder="e.g. Balance payment — floral installation" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Incurred on" required error={errors.incurredOn}>
            <Input type="date" value={f.incurredOn} onChange={(ev) => set('incurredOn', ev.target.value)} invalid={!!errors.incurredOn} />
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(ev) => set('status', ev.target.value)}>
              <option value="UNPAID">Unpaid</option>
              <option value="PAID">Paid</option>
            </Select>
          </Field>
          <Field label="Paid on">
            <Input type="date" value={f.paidOn} onChange={(ev) => set('paidOn', ev.target.value)} disabled={f.status !== 'PAID'} />
          </Field>
        </div>
        <Field label="Reference" hint="Bill / UTR / cheque number">
          <Input value={f.reference} onChange={(ev) => set('reference', ev.target.value)} maxLength={120} />
        </Field>
        <Field label="Receipt" hint={e?.receiptMediaId ? 'A receipt is attached — choosing a file replaces it.' : 'PDF or image.'}>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="block min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border file:border-adm-line file:bg-white file:px-3 file:py-1.5 file:text-sm" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
            {e?.receiptMediaId && (
              <button type="button" className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => openFile(`/admin/finance/expenses/${e.id}/receipt`)}>
                <Paperclip className="h-3.5 w-3.5" /> View current
              </button>
            )}
          </div>
        </Field>
        {serverError && <Alert tone="error">{serverError}</Alert>}
      </div>
    </Modal>
  );
}
