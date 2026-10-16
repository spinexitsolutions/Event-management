import { useQueryClient } from '@tanstack/react-query';
import { Check, Film, ImagePlus, Link2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Field, Input, Pagination, SearchInput, Select, Tabs, Toggle } from '@/admin/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ACCEPT_IMAGES, ACCEPT_MEDIA, ACCEPT_VIDEOS, useMediaList, youTubeOrVimeo } from '../lib/media';
import type { MediaAsset } from '../lib/types';
import { isHttpsOrLocal } from '../lib/util';
import { Callout, Thumb } from './bits';
import { Uploader } from './Uploader';

export interface PickedMedia {
  url: string;
  alt: string;
  caption?: string;
  kind: 'IMAGE' | 'VIDEO';
}

type Tab = 'library' | 'upload' | 'link';

/**
 * Reusable media chooser: browse the library, upload new files, or paste an https URL
 * (optionally registering it in the library with its licence credit).
 */
export function MediaPicker({ open, onClose, onPick, kind = 'IMAGE', multiple, title, allowExternalVideo }: { open: boolean; onClose: () => void; onPick: (items: PickedMedia[]) => void; kind?: 'IMAGE' | 'VIDEO' | 'ANY'; multiple?: boolean; title?: string; allowExternalVideo?: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('library');
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MediaAsset[]>([]);
  const [uploadFolder, setUploadFolder] = useState('General');
  const [link, setLink] = useState({ url: '', alt: '', credit: '', save: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected([]);
      setTab('library');
      setLink({ url: '', alt: '', credit: '', save: true });
    }
  }, [open]);

  const list = useMediaList({ q, folder, page, limit: 24, kind: kind === 'ANY' ? '' : kind }, open);
  const folders = list.data?.meta.folders ?? [];

  const toggle = (m: MediaAsset) => {
    if (!multiple) return setSelected([m]);
    setSelected((s) => (s.some((x) => x.id === m.id) ? s.filter((x) => x.id !== m.id) : [...s, m]));
  };
  const finish = (assets: MediaAsset[]) => {
    if (!assets.length) return;
    onPick(assets.map((a) => ({ url: a.url, alt: a.alt, caption: a.caption, kind: a.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE' })));
    onClose();
  };

  const linkKind: 'IMAGE' | 'VIDEO' = kind === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const linkValid = /^https:\/\//i.test(link.url) && isHttpsOrLocal(link.url);
  const isEmbed = youTubeOrVimeo(link.url);
  const useLink = async () => {
    if (!linkValid) return;
    if (link.save && !isEmbed) {
      setBusy(true);
      try {
        await api.post('/admin/media/external', { url: link.url, alt: link.alt, credit: link.credit, kind: linkKind, folder: uploadFolder || 'General' });
        void qc.invalidateQueries({ queryKey: ['cms-media'] });
      } catch (e) {
        toast.error('Could not add to the library', errorMessage(e));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    onPick([{ url: link.url, alt: link.alt, kind: linkKind }]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title ?? (kind === 'VIDEO' ? 'Choose a video' : multiple ? 'Choose images' : 'Choose an image')}
      footer={
        tab === 'library' ? (
          <>
            <span className="mr-auto text-xs text-adm-muted">{selected.length ? `${selected.length} selected` : multiple ? 'Select one or more files' : 'Select a file'}</span>
            <button className="adm-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="adm-btn-primary" disabled={!selected.length} onClick={() => finish(selected)}>
              {multiple ? `Use ${selected.length || ''} selected` : 'Use this file'}
            </button>
          </>
        ) : tab === 'link' ? (
          <>
            <button className="adm-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="adm-btn-primary" disabled={!linkValid || busy} onClick={useLink}>
              {busy ? 'Adding…' : 'Use this URL'}
            </button>
          </>
        ) : undefined
      }
    >
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'library', label: 'Media library' },
          { value: 'upload', label: 'Upload' },
          { value: 'link', label: 'Paste a link' },
        ]}
      />
      {tab === 'library' && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchInput
              className="min-w-[200px] flex-1"
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search by file name, alt text or tag"
            />
            <Select
              className="w-48"
              aria-label="Folder"
              value={folder}
              onChange={(e) => {
                setFolder(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.count})
                </option>
              ))}
            </Select>
          </div>
          {list.isLoading ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-lg bg-adm-bg" />
              ))}
            </div>
          ) : list.isError ? (
            <Callout tone="danger">{errorMessage(list.error)}</Callout>
          ) : !list.data?.items.length ? (
            <div className="rounded-xl border border-dashed border-adm-line px-6 py-12 text-center">
              <ImagePlus className="mx-auto h-7 w-7 text-adm-muted" strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium">{q || folder ? 'No files match your filters' : 'Your library is empty'}</p>
              <p className="mt-1 text-xs text-adm-muted">Upload files or paste a link to an image you are licensed to use.</p>
              <button className="adm-btn-secondary mt-4" onClick={() => setTab('upload')}>
                Upload files
              </button>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" role="listbox" aria-multiselectable={multiple || undefined} aria-label="Media files">
                {list.data.items.map((m) => {
                  const on = selected.some((s) => s.id === m.id);
                  return (
                    <li key={m.id} role="option" aria-selected={on}>
                      <button
                        type="button"
                        onClick={() => toggle(m)}
                        onDoubleClick={() => finish([m])}
                        className={cn('group relative block w-full overflow-hidden rounded-lg text-left ring-2 ring-offset-2 transition focus-visible:outline-none', on ? 'ring-adm-gold' : 'ring-transparent hover:ring-adm-line focus-visible:ring-adm-gold/60')}
                        title={m.filename}
                      >
                        <Thumb src={m.url} alt={m.alt} kind={m.kind} className="aspect-square w-full rounded-lg" width={300} />
                        {on && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-adm-gold text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        {m.kind === 'VIDEO' && <Film className="absolute bottom-1.5 left-1.5 h-4 w-4 text-white drop-shadow" />}
                        <span className="mt-1 block truncate text-[11px] text-adm-muted">{m.filename}</span>
                        {!m.alt && m.kind === 'IMAGE' && <span className="block text-[10px] text-amber-700">No alt text</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pagination page={page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={setPage} />
            </>
          )}
        </div>
      )}
      {tab === 'upload' && (
        <div className="space-y-4">
          <Field label="Upload into folder" hint="Folders keep the library tidy, e.g. Weddings, Corporate, Logos.">
            <Input value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} maxLength={80} list="cms-media-folders" />
            <datalist id="cms-media-folders">
              {folders.map((f) => (
                <option key={f.name} value={f.name} />
              ))}
            </datalist>
          </Field>
          <Uploader
            folder={uploadFolder}
            multiple={multiple}
            accept={kind === 'IMAGE' ? ACCEPT_IMAGES : kind === 'VIDEO' ? ACCEPT_VIDEOS : ACCEPT_MEDIA}
            onUploaded={(assets) => {
              if (!multiple && assets[0]) finish([assets[0]]);
              else {
                setSelected((s) => [...s, ...assets]);
                setTab('library');
                toast.success(`${assets.length} file${assets.length > 1 ? 's' : ''} uploaded`, 'They are selected — review and click “Use selected”.');
              }
            }}
          />
          <p className="text-xs text-adm-muted">Remember to add alt text in the media library — it describes the image for screen readers and search engines.</p>
        </div>
      )}
      {tab === 'link' && (
        <div className="space-y-4">
          <Field label={kind === 'VIDEO' ? 'Video URL' : 'Image URL'} required error={link.url && !linkValid ? 'Use a secure https:// link' : undefined} hint={kind === 'VIDEO' ? 'A direct .mp4/.webm https link' + (allowExternalVideo ? ', or a YouTube / Vimeo link.' : '.') : 'For example a photo from Unsplash or Pexels (use the direct image link).'}>
            <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value.trim() })} placeholder="https://images.unsplash.com/photo-…" invalid={!!link.url && !linkValid} />
          </Field>
          {kind !== 'VIDEO' && (
            <Field label="Alt text" hint="Describe what the image shows (e.g. “Candle-lit reception tables in a garden”).">
              <Input value={link.alt} onChange={(e) => setLink({ ...link, alt: e.target.value })} maxLength={200} />
            </Field>
          )}
          {!isEmbed && (
            <>
              <Toggle checked={link.save} onChange={(v) => setLink({ ...link, save: v })} label="Also save this link in the media library" />
              {link.save && (
                <Field label="Credit / licence" hint="e.g. “Photo by Jane Doe on Unsplash (Unsplash Licence)”. Only use images you are licensed to publish.">
                  <Input value={link.credit} onChange={(e) => setLink({ ...link, credit: e.target.value })} maxLength={200} />
                </Field>
              )}
            </>
          )}
          {link.url && linkValid && !isEmbed && (
            <div className="flex items-center gap-3 rounded-lg border border-adm-line p-2">
              <Thumb src={link.url} kind={linkKind} className="h-16 w-24 rounded-md" />
              <p className="min-w-0 flex-1 truncate text-xs text-adm-muted">{link.url}</p>
              <button type="button" className="p-1 text-adm-muted hover:text-adm-ink" onClick={() => setLink({ ...link, url: '' })} aria-label="Clear URL">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {isEmbed && (
            <Callout tone="info">
              <Link2 className="mr-1 inline h-3.5 w-3.5" /> YouTube and Vimeo links are embedded with privacy-friendly players and are not stored in the media library.
            </Callout>
          )}
        </div>
      )}
    </Modal>
  );
}
