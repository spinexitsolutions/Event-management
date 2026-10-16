import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { titleCase } from '@/lib/format';
import { Input, Select, Textarea } from '@/admin/ui';
import { Field } from './common';
import { COMM_KINDS, fieldErrorsOf, isoDay, isoToLocalInput, localToIso, useStaff, type Consultation } from '../lib';

/** Log a call / note / meeting / WhatsApp / email to an inquiry or client. */
export function LogCommunicationModal({ open, onClose, path, onDone, defaultKind = 'NOTE' }: { open: boolean; onClose: () => void; path: string; onDone: () => void; defaultKind?: (typeof COMM_KINDS)[number] }) {
  const toast = useToast();
  const [f, setF] = useState({ kind: defaultKind as string, direction: defaultKind === 'NOTE' ? 'INTERNAL' : 'OUTBOUND', subject: '', body: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.post(path, f),
    onSuccess: () => {
      toast.success(f.kind === 'NOTE' ? 'Note added' : `${titleCase(f.kind)} logged`);
      setF({ kind: defaultKind, direction: defaultKind === 'NOTE' ? 'INTERNAL' : 'OUTBOUND', subject: '', body: '' });
      onDone();
      onClose();
    },
    onError: (err) => {
      setErrs(fieldErrorsOf(err));
      toast.error('Could not save', errorMessage(err));
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log activity"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" type="submit" form="log-comm" disabled={m.isPending}>
            {m.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form
        id="log-comm"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Type">
          <Select value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value, direction: e.target.value === 'NOTE' ? 'INTERNAL' : x.direction === 'INTERNAL' ? 'OUTBOUND' : x.direction }))}>
            {COMM_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'WHATSAPP' ? 'WhatsApp' : titleCase(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={f.direction} onChange={(e) => setF((x) => ({ ...x, direction: e.target.value }))}>
            <option value="OUTBOUND">Outbound (we contacted them)</option>
            <option value="INBOUND">Inbound (they contacted us)</option>
            <option value="INTERNAL">Internal</option>
          </Select>
        </Field>
        <Field label="Subject" className="sm:col-span-2" error={errs.subject}>
          <Input value={f.subject} maxLength={200} onChange={(e) => setF((x) => ({ ...x, subject: e.target.value }))} />
        </Field>
        <Field label="Details" required className="sm:col-span-2" error={errs.body}>
          <Textarea required rows={5} maxLength={5000} value={f.body} invalid={!!errs.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} />
        </Field>
      </form>
    </Modal>
  );
}

export function SendEmailModal({ open, onClose, inquiryId, to, onDone }: { open: boolean; onClose: () => void; inquiryId: string; to: string; onDone: () => void }) {
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ status: string; note?: string } | null>(null);
  const m = useMutation({
    mutationFn: () => api.post<{ status: string; note?: string }>(`/admin/inquiries/${inquiryId}/email`, { subject, message }),
    onSuccess: (r) => {
      setResult(r);
      onDone();
      if (r.status === 'SKIPPED') toast.info('Email logged but not delivered', 'No email provider is configured.');
      else toast.success(r.status === 'SENT' ? 'Email sent' : 'Email queued for delivery');
    },
    onError: (err) => toast.error('Could not send email', errorMessage(err)),
  });
  const close = () => {
    setResult(null);
    if (result) {
      setSubject('');
      setMessage('');
    }
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Send email"
      footer={
        result ? (
          <button className="adm-btn-primary" onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button className="adm-btn-secondary" onClick={close}>
              Cancel
            </button>
            <button className="adm-btn-primary" type="submit" form="send-email" disabled={m.isPending}>
              {m.isPending ? 'Sending…' : 'Send email'}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div aria-live="polite" className={result.status === 'SKIPPED' ? 'rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900' : 'rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900'}>
          {result.status === 'SKIPPED' ? (
            <>
              <p className="font-medium">Not delivered — no email provider is configured.</p>
              <p className="mt-1">The message was saved to the communication timeline, but the client has not received it. Configure SMTP or Resend in the server environment, or contact the client another way.</p>
              {result.note && <p className="mt-2 text-xs opacity-80">{result.note}</p>}
            </>
          ) : (
            <>
              <p className="font-medium">{result.status === 'SENT' ? 'Email sent.' : `Email ${result.status.toLowerCase()} for delivery.`}</p>
              <p className="mt-1">It has been logged on the communication timeline.</p>
            </>
          )}
        </div>
      ) : (
        <form
          id="send-email"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <p className="text-sm text-adm-muted">
            To <span className="font-medium text-adm-ink">{to}</span> · sent with your branded follow-up template.
          </p>
          <Field label="Subject" required>
            <Input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Message" required>
            <Textarea required rows={8} maxLength={8000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        </form>
      )}
    </Modal>
  );
}

export function ReminderModal({ open, onClose, inquiryId, onDone }: { open: boolean; onClose: () => void; inquiryId: string; onDone: () => void }) {
  const toast = useToast();
  const staff = useStaff();
  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return isoToLocalInput(d.toISOString());
  };
  const [f, setF] = useState({ dueAt: tomorrow(), note: '', userId: '' });
  const m = useMutation({
    mutationFn: () => api.post(`/admin/inquiries/${inquiryId}/reminders`, { dueAt: localToIso(f.dueAt), note: f.note, userId: f.userId || undefined }),
    onSuccess: () => {
      toast.success('Reminder set');
      setF({ dueAt: tomorrow(), note: '', userId: '' });
      onDone();
      onClose();
    },
    onError: (err) => toast.error('Could not set reminder', errorMessage(err)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set reminder"
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" type="submit" form="reminder" disabled={m.isPending}>
            {m.isPending ? 'Saving…' : 'Set reminder'}
          </button>
        </>
      }
    >
      <form
        id="reminder"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Remind at" required>
          <Input type="datetime-local" required value={f.dueAt} onChange={(e) => setF((x) => ({ ...x, dueAt: e.target.value }))} />
        </Field>
        <Field label="Note" required>
          <Input required maxLength={300} value={f.note} placeholder="e.g. Follow up on venue shortlist" onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
        </Field>
        <Field label="For">
          <Select value={f.userId} onChange={(e) => setF((x) => ({ ...x, userId: e.target.value }))}>
            <option value="">Me</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

/** Schedule a new consultation, or update / complete an existing one. */
export function ConsultationModal({ open, onClose, inquiryId, existing, onDone }: { open: boolean; onClose: () => void; inquiryId: string; existing?: Consultation | null; onDone: () => void }) {
  const toast = useToast();
  const staff = useStaff();
  const init = () => {
    if (existing) return { scheduledAt: isoToLocalInput(existing.scheduledAt), durationMin: String(existing.durationMin), mode: existing.mode as string, location: existing.location, agenda: existing.agenda, ownerId: '', status: existing.status as string, outcome: existing.outcome };
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(11, 0, 0, 0);
    return { scheduledAt: `${isoDay(d)}T11:00`, durationMin: '60', mode: 'VIDEO', location: '', agenda: '', ownerId: '', status: 'SCHEDULED', outcome: '' };
  };
  const [f, setF] = useState(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${existing?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) setF(init());
  }
  const m = useMutation({
    mutationFn: () => {
      const base = { scheduledAt: localToIso(f.scheduledAt), durationMin: Number(f.durationMin), mode: f.mode, location: f.location, agenda: f.agenda, ...(f.ownerId ? { ownerId: f.ownerId } : {}) };
      return existing ? api.patch(`/admin/inquiries/consultations/${existing.id}`, { ...base, status: f.status, outcome: f.outcome }) : api.post(`/admin/inquiries/${inquiryId}/consultations`, base);
    },
    onSuccess: () => {
      toast.success(existing ? 'Consultation updated' : 'Consultation scheduled');
      onDone();
      onClose();
    },
    onError: (err) => {
      setErrs(fieldErrorsOf(err));
      toast.error('Could not save consultation', errorMessage(err));
    },
  });
  const set = (k: keyof ReturnType<typeof init>) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Update consultation' : 'Schedule consultation'}
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" type="submit" form="consultation" disabled={m.isPending}>
            {m.isPending ? 'Saving…' : existing ? 'Save changes' : 'Schedule'}
          </button>
        </>
      }
    >
      <form
        id="consultation"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Date & time" required error={errs.scheduledAt}>
          <Input type="datetime-local" required value={f.scheduledAt} onChange={set('scheduledAt')} />
        </Field>
        <Field label="Duration" error={errs.durationMin}>
          <Select value={f.durationMin} onChange={set('durationMin')}>
            {[15, 30, 45, 60, 90, 120, 180].map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} min` : `${n / 60} h`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mode">
          <Select value={f.mode} onChange={set('mode')}>
            <option value="VIDEO">Video call</option>
            <option value="PHONE">Phone</option>
            <option value="IN_PERSON">In person</option>
          </Select>
        </Field>
        <Field label="Planner">
          <Select value={f.ownerId} onChange={set('ownerId')}>
            <option value="">{existing ? (existing.owner?.name ?? 'Unchanged') : 'Me'}</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={f.mode === 'IN_PERSON' ? 'Address' : 'Meeting link / number'} className="sm:col-span-2">
          <Input value={f.location} maxLength={300} onChange={set('location')} />
        </Field>
        <Field label="Agenda" className="sm:col-span-2">
          <Textarea rows={3} maxLength={2000} value={f.agenda} onChange={set('agenda')} />
        </Field>
        {existing && (
          <>
            <Field label="Status">
              <Select value={f.status} onChange={set('status')}>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="NO_SHOW">No-show</option>
              </Select>
            </Field>
            <Field label="Outcome" className="sm:col-span-2" hint={f.status === 'COMPLETED' ? 'Completing moves an early-stage inquiry to “Requirements received”.' : undefined}>
              <Textarea rows={4} maxLength={3000} value={f.outcome} onChange={set('outcome')} placeholder="Decisions, requirements captured, next steps…" />
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}
