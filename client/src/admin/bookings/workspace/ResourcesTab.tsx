import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Truck, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { ConfirmDialog, Field, Input, Select, StatusBadge, Textarea } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { Allocation, ResourceLite } from '../types';
import { isConflict } from '../shared/hooks';
import { Alert, LoadError, SectionEmpty, SkeletonRows } from '../shared/ui';

const TONE: Record<string, string> = { RESERVED: 'PENDING', DISPATCHED: 'IN_PROGRESS', RETURNED: 'DONE', CANCELLED: 'CANCELLED' };

export default function ResourcesTab({ booking: b }: TabProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['booking-allocations', b.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Allocation[]>('/admin/resources/allocations', { bookingId: b.id }) });
  const [adding, setAdding] = useState(false);
  const [returning, setReturning] = useState<Allocation | null>(null);
  const [cancelling, setCancelling] = useState<Allocation | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const dispatch = useMutation({
    mutationFn: (a: Allocation) => api.patch(`/admin/resources/allocations/${a.id}`, { status: 'DISPATCHED' }),
    onSuccess: () => (toast.success('Marked as dispatched'), refresh()),
    onError: (err) => toast.error('Not updated', errorMessage(err)),
  });
  const cancel = useMutation({
    mutationFn: (a: Allocation) => api.post(`/admin/resources/allocations/${a.id}/cancel`),
    onSuccess: () => {
      toast.success('Allocation cancelled — stock released');
      setCancelling(null);
      refresh();
    },
    onError: (err) => toast.error('Could not cancel', errorMessage(err)),
  });

  if (q.isError) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  const locked = b.status === 'CANCELLED' || b.status === 'COMPLETED';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-adm-muted">Inventory reserved for this event. Stock is held from dispatch to return and cannot be double-booked.</p>
        {!locked && (
          <button className="adm-btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Allocate item
          </button>
        )}
      </div>
      {q.isLoading ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <div className="adm-card">
          <SectionEmpty icon={<Package className="h-5 w-5" />} title="No inventory allocated" body="Reserve lighting, furniture, staging and décor from inventory. Availability is checked for the event dates." action={!locked ? <button className="adm-btn-primary" onClick={() => setAdding(true)}>Allocate item</button> : undefined} />
        </div>
      ) : (
        <div className="adm-card overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Return</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={cn(a.status === 'CANCELLED' && 'opacity-55')}>
                  <td>
                    <p className="font-medium">{a.resource.name}</p>
                    <p className="text-xs text-adm-muted">
                      {a.resource.category}
                      {a.resource.sku ? ` · ${a.resource.sku}` : ''}
                      {a.resource.ownership === 'VENDOR' ? ' · vendor-supplied' : ''}
                    </p>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {a.quantity} {a.resource.unit}
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDate(a.fromDate, { day: 'numeric', month: 'short' })}
                    {a.toDate !== a.fromDate ? ` – ${fmtDate(a.toDate)}` : `, ${a.fromDate.slice(0, 4)}`}
                  </td>
                  <td>
                    <StatusBadge status={TONE[a.status]} label={a.status.charAt(0) + a.status.slice(1).toLowerCase()} />
                  </td>
                  <td className="text-xs">
                    {a.status === 'RETURNED' ? (
                      <span>
                        {a.returnedQty ?? a.quantity} returned
                        {a.damagedQty > 0 && <span className="text-red-700"> · {a.damagedQty} damaged</span>}
                        {a.damageNotes && <span className="block text-adm-muted">{a.damageNotes}</span>}
                      </span>
                    ) : (
                      <span className="text-adm-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {a.status === 'RESERVED' && (
                      <>
                        <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => dispatch.mutate(a)} disabled={dispatch.isPending}>
                          <Truck className="h-3.5 w-3.5" /> Dispatch
                        </button>
                        <button className="adm-btn-ghost !px-2 !py-1 text-xs text-red-700" onClick={() => setCancelling(a)}>
                          <X className="h-3.5 w-3.5" /> Cancel
                        </button>
                      </>
                    )}
                    {a.status === 'DISPATCHED' && (
                      <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => setReturning(a)}>
                        <Undo2 className="h-3.5 w-3.5" /> Record return
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AllocateModal open={adding} onClose={() => setAdding(false)} booking={b} onSaved={refresh} />
      <ReturnModal allocation={returning} onClose={() => setReturning(null)} onSaved={refresh} />
      <ConfirmDialog open={!!cancelling} title="Cancel allocation?" body={`Release ${cancelling?.quantity} × ${cancelling?.resource.name} back to stock?`} confirmLabel="Cancel allocation" danger loading={cancel.isPending} onConfirm={() => cancelling && cancel.mutate(cancelling)} onClose={() => setCancelling(null)} />
    </div>
  );
}

interface Availability {
  quantity: number;
  allocated: number;
  available: number;
  allocations: { id: string; quantity: number; fromDate: string; toDate: string; booking: { reference: string; title: string } }[];
}

function AllocateModal({ open, onClose, booking: b, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void } & TabProps) {
  const toast = useToast();
  const resources = useQuery({ queryKey: ['resource-options'], queryFn: () => api.get<ResourceLite[]>('/admin/resources', { limit: 200 }), enabled: open });
  const [f, setF] = useState({ resourceId: '', quantity: '1', fromDate: b.eventDate, toDate: b.eventEndDate ?? b.eventDate });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setF({ resourceId: '', quantity: '1', fromDate: b.eventDate, toDate: b.eventEndDate ?? b.eventDate });
      setError(null);
    }
  }, [open, b.eventDate, b.eventEndDate]);
  const datesOk = !!f.fromDate && !!f.toDate && f.toDate >= f.fromDate;
  const avail = useQuery({
    queryKey: ['resource-availability', f.resourceId, f.fromDate, f.toDate],
    queryFn: () => api.get<Availability>(`/admin/resources/${f.resourceId}/availability`, { from: f.fromDate, to: f.toDate }),
    enabled: open && !!f.resourceId && datesOk,
  });
  const qty = Number(f.quantity) || 0;
  const over = avail.data ? qty > avail.data.available : false;
  const save = useMutation({
    mutationFn: () => api.post('/admin/resources/allocations', { resourceId: f.resourceId, bookingId: b.id, quantity: qty, fromDate: f.fromDate, toDate: f.toDate }),
    onSuccess: () => {
      toast.success('Item allocated');
      onSaved();
      onClose();
    },
    onError: (err) => {
      setError(isConflict(err) ? `Overbooked: ${errorMessage(err)}` : errorMessage(err));
      avail.refetch();
    },
  });
  const res = resources.data?.find((r) => r.id === f.resourceId);
  const grouped = (resources.data ?? []).filter((r) => r.condition !== 'RETIRED').reduce<Record<string, ResourceLite[]>>((acc, r) => ((acc[r.category] ??= []).push(r), acc), {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Allocate inventory"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={!f.resourceId || qty < 1 || !datesOk || over || avail.isLoading || save.isPending} onClick={() => (setError(null), save.mutate())}>
            {save.isPending ? 'Allocating…' : 'Allocate'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Item" required hint={resources.isError ? errorMessage(resources.error) : undefined}>
          <Select value={f.resourceId} onChange={(e) => (setF({ ...f, resourceId: e.target.value }), setError(null))} disabled={resources.isLoading}>
            <option value="">{resources.isLoading ? 'Loading inventory…' : resources.data?.length ? 'Choose an item' : 'No inventory items yet'}</option>
            {Object.entries(grouped).map(([cat, items]) => (
              <optgroup key={cat} label={cat}>
                {items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.quantity} {r.unit}
                    {r.condition === 'NEEDS_REPAIR' ? ', needs repair' : ''})
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`Quantity${res ? ` (${res.unit})` : ''}`} required>
            <Input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} invalid={over} />
          </Field>
          <Field label="Dispatch" required>
            <Input type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} />
          </Field>
          <Field label="Return" required error={!datesOk && f.toDate ? 'On or after dispatch' : undefined}>
            <Input type="date" value={f.toDate} min={f.fromDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} />
          </Field>
        </div>
        {f.resourceId && datesOk && (
          <div aria-live="polite">
            {avail.isLoading ? (
              <div className="h-14 animate-pulse rounded-lg bg-adm-line/60" />
            ) : avail.isError ? (
              <Alert tone="error">{errorMessage(avail.error)}</Alert>
            ) : avail.data ? (
              <Alert tone={over ? 'error' : avail.data.available === 0 ? 'warn' : 'good'} title={`${avail.data.available} of ${avail.data.quantity} available for these dates`}>
                {avail.data.allocated > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {avail.data.allocations.map((x) => (
                      <li key={x.id}>
                        {x.quantity} held by {x.booking.reference} — {x.booking.title} ({fmtDate(x.fromDate, { day: 'numeric', month: 'short' })}–{fmtDate(x.toDate, { day: 'numeric', month: 'short' })})
                      </li>
                    ))}
                  </ul>
                )}
                {over && <p className="mt-1 font-medium">Reduce the quantity or choose other dates.</p>}
              </Alert>
            ) : null}
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function ReturnModal({ allocation: a, onClose, onSaved }: { allocation: Allocation | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ returnedQty: '', damagedQty: '0', damageNotes: '' });
  useEffect(() => {
    if (a) setF({ returnedQty: String(a.quantity), damagedQty: '0', damageNotes: '' });
  }, [a]);
  const save = useMutation({
    mutationFn: () => api.patch<{ resourceFlaggedForRepair?: boolean }>(`/admin/resources/allocations/${a!.id}`, { status: 'RETURNED', returnedQty: Number(f.returnedQty), damagedQty: Number(f.damagedQty), damageNotes: f.damageNotes.trim() }),
    onSuccess: (r) => {
      toast.success('Return recorded', r.resourceFlaggedForRepair ? 'The item has been flagged as needing repair.' : undefined);
      onSaved();
      onClose();
    },
  });
  const ret = Number(f.returnedQty);
  const dmg = Number(f.damagedQty);
  const invalid = !a || Number.isNaN(ret) || ret < 0 || ret > a.quantity || Number.isNaN(dmg) || dmg < 0 || dmg > a.quantity;
  return (
    <Modal
      open={!!a}
      onClose={onClose}
      title={a ? `Return ${a.resource.name}` : ''}
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={invalid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Record return'}
          </button>
        </>
      }
    >
      {a && (
        <div className="space-y-4">
          <p className="text-sm text-adm-muted">
            {a.quantity} {a.resource.unit} were dispatched. Damaged owned items are automatically flagged for repair.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Returned" required error={ret > a.quantity ? `Max ${a.quantity}` : undefined}>
              <Input type="number" min={0} max={a.quantity} value={f.returnedQty} onChange={(e) => setF({ ...f, returnedQty: e.target.value })} />
            </Field>
            <Field label="Damaged" error={dmg > a.quantity ? `Max ${a.quantity}` : undefined}>
              <Input type="number" min={0} max={a.quantity} value={f.damagedQty} onChange={(e) => setF({ ...f, damagedQty: e.target.value })} />
            </Field>
          </div>
          <Field label="Damage / return notes">
            <Textarea rows={3} value={f.damageNotes} onChange={(e) => setF({ ...f, damageNotes: e.target.value })} maxLength={2000} />
          </Field>
          {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        </div>
      )}
    </Modal>
  );
}
