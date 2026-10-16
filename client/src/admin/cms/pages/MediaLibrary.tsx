import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, Film, Folder, FolderOpen, Globe, Link2, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Field, Input, PageHeader, Pagination, SearchInput, Select } from '@/admin/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/format';
import { Callout, Segmented, Thumb } from '../components/bits';
import { StringListEditor } from '../components/ListEditor';
import { Uploader } from '../components/Uploader';
import { useMediaList, uploadWithProgress } from '../lib/media';
import type { MediaAsset, UsageRow } from '../lib/types';
import { formatBytes } from '../lib/util';

function ExternalModal({ open, onClose, folders }: { open: boolean; onClose: () => void; folders: string[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ url: '', alt: '', credit: '', folder: 'General', kind: 'IMAGE' as 'IMAGE' | 'VIDEO' });
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setF({ url: '', alt: '', credit: '', folder: 'General', kind: 'IMAGE' });
      setError(undefined);
    }
  }, [open]);
  const valid = /^https:\/\/[^\s]+$/i.test(f.url);
  const m = useMutation({
    mutationFn: () => api.post('/admin/media/external', f),
    onSuccess: () => {
      toast.success('Added to the library');
      void qc.invalidateQueries({ queryKey: ['cms-media'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? (Object.values(e.fieldErrors)[0] ?? e.message) : errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an image by link"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={!valid || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? 'Adding…' : 'Add to library'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-adm-muted">Register a licensed photo from Unsplash, Pexels or your own CDN without uploading it. The file stays where it is hosted.</p>
        <Segmented label="Kind" size="sm" value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[{ value: 'IMAGE', label: 'Image' }, { value: 'VIDEO', label: 'Video' }]} />
        <Field label="Direct https link" required error={error ?? (f.url && !valid ? 'Use a secure https:// link' : undefined)} hint="On Unsplash: right-click the photo → Copy image address.">
          <Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value.trim() })} placeholder="https://images.unsplash.com/photo-…" />
        </Field>
        {valid && f.kind === 'IMAGE' && <Thumb src={f.url} className="h-40 w-full rounded-lg" />}
        <Field label="Alt text" hint="Describe what the image shows.">
          <Input value={f.alt} maxLength={200} onChange={(e) => setF({ ...f, alt: e.target.value })} />
        </Field>
        <Field label="Credit & licence" hint="e.g. “Photo by Jane Doe on Unsplash — Unsplash Licence”. Only add images you are allowed to publish.">
          <Input value={f.credit} maxLength={200} onChange={(e) => setF({ ...f, credit: e.target.value })} />
        </Field>
        <Field label="Folder">
          <Input value={f.folder} maxLength={80} list="cms-lib-folders" onChange={(e) => setF({ ...f, folder: e.target.value })} />
          <datalist id="cms-lib-folders">
            {folders.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
      </div>
    </Modal>
  );
}

function DetailsDrawer({ asset, onClose, folders }: { asset: MediaAsset | null; onClose: () => void; folders: string[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ alt: '', caption: '', credit: '', folder: 'General', tags: [] as string[] });
  const [current, setCurrent] = useState<MediaAsset | null>(asset);
  const [inUse, setInUse] = useState<UsageRow[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setCurrent(asset);
    setInUse(null);
    setConfirmDelete(false);
    if (asset) setForm({ alt: asset.alt, caption: asset.caption, credit: asset.credit, folder: asset.folder, tags: asset.tags });
  }, [asset]);
  const usage = useQuery({ queryKey: ['cms-media-usage', current?.id, current?.url], queryFn: () => api.get<UsageRow[]>(`/admin/media/${current!.id}/usage`), enabled: !!current });
  const a = current;
  const dirty = !!a && (form.alt !== a.alt || form.caption !== a.caption || form.credit !== a.credit || form.folder !== a.folder || JSON.stringify(form.tags) !== JSON.stringify(a.tags));
  const refresh = () => void qc.invalidateQueries({ queryKey: ['cms-media'] });

  const save = async () => {
    if (!a) return;
    setBusy('save');
    try {
      const m = await api.patch<MediaAsset>(`/admin/media/${a.id}`, { ...form, folder: form.folder.trim() || 'General' });
      setCurrent(m);
      refresh();
      toast.success('Details saved');
    } catch (e) {
      toast.error('Could not save', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const replace = async (file: File) => {
    if (!a) return;
    setBusy('replace');
    setProgress(0);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await uploadWithProgress(`/admin/media/${a.id}/replace`, fd, setProgress);
      const m = r.data as unknown as MediaAsset;
      const n = (r.meta as { referencesUpdated?: number } | undefined)?.referencesUpdated ?? 0;
      setCurrent(m);
      refresh();
      void qc.invalidateQueries({ queryKey: ['cms-media-usage'] });
      toast.success('File replaced', n ? `${n} reference${n === 1 ? '' : 's'} across pages and content now use the new file.` : 'No pages referenced the old file.');
    } catch (e) {
      toast.error('Could not replace the file', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (force: boolean) => {
    if (!a) return;
    setBusy('delete');
    try {
      await api.delete(`/admin/media/${a.id}`, force ? { force: 'true' } : undefined);
      refresh();
      toast.success('File deleted');
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'IN_USE') {
        setInUse((e.details as UsageRow[]) ?? []);
        setConfirmDelete(false);
      } else toast.error('Could not delete', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const absUrl = a ? (a.url.startsWith('/') ? window.location.origin + a.url : a.url) : '';

  return (
    <Modal open={!!asset} onClose={onClose} side title={a?.filename ?? 'File'}>
      {a && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl bg-[#F1EDE5]">
            {a.kind === 'VIDEO' ? <video src={a.url} controls preload="metadata" className="max-h-80 w-full bg-black" /> : <Thumb src={a.url} alt={a.alt} className="aspect-[16/10] w-full" width={1200} />}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            {[
              ['Type', a.mime],
              ['Size', formatBytes(a.sizeBytes)],
              ['Dimensions', a.width && a.height ? `${a.width} × ${a.height}px` : '—'],
              ['Source', a.provider === 'external' ? 'External link' : a.provider === 'cloudinary' ? 'Cloudinary' : 'Uploaded'],
              ['Added', fmtDateTime(a.createdAt)],
              ['Updated', fmtDateTime(a.updatedAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-adm-muted">{k}</dt>
                <dd className="mt-0.5 truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <Field label="File URL">
            <div className="flex gap-1.5">
              <Input readOnly value={absUrl} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
              <button
                type="button"
                className="adm-btn-secondary px-2.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(absUrl);
                    toast.success('URL copied');
                  } catch {
                    toast.error('Could not copy', 'Select the URL and copy it manually.');
                  }
                }}
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
          </Field>
          <div className="space-y-4">
            <Field label="Alt text" hint={a.kind === 'IMAGE' ? 'Required for accessibility and SEO: describe what the image shows.' : undefined}>
              <Input value={form.alt} maxLength={200} onChange={(e) => setForm({ ...form, alt: e.target.value })} invalid={a.kind === 'IMAGE' && !form.alt} placeholder="e.g. Candle-lit reception tables beneath a floral canopy" />
              {a.kind === 'IMAGE' && !form.alt && <p className="mt-1 text-xs text-amber-700">This image has no alt text yet.</p>}
            </Field>
            <Field label="Caption">
              <Input value={form.caption} maxLength={200} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
            </Field>
            <Field label="Credit & licence" hint="Photographer and licence, e.g. “© Studio Lumière — used with permission”.">
              <Input value={form.credit} maxLength={200} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
            </Field>
            <Field label="Folder">
              <Input value={form.folder} maxLength={80} list="cms-drawer-folders" onChange={(e) => setForm({ ...form, folder: e.target.value })} />
              <datalist id="cms-drawer-folders">
                {folders.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
            <Field label="Tags" hint="Lowercase keywords that make files easy to find.">
              <StringListEditor value={form.tags} onChange={(tags) => setForm({ ...form, tags: tags.map((t) => t.toLowerCase()) })} max={20} maxLength={30} placeholder="e.g. mandap" />
            </Field>
            <button className="adm-btn-primary" disabled={!dirty || busy === 'save'} onClick={save}>
              {busy === 'save' ? 'Saving…' : 'Save details'}
            </button>
          </div>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted">Where it’s used</h3>
            {usage.isLoading ? (
              <div className="h-12 animate-pulse rounded-lg bg-adm-bg" />
            ) : usage.isError ? (
              <p className="text-xs text-red-600">{errorMessage(usage.error)}</p>
            ) : usage.data?.length ? (
              <ul className="divide-y divide-adm-line rounded-lg border border-adm-line">
                {usage.data.map((u, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate">{u.title}</span>
                    <span className="text-xs text-adm-muted">{u.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-adm-muted">Not used on any page or content yet.</p>
            )}
          </section>

          {a.provider !== 'external' && (
            <section className="rounded-lg border border-adm-line p-3">
              <h3 className="text-sm font-medium">Replace file</h3>
              <p className="mt-0.5 text-xs text-adm-muted">Upload a new version (e.g. a better crop). Every page and item using this file is updated automatically.</p>
              <input ref={fileRef} type="file" accept={a.kind === 'VIDEO' ? 'video/mp4,video/webm' : 'image/*'} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && replace(e.target.files[0])} />
              <button className="adm-btn-secondary mt-2" disabled={busy === 'replace'} onClick={() => fileRef.current?.click()}>
                <RefreshCw className={cn('h-4 w-4', busy === 'replace' && 'animate-spin')} /> {busy === 'replace' ? `Uploading ${Math.round(progress * 100)}%` : 'Choose a replacement…'}
              </button>
            </section>
          )}

          <section className="rounded-lg border border-red-200 p-3">
            <h3 className="text-sm font-medium text-red-700">Delete file</h3>
            {inUse ? (
              <div className="mt-2 space-y-2">
                <Callout tone="danger" title={`Used in ${inUse.length} place${inUse.length === 1 ? '' : 's'}`}>
                  <ul className="list-disc pl-4">
                    {inUse.map((u, i) => (
                      <li key={i}>
                        {u.type}: {u.title}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 font-semibold">Deleting anyway will leave broken or empty images in those places — including live pages. Replace the file or remove it there first if you can.</p>
                </Callout>
                <div className="flex gap-2">
                  <button className="adm-btn-secondary" onClick={() => setInUse(null)}>
                    Keep the file
                  </button>
                  <button className="adm-btn-danger" disabled={busy === 'delete'} onClick={() => remove(true)}>
                    <AlertTriangle className="h-4 w-4" /> Delete anyway
                  </button>
                </div>
              </div>
            ) : confirmDelete ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-adm-muted">Permanently delete “{a.filename}”?</span>
                <button className="adm-btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button className="adm-btn-danger px-2.5 py-1.5 text-xs" disabled={busy === 'delete'} onClick={() => remove(false)}>
                  {busy === 'delete' ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ) : (
              <button className="adm-btn-ghost mt-1 px-2 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete…
              </button>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

export default function MediaLibrary() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const folder = sp.get('folder') ?? '';
  const kind = (sp.get('kind') ?? '') as '' | 'IMAGE' | 'VIDEO';
  const page = Number(sp.get('page') ?? 1);
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setSp(next, { replace: true });
  };
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFolder, setUploadFolder] = useState('General');
  const [external, setExternal] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const list = useMediaList({ q, folder, kind, page, limit: 36 });
  const allFolders = useMediaList({ limit: 1 });
  const folders = allFolders.data?.meta.folders ?? list.data?.meta.folders ?? [];
  const totalAll = folders.reduce((s, f) => s + f.count, 0);
  useEffect(() => {
    if (folder) setUploadFolder(folder);
  }, [folder]);

  return (
    <div>
      <PageHeader
        title="Media library"
        subtitle="Photos, videos and logos used across the website. Images are optimised and served responsively."
        actions={
          <>
            <button className="adm-btn-secondary" onClick={() => setExternal(true)}>
              <Link2 className="h-4 w-4" /> Add by link
            </button>
            <button className="adm-btn-primary" onClick={() => setShowUpload((v) => !v)} aria-expanded={showUpload}>
              <Upload className="h-4 w-4" /> Upload
            </button>
          </>
        }
      />
      {showUpload && (
        <div className="adm-card mb-6 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <Field label="Upload into folder" className="w-64">
              <Input value={uploadFolder} maxLength={80} list="cms-upload-folders" onChange={(e) => setUploadFolder(e.target.value)} />
              <datalist id="cms-upload-folders">
                {folders.map((f) => (
                  <option key={f.name} value={f.name} />
                ))}
              </datalist>
            </Field>
            <button className="adm-btn-ghost" onClick={() => setShowUpload(false)} aria-label="Close upload panel">
              <X className="h-4 w-4" /> Close
            </button>
          </div>
          <Uploader folder={uploadFolder} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Folders" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted">Folders</p>
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5">
            {[{ name: '', count: totalAll }, ...folders].map((f) => {
              const on = folder === f.name;
              const I = on ? FolderOpen : Folder;
              return (
                <li key={f.name || '__all'} className="shrink-0">
                  <button onClick={() => setParam('folder', f.name)} aria-current={on || undefined} className={cn('flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition', on ? 'bg-white font-medium shadow-sm ring-1 ring-adm-line' : 'text-adm-muted hover:bg-white/70 hover:text-adm-ink')}>
                    <I className={cn('h-4 w-4', on && 'text-adm-gold')} />
                    <span className="flex-1 truncate">{f.name || 'All files'}</span>
                    <span className="text-xs tabular-nums text-adm-muted">{f.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-2">
            <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(v) => setParam('q', v)} placeholder="Search file name, alt text or tag" />
            <Select className="w-36" aria-label="Kind" value={kind} onChange={(e) => setParam('kind', e.target.value)}>
              <option value="">All types</option>
              <option value="IMAGE">Images</option>
              <option value="VIDEO">Videos</option>
            </Select>
          </div>
          {list.isError ? (
            <Callout tone="danger" title="Couldn’t load the library">
              {errorMessage(list.error)}{' '}
              <button className="underline" onClick={() => list.refetch()}>
                Try again
              </button>
            </Callout>
          ) : list.isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-adm-line/50" />
              ))}
            </div>
          ) : !list.data?.items.length ? (
            <div className="adm-card px-6 py-16 text-center">
              <Globe className="mx-auto h-8 w-8 text-adm-muted" strokeWidth={1.25} />
              <p className="mt-3 font-medium">{q || folder || kind ? 'No files match these filters' : 'Your media library is empty'}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-adm-muted">Upload your own photography and films, or add licensed images by link. Files you pick in the page builder appear here too.</p>
              <div className="mt-5 flex justify-center gap-2">
                <button className="adm-btn-primary" onClick={() => setShowUpload(true)}>
                  <Upload className="h-4 w-4" /> Upload files
                </button>
                <button className="adm-btn-secondary" onClick={() => setExternal(true)}>
                  <Link2 className="h-4 w-4" /> Add by link
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {list.data.items.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => setSelected(m)} className="group block w-full text-left focus-visible:outline-none">
                      <span className="relative block overflow-hidden rounded-xl ring-1 ring-adm-line transition group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-adm-gold">
                        <Thumb src={m.url} alt={m.alt} kind={m.kind} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-[1.03]" width={400} />
                        {m.kind === 'VIDEO' && (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                            <Film className="h-3 w-3" /> Video
                          </span>
                        )}
                        {m.provider === 'external' && <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-adm-ink">Link</span>}
                      </span>
                      <span className="mt-1.5 block truncate text-xs font-medium">{m.filename}</span>
                      <span className="block truncate text-[11px] text-adm-muted">
                        {m.folder}
                        {m.width ? ` · ${m.width}×${m.height}` : ''}
                        {!m.alt && m.kind === 'IMAGE' && <span className="text-amber-700"> · no alt text</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onPage={(p) => setParam('page', String(p))} />
            </>
          )}
        </div>
      </div>
      <ExternalModal open={external} onClose={() => setExternal(false)} folders={folders.map((f) => f.name)} />
      <DetailsDrawer asset={selected} onClose={() => setSelected(null)} folders={folders.map((f) => f.name)} />
    </div>
  );
}
