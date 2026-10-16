import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, UploadCloud, XCircle } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ACCEPT_MEDIA, uploadWithProgress } from '../lib/media';
import type { MediaAsset } from '../lib/types';
import { formatBytes } from '../lib/util';

interface Item {
  key: string;
  name: string;
  size: number;
  progress: number;
  state: 'queued' | 'uploading' | 'done' | 'error';
  message?: string;
  asset?: MediaAsset;
}

/**
 * Drag-and-drop multi-file uploader: one request per file so each shows its own progress and error.
 * Calls `onUploaded` with every successfully created asset.
 */
export function Uploader({ folder, accept = ACCEPT_MEDIA, onUploaded, compact, multiple = true }: { folder: string; accept?: string; onUploaded?: (assets: MediaAsset[]) => void; compact?: boolean; multiple?: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const start = async (files: File[]) => {
    if (!files.length) return;
    const queued: Item[] = files.map((f, i) => ({ key: `${Date.now()}_${i}_${f.name}`, name: f.name, size: f.size, progress: 0, state: 'queued' }));
    setItems((xs) => [...queued, ...xs].slice(0, 30));
    const created: MediaAsset[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const i = cursor++;
        const it = queued[i];
        patch(it.key, { state: 'uploading' });
        const form = new FormData();
        form.append('folder', folder || 'General');
        form.append('files', files[i]);
        try {
          const r = await uploadWithProgress('/admin/media', form, (p) => patch(it.key, { progress: p }));
          const err = r.meta?.errors?.[0];
          if (r.data[0]) {
            created.push(r.data[0]);
            patch(it.key, { state: 'done', progress: 1, asset: r.data[0] });
          } else patch(it.key, { state: 'error', message: err?.message ?? 'Upload failed' });
        } catch (e) {
          patch(it.key, { state: 'error', message: errorMessage(e) });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    void qc.invalidateQueries({ queryKey: ['cms-media'] });
    if (created.length) onUploaded?.(created);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    void start(multiple ? files : files.slice(0, 1));
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn('flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition', compact ? 'px-4 py-6' : 'px-6 py-10', over ? 'border-adm-gold bg-[#FBF7EE]' : 'border-adm-line bg-adm-bg/40')}
      >
        <UploadCloud className="h-7 w-7 text-adm-gold" strokeWidth={1.5} />
        <p className="mt-2 text-sm font-medium">Drag &amp; drop {multiple ? 'files' : 'a file'} here</p>
        <p className="mt-0.5 text-xs text-adm-muted">JPG, PNG, WebP, AVIF, GIF, SVG or MP4/WebM video. Images are optimised automatically.</p>
        <button type="button" className="adm-btn-secondary mt-3" onClick={() => input.current?.click()}>
          Choose {multiple ? 'files' : 'a file'}
        </button>
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void start([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="rounded-lg border border-adm-line bg-white px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                {it.state === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : it.state === 'error' ? <XCircle className="h-4 w-4 shrink-0 text-red-600" /> : <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-adm-gold border-t-transparent" />}
                <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
                <span className="text-adm-muted">{formatBytes(it.size)}</span>
                {it.state === 'uploading' && <span className="w-9 text-right tabular-nums text-adm-muted">{Math.round(it.progress * 100)}%</span>}
              </div>
              {(it.state === 'uploading' || it.state === 'queued') && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-adm-bg" role="progressbar" aria-valuenow={Math.round(it.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${it.name}`}>
                  <div className="h-full bg-adm-gold transition-all" style={{ width: `${Math.max(3, it.progress * 100)}%` }} />
                </div>
              )}
              {it.state === 'error' && <p className="mt-1 text-red-600">{it.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
