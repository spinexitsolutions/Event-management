import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, ImageIcon, UploadCloud, X } from 'lucide-react';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { api, ensureCsrf } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, titleCase } from '@/lib/format';
import { Notice } from '@/auth/ui';
import type { BookingDetail } from '../types';
import { Panel, SectionHead, Tag } from '../ui';

const MAX = 15 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';
const okType = (f: File) => f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** multipart upload with progress (fetch has no upload progress), same CSRF + cookie rules as the api client. */
async function uploadWithProgress(url: string, form: FormData, onProgress: (p: number) => void): Promise<void> {
  const token = await ensureCsrf();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', token);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status})`;
      try {
        msg = JSON.parse(xhr.responseText)?.error?.message ?? msg;
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status === 413) msg = 'That file is too large. Files must be 15 MB or smaller.';
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('Network error — check your connection and try again.'));
    xhr.send(form);
  });
}

export default function DocumentsTab({ booking: b }: { booking: BookingDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const shared = b.documents.filter((d) => !d.uploadedByClient);
  const mine = b.documents.filter((d) => d.uploadedByClient);

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!okType(f)) return setError('Please choose a PDF or an image (JPG, PNG, WebP).');
    if (f.size > MAX) return setError(`That file is ${size(f.size)}. Files must be 15 MB or smaller.`);
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 200));
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError('Choose a file to upload.');
    const form = new FormData();
    form.append('name', name.trim() || file.name);
    form.append('file', file);
    setProgress(0);
    setError(null);
    try {
      await uploadWithProgress(api.url(`/portal/bookings/${b.id}/documents`), form, setProgress);
      toast.success('Document uploaded', 'Your event manager has been notified.');
      setFile(null);
      setName('');
      if (input.current) input.current.value = '';
      await qc.invalidateQueries({ queryKey: ['portal', 'booking', b.id] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const list = (docs: BookingDetail['documents'], empty: string) =>
    docs.length ? (
      <Panel as="div" className="divide-y divide-line">
        {docs.map((d) => (
          <a key={d.id} href={api.url(`/portal/bookings/${b.id}/documents/${d.id}`)} download className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-2/60">
            <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-ink">{d.name}</p>
              <p className="text-xs text-muted">{fmtDate(d.createdAt)}</p>
            </div>
            {d.kind !== 'OTHER' && <Tag className="hidden sm:inline-flex">{titleCase(d.kind)}</Tag>}
            <Download className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-primary" aria-label={`Download ${d.name}`} />
          </a>
        ))}
      </Panel>
    ) : (
      <Panel className="p-8 text-center text-sm text-muted">{empty}</Panel>
    );

  return (
    <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
      <div className="min-w-0 space-y-14">
        <section aria-labelledby="shared-h">
          <SectionHead eyebrow="From your team" title="Shared documents" id="shared-h" />
          {list(shared, 'Agreements, plans and other documents shared by your team will appear here.')}
        </section>
        <section aria-labelledby="mine-h">
          <SectionHead eyebrow="From you" title="Your uploads" id="mine-h" />
          {list(mine, 'Nothing uploaded yet.')}
        </section>
      </div>

      <aside>
        <Panel className="p-6 sm:p-8 lg:sticky lg:top-8">
          <p className="eyebrow">Upload</p>
          <h2 className="t-h4 mt-2 font-heading">Share requirements or files</h2>
          <p className="mt-2 text-sm text-muted">Guest lists, inspiration, floor plans, signed forms — PDF or images up to 15 MB.</p>
          <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={cn('flex cursor-pointer flex-col items-center justify-center border border-dashed px-4 py-8 text-center transition-colors focus-within:border-primary', drag ? 'border-primary bg-primary/[0.06]' : 'border-line hover:border-primary/60')}
              style={{ borderRadius: 'var(--radius)' }}
            >
              <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-describedby="upload-help" />
              {file ? (
                <span className="flex w-full items-center gap-3 text-left">
                  {file.type.startsWith('image/') ? <ImageIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden /> : <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{file.name}</span>
                    <span className="text-xs text-muted">{size(file.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      if (input.current) input.current.value = '';
                    }}
                    className="p-1 text-muted hover:text-ink"
                    aria-label="Remove selected file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ) : (
                <>
                  <UploadCloud className="h-7 w-7 text-primary" aria-hidden />
                  <span className="mt-3 text-sm text-ink">Drop a file or browse</span>
                  <span id="upload-help" className="mt-1 text-xs text-muted">
                    PDF, JPG, PNG or WebP · max 15 MB
                  </span>
                </>
              )}
            </label>
            <div>
              <label htmlFor="doc-name" className="field-label">
                Document name
              </label>
              <input id="doc-name" className="field-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="e.g. Final guest list" />
            </div>
            {progress !== null && (
              <div aria-live="polite">
                <div className="h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted">{progress < 100 ? `Uploading… ${progress}%` : 'Processing…'}</p>
              </div>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" className="w-full" loading={progress !== null} disabled={!file}>
              Upload
            </Button>
          </form>
        </Panel>
      </aside>
    </div>
  );
}
