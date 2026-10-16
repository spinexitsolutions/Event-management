import { useMutation } from '@tanstack/react-query';
import { CalendarClock, Inbox } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Field, StatusBadge, Textarea, Toggle } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { ChangeRequest } from '../types';
import { dateOnly, isConflict, useRefreshBooking } from '../shared/hooks';
import { Alert, SectionEmpty } from '../shared/ui';

const TYPE_LABEL: Record<string, string> = { CHANGE: 'Change request', SPECIAL_REQUEST: 'Special request', RESCHEDULE: 'Reschedule', CANCELLATION: 'Cancellation request' };

export default function RequestsTab({ booking: b }: TabProps) {
  const { can } = useAuth();
  const [deciding, setDeciding] = useState<{ cr: ChangeRequest; decision: 'APPROVED' | 'DECLINED' } | null>(null);
  const manage = can('bookings.manage');
  const open = b.changeRequests.filter((c) => c.status === 'OPEN');
  const closed = b.changeRequests.filter((c) => c.status !== 'OPEN');

  if (!b.changeRequests.length)
    return (
      <div className="adm-card">
        <SectionEmpty icon={<Inbox className="h-5 w-5" />} title="No requests from the client" body="Change, reschedule and cancellation requests the client submits from their portal appear here for approval." />
      </div>
    );

  const Item = ({ cr }: { cr: ChangeRequest }) => (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{TYPE_LABEL[cr.type] ?? cr.type}</span>
            <StatusBadge status={cr.status} />
            <span className="text-xs text-adm-muted">{fmtDateTime(cr.createdAt)}</span>
          </div>
          {cr.requestedDate && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-adm-bg px-2 py-1 text-sm">
              <CalendarClock className="h-4 w-4 text-adm-gold" /> {fmtDate(b.eventDate)} → <strong>{fmtDate(dateOnly(cr.requestedDate))}</strong>
            </p>
          )}
          <p className="mt-2 whitespace-pre-line text-sm">{cr.message}</p>
          {cr.status !== 'OPEN' && (cr.resolutionNote || cr.resolvedAt) && (
            <p className="mt-2 border-l-2 border-adm-line pl-3 text-xs text-adm-muted">
              {cr.resolvedAt ? `Resolved ${fmtDateTime(cr.resolvedAt)}` : ''}
              {cr.resolutionNote ? ` — ${cr.resolutionNote}` : ''}
            </p>
          )}
        </div>
        {manage && cr.status === 'OPEN' && (
          <div className="flex gap-2">
            <button className="adm-btn-secondary !py-1.5" onClick={() => setDeciding({ cr, decision: 'DECLINED' })}>
              Decline
            </button>
            <button className="adm-btn-primary !py-1.5" onClick={() => setDeciding({ cr, decision: 'APPROVED' })}>
              Approve
            </button>
          </div>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Awaiting decision ({open.length})</h2>
          <ul className="adm-card divide-y divide-adm-line">
            {open.map((cr) => (
              <Item key={cr.id} cr={cr} />
            ))}
          </ul>
        </section>
      )}
      {closed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-adm-muted">Resolved</h2>
          <ul className="adm-card divide-y divide-adm-line">
            {closed.map((cr) => (
              <Item key={cr.id} cr={cr} />
            ))}
          </ul>
        </section>
      )}
      <DecisionModal booking={b} state={deciding} onClose={() => setDeciding(null)} />
    </div>
  );
}

function DecisionModal({ booking: b, state, onClose }: TabProps & { state: { cr: ChangeRequest; decision: 'APPROVED' | 'DECLINED' } | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshBooking(b.id);
  const [note, setNote] = useState('');
  const [applyDate, setApplyDate] = useState(true);
  const [conflict, setConflict] = useState<string | null>(null);
  useEffect(() => {
    if (state) {
      setNote('');
      setApplyDate(true);
      setConflict(null);
    }
  }, [state]);
  const save = useMutation({
    mutationFn: () => api.post(`/admin/bookings/change-requests/${state!.cr.id}/resolve`, { decision: state!.decision, note: note.trim(), applyNewDate: applyDate }),
    onSuccess: () => {
      toast.success(state!.decision === 'APPROVED' ? 'Request approved' : 'Request declined', 'The client has been notified.');
      refresh();
      onClose();
    },
    onError: (err) => setConflict(errorMessage(err)),
  });
  const cr = state?.cr;
  const approving = state?.decision === 'APPROVED';
  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={approving ? 'Approve request' : 'Decline request'}
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className={approving ? 'adm-btn-primary' : 'adm-btn-danger'} disabled={save.isPending || (!approving && note.trim().length < 3)} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : approving ? 'Approve' : 'Decline'}
          </button>
        </>
      }
    >
      {cr && (
        <div className="space-y-4">
          <p className="rounded-lg bg-adm-bg px-3 py-2 text-sm">{cr.message}</p>
          {approving && cr.type === 'RESCHEDULE' && cr.requestedDate && (
            <Toggle checked={applyDate} onChange={setApplyDate} label={`Move the event to ${fmtDate(dateOnly(cr.requestedDate))} (venue availability is checked)`} />
          )}
          {approving && cr.type === 'CANCELLATION' && <Alert tone="info">Approving acknowledges the request. Cancel the booking itself from “More → Cancel booking”, where the refund policy is shown.</Alert>}
          {approving && cr.type === 'CHANGE' && <Alert tone="info">If the change affects the price, update the contract value in the Finance tab.</Alert>}
          <Field label={approving ? 'Note to client (optional)' : 'Reason (sent to client)'} required={!approving}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          {conflict && (
            <Alert tone="error" title={isConflict(save.error) ? 'Could not apply' : undefined}>
              {conflict}
              {isConflict(save.error) && cr.type === 'RESCHEDULE' && ' — choose another date with the client, or approve without moving the date.'}
            </Alert>
          )}
        </div>
      )}
    </Modal>
  );
}
