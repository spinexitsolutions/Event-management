import { useMutation } from '@tanstack/react-query';
import { ExternalLink, FolderOpen, Trash2, Upload, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Badge, ConfirmDialog, Field, Input, Select, Toggle } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { BookingDocument } from '../types';
import { openFile, useRefreshBooking } from '../shared/hooks';
import { Alert, DocIcon, SectionEmpty } from '../shared/ui';

const KINDS = [
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'SIGNED_CONTRACT', label: 'Signed contract' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'PLAN', label: 'Plan / run sheet' },
  { value: 'OTHER', label: 'Other' },
];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;

export default function DocumentsTab({ booking: b }: TabProps) {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshBooking(b.id);
  const manage = can('bookings.manage');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<BookingDocument | null>(null);
  const toggle = useMutation({
    mutationFn: (d: BookingDocument) => api.patch(`/admin/bookings/documents/${d.id}`, { visibleToClient: !d.visibleToClient }),
    onSuccess: (_r, d) => {
      toast.success(d.visibleToClient ? 'Hidden from client' : 'Shared with client');
      refresh();
    },
    onError: (err) => toast.error('Not updated', errorMessage(err)),
  });
  const del = useMutation({
    mutationFn: (d: BookingDocument) => api.delete(`/admin/bookings/documents/${d.id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error('Could not delete', errorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-adm-muted">Contracts, plans and files for this event. Only documents marked “shared” appear in the client portal.</p>
        {manage && (
          <button className="adm-btn-primary" onClick={() => setUploading(true)}>
            <Upload className="h-4 w-4" /> Upload document
          </button>
        )}
      </div>
      {b.documents.length === 0 ? (
        <div className="adm-card">
          <SectionEmpty icon={<FolderOpen className="h-5 w-5" />} title="No documents yet" body="Upload the contract, signed copy, run sheet or floor plans. Uploading a signed contract records the signature automatically." action={manage ? <button className="adm-btn-primary" onClick={() => setUploading(true)}>Upload document</button> : undefined} />
        </div>
      ) : (
        <ul className="adm-card divide-y divide-adm-line">
          {b.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adm-bg">
                <DocIcon name={d.name} kind={d.kind} />
              </div>
              <div className="min-w-0 flex-1">
                <button className="block max-w-full truncate text-left font-medium hover:text-adm-gold" onClick={() => openFile(`/admin/bookings/documents/${d.id}/file`)}>
                  {d.name}
                </button>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-adm-muted">
                  <span>{kindLabel(d.kind)}</span>
                  <span>· {fmtDateTime(d.createdAt)}</span>
                  {d.uploadedByClient && (
                    <Badge tone="violet">
                      <UserRound className="mr-1 h-3 w-3" /> From client
                    </Badge>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {manage ? <Toggle checked={d.visibleToClient} onChange={() => toggle.mutate(d)} disabled={toggle.isPending} label={<span className="text-xs text-adm-muted">Shared</span>} /> : d.visibleToClient && <Badge tone="green">Shared</Badge>}
                <button className="adm-btn-ghost !px-2 !py-1" onClick={() => openFile(`/admin/bookings/documents/${d.id}/file`)} aria-label={`Open ${d.name}`}>
                  <ExternalLink className="h-4 w-4" />
                </button>
                {manage && (
                  <button className="adm-btn-ghost !px-2 !py-1 text-red-700" onClick={() => setDeleting(d)} aria-label={`Delete ${d.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <UploadModal open={uploading} onClose={() => setUploading(false)} bookingId={b.id} onDone={refresh} />
      <ConfirmDialog open={!!deleting} title="Delete document?" body={`“${deleting?.name}” will be removed from this booking${deleting?.visibleToClient ? ' and the client portal' : ''}.`} confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => deleting && del.mutate(deleting)} onClose={() => setDeleting(null)} />
    </div>
  );
}

function UploadModal({ open, onClose, bookingId, onDone }: { open: boolean; onClose: () => void; bookingId: string; onDone: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState('OTHER');
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      setFile(null);
      setKind('OTHER');
      setName('');
      setVisible(false);
    }
  }, [open]);
  const up = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!);
      fd.append('kind', kind);
      fd.append('name', name.trim() || file!.name);
      fd.append('visibleToClient', String(visible));
      return api.upload(`/admin/bookings/${bookingId}/documents`, fd);
    },
    onSuccess: () => {
      toast.success('Document uploaded', kind === 'SIGNED_CONTRACT' ? 'The contract signature has been recorded.' : undefined);
      onDone();
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={!file || up.isPending} onClick={() => up.mutate()}>
            {up.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="File" required hint="PDF, Word, spreadsheets or images.">
          <input
            ref={fileRef}
            type="file"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-adm-line file:bg-white file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
            }}
          />
        </Field>
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS} />
        </Field>
        <Field label="Display name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </Field>
        <Toggle checked={visible} onChange={setVisible} label="Share with client (visible in their portal, they are notified)" />
        {kind === 'SIGNED_CONTRACT' && <Alert tone="info">Uploading a signed contract records the signature and moves the booking to “Awaiting advance” if it was awaiting the contract.</Alert>}
        {up.isError && <Alert tone="error">{errorMessage(up.error)}</Alert>}
      </div>
    </Modal>
  );
}
