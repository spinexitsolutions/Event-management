import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CalendarCheck2, CheckCircle2, ImagePlus, Lock, Star, Trash2, Upload, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, ConfirmDialog, Field, Input, MoneyInput, PageHeader, Select, StatusBadge, Tabs, Textarea, Toggle } from '@/admin/ui';
import { Img } from '@/components/ui/Img';
import { Markdown } from '@/components/ui/Markdown';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { AdmError, ChipsInput, fieldErrorsOf, InternalNote, RequirePerm, SkeletonRows, ymd } from '../shared';
import { emptyVenue, slugify, toVenueInput, type VenueInput, type VenueRecord } from '../venues/types';

const MEDIA_RE = /^(\/(?!\/)|https:\/\/)/i;

interface Availability {
  venue: { id: string; name: string; exclusive: boolean };
  from: string;
  to: string;
  available: boolean;
  conflicts: { id: string; reference: string; title: string; eventDate: string | null; eventEndDate: string | null; status: string }[];
  calendarEntries: { id: string; title: string; type: string; startsAt: string; endsAt: string; bookingId: string | null }[];
}

function AvailabilityChecker({ venueId }: { venueId: string }) {
  const today = ymd(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const q = useQuery({
    queryKey: ['venue-availability', venueId, range],
    queryFn: () => api.get<Availability>('/admin/resources/venue-availability', { venueId, from: range!.from, to: range!.to }),
    enabled: !!range,
  });
  return (
    <Card title="Availability checker">
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ from, to: to < from ? from : to });
        }}
      >
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <button className="adm-btn-secondary col-span-2" disabled={q.isFetching}>
          <CalendarCheck2 className="h-4 w-4" /> {q.isFetching ? 'Checking…' : 'Check dates'}
        </button>
      </form>
      <div aria-live="polite" className="mt-4">
        {q.isError && <p className="text-sm text-red-600">{errorMessage(q.error)}</p>}
        {q.data && (
          <div className="space-y-3 text-sm">
            <p className={cn('flex items-center gap-2 font-medium', q.data.available ? 'text-emerald-700' : 'text-red-700')}>
              {q.data.available ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {q.data.available ? (q.data.conflicts.length ? 'Available (not exclusive — other bookings overlap)' : 'Available on these dates') : 'Already booked on these dates'}
            </p>
            {q.data.conflicts.length > 0 && (
              <div>
                <p className="adm-label">Bookings at this venue</p>
                <ul className="divide-y divide-adm-line rounded-lg border border-adm-line">
                  {q.data.conflicts.map((b) => (
                    <li key={b.id} className="px-3 py-2">
                      <Link to={`/admin/bookings/${b.id}`} className="font-medium hover:underline">
                        {b.reference}
                      </Link>{' '}
                      · {b.title}
                      <span className="block text-xs text-adm-muted">
                        {fmtDate(b.eventDate)}
                        {b.eventEndDate && b.eventEndDate !== b.eventDate ? ` – ${fmtDate(b.eventEndDate)}` : ''} · <StatusBadge status={b.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {q.data.calendarEntries.length > 0 && (
              <div>
                <p className="adm-label">Calendar entries</p>
                <ul className="space-y-1">
                  {q.data.calendarEntries.map((c) => (
                    <li key={c.id} className="text-xs">
                      <span className="font-medium">{c.title}</span> · {fmtDate(c.startsAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function ImagesEditor({ images, cover, onChange, onCover, errors, canUpload }: { images: VenueInput['images']; cover: string; onChange: (v: VenueInput['images']) => void; onCover: (url: string) => void; errors: Record<string, string>; canUpload: boolean }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const addUrl = () => {
    const u = url.trim();
    if (!MEDIA_RE.test(u)) return toast.error('Use an https:// image URL or an uploaded file path');
    onChange([...images, { url: u, alt: '', caption: '' }]);
    if (!cover) onCover(u);
    setUrl('');
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files).slice(0, 20)) fd.append('files', f);
      fd.append('folder', 'Venues');
      const res = await api.uploadFull<{ url: string; alt: string }[]>('/admin/media', fd);
      const added = res.data.map((m) => ({ url: m.url, alt: m.alt ?? '', caption: '' }));
      onChange([...images, ...added]);
      if (!cover && added[0]) onCover(added[0].url);
      const errs = (res.meta as { errors?: { filename: string; message: string }[] } | undefined)?.errors ?? [];
      toast.success(`${added.length} image${added.length === 1 ? '' : 's'} uploaded`, errs.length ? `${errs.length} skipped: ${errs[0].message}` : 'Add alt text describing each photo.');
    } catch (err) {
      toast.error('Upload failed', errorMessage(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const update = (i: number, patch: Partial<VenueInput['images'][number]>) => onChange(images.map((im, j) => (j === i ? { ...im, ...patch } : im)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...images];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    onChange(n);
  };
  return (
    <div className="space-y-3">
      {images.length === 0 && <p className="rounded-lg border border-dashed border-adm-line px-4 py-6 text-center text-sm text-adm-muted">No images yet. Add photography of the space, lawns, ballrooms and setups.</p>}
      <ul className="space-y-3">
        {images.map((im, i) => (
          <li key={`${im.url}-${i}`} className="flex flex-col gap-3 rounded-lg border border-adm-line p-3 sm:flex-row">
            <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-md bg-adm-bg sm:w-36">
              <Img src={im.url} alt={im.alt || 'Venue image preview'} width={300} className="h-full w-full object-cover" fallbackClassName="bg-adm-bg" />
              {cover === im.url && <span className="absolute left-1.5 top-1.5 rounded bg-adm-dark/85 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">Cover</span>}
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p className="truncate text-xs text-adm-muted" title={im.url}>
                {im.url}
              </p>
              <Field error={errors[`images.${i}.alt`]}>
                <Input value={im.alt} onChange={(e) => update(i, { alt: e.target.value })} placeholder="Alt text — describe the photo for screen readers" maxLength={200} aria-label={`Alt text for image ${i + 1}`} />
              </Field>
              <Input value={im.caption} onChange={(e) => update(i, { caption: e.target.value })} placeholder="Caption (optional)" maxLength={200} aria-label={`Caption for image ${i + 1}`} />
              {errors[`images.${i}.url`] && <p className="text-xs text-red-600">{errors[`images.${i}.url`]}</p>}
            </div>
            <div className="flex shrink-0 gap-1 sm:flex-col">
              <button type="button" className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => onCover(im.url)} disabled={cover === im.url} aria-label="Use as cover image">
                <Star className={cn('h-3.5 w-3.5', cover === im.url && 'fill-adm-gold text-adm-gold')} /> Cover
              </button>
              <button type="button" className="adm-btn-ghost px-2 py-1" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="adm-btn-ghost px-2 py-1" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="adm-btn-ghost px-2 py-1 text-red-600"
                onClick={() => {
                  onChange(images.filter((_, j) => j !== i));
                  if (cover === im.url) onCover('');
                }}
                aria-label="Remove image"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… image URL"
          aria-label="Image URL"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addUrl();
            }
          }}
        />
        <button type="button" className="adm-btn-secondary shrink-0" onClick={addUrl} disabled={!url.trim() || images.length >= 30}>
          <ImagePlus className="h-4 w-4" /> Add URL
        </button>
        {canUpload && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id="venue-upload" onChange={(e) => upload(e.target.files)} />
            <label htmlFor="venue-upload" className={cn('adm-btn-secondary shrink-0 cursor-pointer', busy && 'pointer-events-none opacity-50')}>
              <Upload className="h-4 w-4" /> {busy ? 'Uploading…' : 'Upload'}
            </label>
          </>
        )}
      </div>
      {!canUpload && <p className="text-xs text-adm-muted">Uploading requires media library access; paste an https image URL instead.</p>}
    </div>
  );
}

function VenueEditor() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['venue', id], queryFn: () => api.get<VenueRecord>(`/admin/content/venues/${id}`), enabled: !isNew });
  const vendors = useQuery({
    queryKey: ['vendors-select'],
    queryFn: () => api.get<{ id: string; name: string; category: string }[]>('/admin/vendors', { limit: 200 }),
    enabled: can('vendors.view'),
    staleTime: 5 * 60_000,
  });
  const [v, setV] = useState<VenueInput>(emptyVenue);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setV(toVenueInput(existing.data));
      setSlugTouched(true);
      setDirty(false);
    }
  }, [existing.data]);

  const set = <K extends keyof VenueInput>(k: K, val: VenueInput[K]) => {
    setDirty(true);
    setV((x) => ({ ...x, [k]: val }));
  };

  const save = useMutation({
    mutationFn: (body: VenueInput) => (isNew ? api.post<VenueRecord>('/admin/content/venues', body) : api.put<VenueRecord>(`/admin/content/venues/${id}`, body)),
    onSuccess: (row) => {
      toast.success(isNew ? 'Venue created' : 'Venue saved');
      qc.invalidateQueries({ queryKey: ['venues'] });
      qc.invalidateQueries({ queryKey: ['venues-select'] });
      qc.setQueryData(['venue', row.id], row);
      setDirty(false);
      if (isNew) nav(`/admin/venues/${row.id}`, { replace: true });
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not save the venue', errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/content/venues/${id}`),
    onSuccess: () => {
      toast.success('Venue deleted');
      qc.invalidateQueries({ queryKey: ['venues'] });
      nav('/admin/venues');
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error('Could not delete the venue', /foreign key|constraint/i.test(errorMessage(err)) ? 'It is linked to bookings or calendar entries. Archive it instead.' : errorMessage(err));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.name.trim()) errs.name = 'Name is required';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug)) errs.slug = 'Use lowercase letters, numbers and hyphens';
    if (v.capacityMin && v.capacityMax && v.capacityMin > v.capacityMax) errs.capacityMax = 'Maximum must be at least the minimum';
    if (v.lat !== null && (v.lat < -90 || v.lat > 90)) errs.lat = 'Latitude must be between -90 and 90';
    if (v.lng !== null && (v.lng < -180 || v.lng > 180)) errs.lng = 'Longitude must be between -180 and 180';
    if (v.coverImage && !MEDIA_RE.test(v.coverImage)) errs.coverImage = 'Use an https URL or uploaded file';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    save.mutate({ ...v, name: v.name.trim() });
  };

  if (!isNew && existing.isLoading) return <SkeletonRows rows={8} />;
  if (!isNew && existing.isError) return <AdmError error={existing.error} onRetry={() => existing.refetch()} />;

  const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null);

  return (
    <div>
      <form id="venue-form" onSubmit={submit} noValidate hidden />
      <PageHeader
        back={{ to: '/admin/venues', label: 'All venues' }}
        title={isNew ? 'New venue' : v.name || 'Venue'}
        subtitle={isNew ? 'Add a venue you work with.' : existing.data && `Last updated ${fmtDate(existing.data.updatedAt)}${dirty ? ' · unsaved changes' : ''}`}
        actions={
          <>
            {!isNew && (
              <button type="button" className="adm-btn-ghost text-red-600 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
            <button type="submit" form="venue-form" className="adm-btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : isNew ? 'Create venue' : 'Save venue'}
            </button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Venue name" required error={errors.name} className="sm:col-span-2">
                <Input
                  value={v.name}
                  maxLength={160}
                  invalid={!!errors.name}
                  onChange={(e) => {
                    set('name', e.target.value);
                    if (!slugTouched) setV((x) => ({ ...x, name: e.target.value, slug: slugify(e.target.value) }));
                  }}
                />
              </Field>
              <Field label="URL slug" required error={errors.slug} hint="Used in the public venue link.">
                <Input
                  value={v.slug}
                  maxLength={80}
                  invalid={!!errors.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug', e.target.value.toLowerCase());
                  }}
                />
              </Field>
              <Field label="Status" error={errors.status}>
                <Select value={v.status} onChange={(e) => set('status', e.target.value as VenueInput['status'])} aria-label="Status">
                  <option value="PUBLISHED">Published (active)</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
              <Field label="City" error={errors.city}>
                <Input value={v.city} maxLength={80} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="Region / state" error={errors.region}>
                <Input value={v.region} maxLength={80} onChange={(e) => set('region', e.target.value)} />
              </Field>
              <Field label="Address" error={errors.address} className="sm:col-span-2">
                <Input value={v.address} maxLength={300} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="Latitude" error={errors.lat}>
                <Input inputMode="decimal" defaultValue={v.lat ?? ''} key={`lat-${existing.data?.updatedAt ?? ''}`} onChange={(e) => set('lat', num(e.target.value))} placeholder="e.g. 24.5764" invalid={!!errors.lat} />
              </Field>
              <Field label="Longitude" error={errors.lng}>
                <Input inputMode="decimal" defaultValue={v.lng ?? ''} key={`lng-${existing.data?.updatedAt ?? ''}`} onChange={(e) => set('lng', num(e.target.value))} placeholder="e.g. 73.6835" invalid={!!errors.lng} />
              </Field>
            </div>
          </Card>

          <Card
            title="Description"
            actions={<Tabs value={descTab} onChange={setDescTab} tabs={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} className="-my-3 border-b-0" />}
          >
            {descTab === 'write' ? (
              <Field error={errors.description} hint="Markdown supported: **bold**, *italic*, lists and [links](https://…).">
                <Textarea rows={8} value={v.description} maxLength={5000} onChange={(e) => set('description', e.target.value)} aria-label="Description" />
              </Field>
            ) : (
              <div className="min-h-[160px] rounded-lg border border-adm-line bg-adm-bg/30 p-4 text-sm">{v.description ? <Markdown>{v.description}</Markdown> : <p className="text-adm-muted">Nothing to preview yet.</p>}</div>
            )}
          </Card>

          <Card title="Capacity & facilities">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum guests" error={errors.capacityMin}>
                <Input type="number" min={1} value={v.capacityMin ?? ''} onChange={(e) => set('capacityMin', e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)} />
              </Field>
              <Field label="Maximum guests" error={errors.capacityMax}>
                <Input type="number" min={1} value={v.capacityMax ?? ''} onChange={(e) => set('capacityMax', e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)} invalid={!!errors.capacityMax} />
              </Field>
              <Field label="Facilities" error={errors.facilities} hint="Press Enter after each facility (max 30)." className="sm:col-span-2">
                <ChipsInput value={v.facilities} onChange={(x) => set('facilities', x)} max={30} placeholder="e.g. Lakeside lawn, Bridal suite, Valet parking" />
              </Field>
            </div>
          </Card>

          <Card title="Images">
            <ImagesEditor images={v.images} cover={v.coverImage} onChange={(x) => set('images', x)} onCover={(u) => set('coverImage', u)} errors={errors} canUpload={can('media.manage')} />
            <Field label="Cover image URL" error={errors.coverImage} hint="Pick a cover above or paste a URL." className="mt-4">
              <Input value={v.coverImage} onChange={(e) => set('coverImage', e.target.value)} placeholder="https://…" invalid={!!errors.coverImage} />
            </Field>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Visibility & booking rules">
            <div className="space-y-4">
              <div>
                <Toggle checked={v.isPublic} onChange={(x) => set('isPublic', x)} label="Show on website" />
                <p className="mt-1 pl-[46px] text-xs text-adm-muted">Listed on the public venues pages (name, city, description, capacity, facilities and photos only).</p>
              </div>
              <div>
                <Toggle checked={v.exclusive} onChange={(x) => set('exclusive', x)} label="Exclusive venue" />
                <p className="mt-1 pl-[46px] text-xs text-adm-muted">Prevents double-booking: only one active booking or calendar entry can hold this venue at a time. Turn off for venues with several halls that can host events in parallel.</p>
              </div>
              <Field label="Sort order" hint="Lower numbers appear first.">
                <Input type="number" value={v.sortOrder} onChange={(e) => set('sortOrder', Math.round(Number(e.target.value) || 0))} />
              </Field>
            </div>
          </Card>

          <Card title={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-adm-gold" /> Commercial (internal)</span>}>
            <div className="space-y-4">
              <InternalNote />
              <Field label="Ownership" error={errors.ownership}>
                <Select value={v.ownership} onChange={(e) => set('ownership', e.target.value as VenueInput['ownership'])} aria-label="Ownership">
                  <option value="PARTNER">Partner venue</option>
                  <option value="EXTERNAL">External venue</option>
                  <option value="COMPANY">Company-owned</option>
                </Select>
              </Field>
              {can('vendors.view') ? (
                <Field label="Linked vendor" error={errors.vendorId} hint="The vendor record you pay for this venue.">
                  <Select value={v.vendorId ?? ''} onChange={(e) => set('vendorId', e.target.value || null)} aria-label="Linked vendor">
                    <option value="">None</option>
                    {vendors.data?.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} — {x.category}
                      </option>
                    ))}
                    {v.vendorId && !vendors.data?.some((x) => x.id === v.vendorId) && <option value={v.vendorId}>{existing.data?.vendor?.name ?? 'Current vendor'}</option>}
                  </Select>
                </Field>
              ) : (
                existing.data?.vendor && <p className="text-sm">Vendor: {existing.data.vendor.name}</p>
              )}
              <Field label="Rental price" error={errors.rentalPriceMinor}>
                <MoneyInput value={v.rentalPriceMinor} onChange={(m) => set('rentalPriceMinor', m)} allowEmpty placeholder="Not set" />
              </Field>
              <Field label="Rental notes" error={errors.rentalNotes}>
                <Textarea rows={3} value={v.rentalNotes} maxLength={1000} onChange={(e) => set('rentalNotes', e.target.value)} placeholder="Inclusions, minimum spend, curfew, deposit…" />
              </Field>
            </div>
          </Card>

          {!isNew && <AvailabilityChecker venueId={id} />}
          {isNew && (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-adm-line px-4 py-3 text-xs text-adm-muted">
              <CalendarCheck2 className="h-4 w-4" aria-hidden /> Save the venue to check its availability.
            </p>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} title="Delete venue?" body="Prefer archiving venues that have bookings or calendar entries. Deleting cannot be undone." confirmLabel="Delete venue" danger loading={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setConfirmDelete(false)} />
    </div>
  );
}

export default function VenueEditorPage() {
  return (
    <RequirePerm any={['venues.manage']}>
      <VenueEditor />
    </RequirePerm>
  );
}
