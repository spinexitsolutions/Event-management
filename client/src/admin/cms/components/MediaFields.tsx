import { Film, ImagePlus, Plus, Replace, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Input } from '@/admin/ui';
import { cn } from '@/lib/cn';
import { isVideoUrl, youTubeOrVimeo } from '../lib/media';
import { isHttpsOrLocal, moveItem } from '../lib/util';
import { Thumb } from './bits';
import { MediaPicker } from './MediaPicker';
import { SortableList } from './Sortable';

/** Image chooser: thumbnail + Choose/Replace/Remove, optional alt text input underneath. */
export function ImageField({
  value,
  onChange,
  alt,
  onAltChange,
  invalid,
  aspect = 'aspect-[16/9]',
  label = 'image',
}: {
  value: string;
  onChange: (url: string, alt?: string) => void;
  alt?: string;
  onAltChange?: (alt: string) => void;
  invalid?: boolean;
  aspect?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const bad = !!value && !isHttpsOrLocal(value);
  return (
    <div>
      <div className={cn('flex gap-3 rounded-lg border bg-white p-2', invalid || bad ? 'border-red-400' : 'border-adm-line')}>
        <button type="button" onClick={() => setOpen(true)} className={cn('relative w-28 shrink-0 overflow-hidden rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-adm-gold', aspect)} aria-label={value ? `Replace ${label}` : `Choose ${label}`}>
          <Thumb src={value} alt={alt ?? ''} className="absolute inset-0" width={300} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <p className="truncate text-xs text-adm-muted" title={value}>
            {value ? value.replace(/^https?:\/\//, '').slice(0, 80) : 'No image selected'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="adm-btn-secondary px-2.5 py-1 text-xs" onClick={() => setOpen(true)}>
              {value ? <Replace className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {value ? 'Replace' : 'Choose image'}
            </button>
            {value && (
              <button type="button" className="adm-btn-ghost px-2 py-1 text-xs hover:text-red-600" onClick={() => onChange('')}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          {bad && <p className="text-xs text-red-600">Use an uploaded file or an https link.</p>}
        </div>
      </div>
      {onAltChange && value && (
        <div className="mt-2">
          <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-adm-muted">
            <span>
              Alt text <span className="font-normal">(describe the image for screen readers & SEO)</span>
            </span>
            {!alt && <span className="text-amber-700">Recommended</span>}
          </label>
          <Input value={alt ?? ''} onChange={(e) => onAltChange(e.target.value)} maxLength={200} placeholder="e.g. Bride and groom under a floral mandap at sunset" />
        </div>
      )}
      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={([m]) => {
          onChange(m.url, m.alt);
          if (onAltChange && m.alt && !alt) onAltChange(m.alt);
        }}
      />
    </div>
  );
}

/** Video chooser: uploaded/library video, or an https / YouTube / Vimeo URL. */
export function VideoField({ value, onChange, allowEmbeds = true, invalid }: { value: string; onChange: (v: string) => void; allowEmbeds?: boolean; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const bad = !!value && (!isHttpsOrLocal(value) || (!allowEmbeds && youTubeOrVimeo(value)));
  const kindLabel = !value ? '' : youTubeOrVimeo(value) ? (value.includes('vimeo') ? 'Vimeo' : 'YouTube') : isVideoUrl(value) || value.startsWith('/uploads/') ? 'Video file' : 'Link';
  return (
    <div>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Film className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-muted" />
          <Input className="pl-9" value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={allowEmbeds ? 'https://youtu.be/… or choose a file' : 'https://…/film.mp4 or choose a file'} invalid={invalid || bad} />
        </div>
        <button type="button" className="adm-btn-secondary px-2.5 text-xs" onClick={() => setOpen(true)}>
          Library
        </button>
        {value && (
          <button type="button" className="adm-btn-ghost px-2 text-xs" onClick={() => onChange('')} aria-label="Remove video">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className={cn('mt-1 text-xs', bad ? 'text-red-600' : 'text-adm-muted')}>
        {bad ? (allowEmbeds ? 'Use an uploaded video or an https link.' : 'Use an uploaded MP4/WebM or a direct https video link (no YouTube here).') : value ? `${kindLabel} · Only use footage you are licensed to publish.` : 'Only use footage you are licensed to publish.'}
      </p>
      <MediaPicker open={open} kind="VIDEO" allowExternalVideo={allowEmbeds} onClose={() => setOpen(false)} onPick={([m]) => onChange(m.url)} />
    </div>
  );
}

export interface GalleryImage {
  url: string;
  alt: string;
  caption: string;
}

let gseq = 0;
/** Gallery editor: add many images at once, drag to reorder, alt text + caption per image. */
export function GalleryEditor({ value, onChange, max = 40, error }: { value: GalleryImage[]; onChange: (v: GalleryImage[]) => void; max?: number; error?: string }) {
  const list = Array.isArray(value) ? value : [];
  const ids = useRef<string[]>([]);
  while (ids.current.length < list.length) ids.current.push(`g${++gseq}`);
  if (ids.current.length > list.length) ids.current = ids.current.slice(0, list.length);
  const [open, setOpen] = useState(false);
  const missingAlt = list.filter((i) => !i.alt).length;
  return (
    <div>
      {list.length === 0 ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full flex-col items-center rounded-lg border border-dashed border-adm-line px-4 py-6 text-center text-xs text-adm-muted hover:border-adm-gold hover:text-adm-ink">
          <ImagePlus className="mb-1.5 h-5 w-5" /> Add images to the gallery
        </button>
      ) : (
        <SortableList
          ids={ids.current}
          onMove={(from, to) => {
            ids.current = moveItem(ids.current, from, to);
            onChange(moveItem(list, from, to));
          }}
          className="space-y-2"
        >
          {(_id, i, { handle }) => {
            const img = list[i];
            const set = (p: Partial<GalleryImage>) => onChange(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <div className="flex gap-2 rounded-lg border border-adm-line bg-white p-2">
                <div className="flex flex-col items-center gap-1">
                  {handle}
                  <span className="text-[10px] tabular-nums text-adm-muted">{i + 1}</span>
                </div>
                <Thumb src={img.url} alt={img.alt} className="h-[72px] w-24 shrink-0 rounded-md" width={300} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input className="py-1 text-xs" value={img.alt ?? ''} onChange={(e) => set({ alt: e.target.value })} placeholder="Alt text (describe the image)" maxLength={200} aria-label={`Alt text for image ${i + 1}`} invalid={!img.alt} />
                  <Input className="py-1 text-xs" value={img.caption ?? ''} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption (optional)" maxLength={200} aria-label={`Caption for image ${i + 1}`} />
                </div>
                <button
                  type="button"
                  className="self-start rounded p-1 text-adm-muted hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    ids.current = ids.current.filter((_, j) => j !== i);
                    onChange(list.filter((_, j) => j !== i));
                  }}
                  aria-label={`Remove image ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          }}
        </SortableList>
      )}
      <div className="mt-2 flex items-center justify-between">
        {list.length > 0 && list.length < max ? (
          <button type="button" className="adm-btn-ghost -ml-2 px-2 py-1 text-xs text-adm-gold" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add images
          </button>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-adm-muted">
          {missingAlt > 0 && <span className="mr-2 text-amber-700">{missingAlt} without alt text</span>}
          {list.length}/{max}
        </span>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <MediaPicker open={open} multiple onClose={() => setOpen(false)} onPick={(items) => onChange([...list, ...items.map((m) => ({ url: m.url, alt: m.alt ?? '', caption: m.caption ?? '' }))].slice(0, max))} />
    </div>
  );
}
