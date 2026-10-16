import { useMutation } from '@tanstack/react-query';
import { RSVP_STATUSES } from '@maison/shared';
import { Copy, QrCode, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, titleCase } from '@/lib/format';
import { ConfirmDialog, Field, Input, Select, Textarea } from '@/admin/ui';
import type { Guest } from '../types';
import { fieldErrors } from '../shared/hooks';
import { Alert } from '../shared/ui';

export const inviteUrl = (code: string) => `${window.location.origin}/rsvp/${code}`;

async function copy(text: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied');
  } catch {
    toast.error('Copy failed', 'Select the link and copy it manually.');
  }
}

const emptyGuest = { name: '', email: '', phone: '', group: '', side: '', plusOnes: '0', rsvpStatus: 'PENDING', dietary: '', tableLabel: '', seatNumber: '', notes: '' };

export function GuestDrawer({ open, guest, bookingId, onClose, onSaved, onShowQr }: { open: boolean; guest: Guest | null; bookingId: string; onClose: () => void; onSaved: () => void; onShowQr: (g: Guest) => void }) {
  const toast = useToast();
  const [f, setF] = useState(emptyGuest);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      guest
        ? { name: guest.name, email: guest.email, phone: guest.phone, group: guest.group, side: guest.side, plusOnes: String(guest.plusOnes), rsvpStatus: guest.rsvpStatus, dietary: guest.dietary, tableLabel: guest.tableLabel, seatNumber: guest.seatNumber ? String(guest.seatNumber) : '', notes: guest.notes }
        : emptyGuest,
    );
  }, [open, guest]);
  const body = () => ({ ...f, name: f.name.trim(), email: f.email.trim(), plusOnes: Number(f.plusOnes) || 0, seatNumber: f.seatNumber ? Number(f.seatNumber) : null });
  const save = useMutation({
    mutationFn: () => (guest ? api.patch(`/admin/guests/${guest.id}`, body()) : api.post('/admin/guests', { ...body(), bookingId })),
    onSuccess: () => {
      toast.success(guest ? 'Guest updated' : 'Guest added');
      onSaved();
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error('Not saved', errorMessage(err));
    },
  });
  const del = useMutation({
    mutationFn: () => api.delete(`/admin/guests/${guest!.id}`),
    onSuccess: () => {
      toast.success('Guest removed');
      setConfirmDel(false);
      onSaved();
      onClose();
    },
    onError: (err) => toast.error('Could not remove', errorMessage(err)),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Name is required';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Invalid email';
    const p = Number(f.plusOnes);
    if (!Number.isInteger(p) || p < 0 || p > 10) e.plusOnes = '0 to 10';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };
  const set = (k: keyof typeof emptyGuest, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        side
        title={guest ? guest.name : 'Add guest'}
        footer={
          <>
            {guest && (
              <button className="adm-btn-ghost mr-auto text-red-700" onClick={() => setConfirmDel(true)}>
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
            <button className="adm-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="adm-btn-primary" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : guest ? 'Save guest' : 'Add guest'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {guest && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-adm-bg px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-adm-muted">Invite code</p>
                <p className="font-mono text-sm tracking-wider">{guest.inviteCode}</p>
                {guest.rsvpAt && <p className="mt-0.5 text-xs text-adm-muted">RSVP {fmtDateTime(guest.rsvpAt)}</p>}
              </div>
              <div className="flex gap-1">
                <button className="adm-btn-ghost !px-2" onClick={() => copy(inviteUrl(guest.inviteCode), toast)} aria-label="Copy RSVP link">
                  <Copy className="h-4 w-4" />
                </button>
                <button className="adm-btn-ghost !px-2" onClick={() => onShowQr(guest)} aria-label="Show QR code">
                  <QrCode className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          <Field label="Name" required error={errors.name}>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={160} invalid={!!errors.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" error={errors.email} hint="Needed for emailed invitations">
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} maxLength={200} invalid={!!errors.email} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} />
            </Field>
            <Field label="Group" hint="e.g. Family, College friends">
              <Input value={f.group} onChange={(e) => set('group', e.target.value)} maxLength={80} />
            </Field>
            <Field label="Side" hint="e.g. Bride, Groom, Company">
              <Input value={f.side} onChange={(e) => set('side', e.target.value)} maxLength={80} />
            </Field>
            <Field label="Plus-ones" error={errors.plusOnes}>
              <Input type="number" min={0} max={10} value={f.plusOnes} onChange={(e) => set('plusOnes', e.target.value)} invalid={!!errors.plusOnes} />
            </Field>
            <Field label="RSVP">
              <Select value={f.rsvpStatus} onChange={(e) => set('rsvpStatus', e.target.value)}>
                {RSVP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Table">
              <Input value={f.tableLabel} onChange={(e) => set('tableLabel', e.target.value)} maxLength={40} />
            </Field>
            <Field label="Seat">
              <Input type="number" min={1} value={f.seatNumber} onChange={(e) => set('seatNumber', e.target.value)} disabled={!f.tableLabel} />
            </Field>
          </div>
          <Field label="Dietary requirements">
            <Input value={f.dietary} onChange={(e) => set('dietary', e.target.value)} maxLength={300} placeholder="e.g. Jain, nut allergy" />
          </Field>
          <Field label="Notes">
            <Textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog open={confirmDel} title="Remove guest?" body={`${guest?.name} will be removed and their invite link will stop working.`} confirmLabel="Remove" danger loading={del.isPending} onConfirm={() => del.mutate()} onClose={() => setConfirmDel(false)} />
    </>
  );
}

export function QrModal({ guest, onClose }: { guest: Guest | null; onClose: () => void }) {
  const toast = useToast();
  const url = guest ? inviteUrl(guest.inviteCode) : '';
  return (
    <Modal open={!!guest} onClose={onClose} title={guest ? `Invitation — ${guest.name}` : ''} size="sm">
      {guest && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-xl border border-adm-line bg-white p-4">
            <QRCodeSVG value={url} size={208} level="M" marginSize={1} title={`RSVP QR code for ${guest.name}`} />
          </div>
          <div>
            <p className="font-mono text-lg tracking-[0.2em]">{guest.inviteCode}</p>
            <p className="mt-1 text-xs text-adm-muted">Scan at the door to check in, or share for RSVP.</p>
          </div>
          <div className="flex w-full items-center gap-2 rounded-lg bg-adm-bg p-2">
            <input readOnly value={url} className="min-w-0 flex-1 bg-transparent px-1 text-xs text-adm-muted outline-none" aria-label="RSVP link" onFocus={(e) => e.currentTarget.select()} />
            <button className="adm-btn-secondary !px-2 !py-1 text-xs" onClick={() => copy(url, toast)}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface ImportResult {
  created: number;
  valid: number;
  errors: { row: number; message: string }[];
  skipped: { row: number; message: string }[];
  dryRun: boolean;
  totalRows: number;
}
export function ImportModal({ open, onClose, bookingId, onImported }: { open: boolean; onClose: () => void; bookingId: string; onImported: () => void }) {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  useEffect(() => {
    if (open) {
      setCsv('');
      setPreview(null);
    }
  }, [open]);
  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.post<ImportResult>('/admin/guests/import', { bookingId, csv, dryRun }),
    onSuccess: (r) => {
      if (r.dryRun) return setPreview(r);
      toast.success(`${r.created} guests imported`, r.errors.length || r.skipped.length ? `${r.errors.length} rows with errors, ${r.skipped.length} skipped` : undefined);
      onImported();
      onClose();
    },
  });
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) return toast.error('File too large', 'Import at most 2 MB at a time.');
    setCsv(await file.text());
    setPreview(null);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import guests from CSV"
      size="lg"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {preview && preview.valid > 0 ? (
            <button className="adm-btn-primary" onClick={() => run.mutate(false)} disabled={run.isPending}>
              {run.isPending ? 'Importing…' : `Import ${preview.valid} guest${preview.valid === 1 ? '' : 's'}`}
            </button>
          ) : (
            <button className="adm-btn-primary" onClick={() => run.mutate(true)} disabled={!csv.trim() || run.isPending}>
              {run.isPending ? 'Checking…' : 'Preview import'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-adm-muted">
          The first row must be a header. Recognised columns: <code className="rounded bg-adm-bg px-1 text-xs">name, email, phone, group, side, plusOnes, dietary, table</code>. Guests whose email is already on the list are skipped.
        </p>
        <Field label="CSV file">
          <input type="file" accept=".csv,text/csv,text/plain" className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-adm-line file:bg-white file:px-3 file:py-1.5 file:text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
        </Field>
        <Field label="…or paste CSV">
          <Textarea
            rows={8}
            className="font-mono text-xs"
            value={csv}
            onChange={(e) => (setCsv(e.target.value), setPreview(null))}
            placeholder={'name,email,phone,group,side,plusOnes,dietary,table\nAnanya Rao,ananya@example.com,+91 98…,Family,Bride,1,Vegetarian,T1'}
          />
        </Field>
        {run.isError && <Alert tone="error">{errorMessage(run.error)}</Alert>}
        {preview && (
          <div className="space-y-3" aria-live="polite">
            <Alert tone={preview.valid ? (preview.errors.length ? 'warn' : 'good') : 'error'} title={`${preview.valid} of ${preview.totalRows} rows ready to import`}>
              {preview.errors.length > 0 && `${preview.errors.length} with errors. `}
              {preview.skipped.length > 0 && `${preview.skipped.length} skipped (already on the list).`}
              {!preview.valid && ' Fix the rows below and preview again.'}
            </Alert>
            {(preview.errors.length > 0 || preview.skipped.length > 0) && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-adm-line">
                <table className="adm-table text-xs">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((e) => (
                      <tr key={`e${e.row}`}>
                        <td className="tabular-nums">{e.row}</td>
                        <td className="text-red-700">{e.message}</td>
                      </tr>
                    ))}
                    {preview.skipped.map((e) => (
                      <tr key={`s${e.row}`}>
                        <td className="tabular-nums">{e.row}</td>
                        <td className="text-adm-muted">Skipped — {e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function TablesModal({ open, onClose, bookingId, guests, existing, onSaved }: { open: boolean; onClose: () => void; bookingId: string; guests: Guest[]; existing: { label: string; seats: number }[]; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [startSeat, setStartSeat] = useState('');
  useEffect(() => {
    if (open) {
      setLabel('');
      setStartSeat('');
    }
  }, [open]);
  const save = useMutation({
    mutationFn: () => {
      const start = Number(startSeat) || 0;
      let seat = start;
      return api.post('/admin/guests/tables', {
        bookingId,
        assignments: guests.map((g) => {
          const a = { guestId: g.id, tableLabel: label.trim(), seatNumber: label.trim() && start ? seat : null };
          seat += 1 + g.plusOnes;
          return a;
        }),
      });
    },
    onSuccess: () => {
      toast.success(label.trim() ? `${guests.length} guests seated at ${label.trim()}` : `${guests.length} guests unseated`);
      onSaved();
      onClose();
    },
  });
  const seats = guests.reduce((s, g) => s + 1 + g.plusOnes, 0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign table"
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={save.isPending || !guests.length} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : label.trim() ? 'Assign' : 'Remove from tables'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-adm-muted">
          {guests.length} guest{guests.length === 1 ? '' : 's'} selected ({seats} seat{seats === 1 ? '' : 's'} including plus-ones). Leave the table empty to unseat them.
        </p>
        <Field label="Table">
          <Input list="table-labels" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="e.g. T4 or Rose" />
          <datalist id="table-labels">
            {existing.map((t) => (
              <option key={t.label} value={t.label}>
                {t.seats} seats taken
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Number seats from" hint="Optional — seats are numbered in list order, leaving room for plus-ones.">
          <Input type="number" min={1} value={startSeat} onChange={(e) => setStartSeat(e.target.value)} disabled={!label.trim()} />
        </Field>
        {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      </div>
    </Modal>
  );
}

export interface InviteResult {
  queued: number;
  alreadyInvited: number;
  noEmail: string[];
  deliveredByEmail: boolean;
  notFound: number;
}
export function InviteResultModal({ result: r, onClose }: { result: InviteResult | null; onClose: () => void }) {
  return (
    <Modal open={!!r} onClose={onClose} title="Invitations" size="sm" footer={<button className="adm-btn-primary" onClick={onClose}>Done</button>}>
      {r && (
        <div className="space-y-3 text-sm">
          <Alert tone={r.queued ? 'good' : 'info'} title={`${r.queued} invitation${r.queued === 1 ? '' : 's'} queued`}>
            {r.deliveredByEmail ? 'They will be emailed within a few minutes.' : 'Email is not configured, so they are logged in the outbox but not delivered. Share RSVP links or QR codes instead.'}
          </Alert>
          {r.alreadyInvited > 0 && <p className="text-adm-muted">{r.alreadyInvited} already invited earlier — use “Resend” to send again.</p>}
          {r.noEmail.length > 0 && <p className="text-amber-800">{r.noEmail.length} guest{r.noEmail.length === 1 ? ' has' : 's have'} no email address — share their link or QR code.</p>}
          {r.notFound > 0 && <p className="text-adm-muted">{r.notFound} guests no longer exist.</p>}
        </div>
      )}
    </Modal>
  );
}
