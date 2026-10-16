import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Img } from '@/components/ui/Img';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { Card, Field, Input, Textarea, Toggle } from '@/admin/ui';
import type { BookingDetail, Microsite } from '../types';
import { fieldErrors } from '../shared/hooks';
import { Alert, SkeletonRows } from '../shared/ui';

const blank = (slug: string): Microsite => ({ slug, enabled: false, headline: '', message: '', coverImage: '', schedule: [], gallery: [], photoShareUrl: '', showCountdown: true, rsvpEnabled: true, rsvpDeadline: null });

function move<T>(list: T[], i: number, d: -1 | 1) {
  const n = [...list];
  [n[i], n[i + d]] = [n[i + d], n[i]];
  return n;
}

export default function MicrositeEditor({ booking }: { booking: BookingDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const path = `/admin/guests/microsite?bookingId=${encodeURIComponent(booking.id)}`;
  const q = useQuery({ queryKey: ['booking-microsite', booking.id], queryFn: () => api.getPaged<Microsite | null>(path) });
  const [f, setF] = useState<Microsite | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setF(q.data.data ?? blank(String(q.data.meta?.suggestedSlug ?? '')));
    setDirty(false);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put<Microsite>(path, { ...f!, rsvpDeadline: f!.rsvpDeadline || null, schedule: f!.schedule.filter((s) => s.title.trim()), gallery: f!.gallery.filter((g) => g.url.trim()) }),
    onSuccess: (m) => {
      toast.success(m.enabled ? 'Microsite published' : 'Microsite saved (hidden)');
      setErrors({});
      qc.invalidateQueries({ queryKey: ['booking-microsite', booking.id] });
      qc.invalidateQueries({ queryKey: ['admin-booking', booking.id] });
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error('Microsite not saved', errorMessage(err));
    },
  });

  if (q.isLoading || !f) return q.isError ? <Alert tone="error">{errorMessage(q.error)}</Alert> : <SkeletonRows rows={5} />;
  const set = <K extends keyof Microsite>(k: K, v: Microsite[K]) => {
    setF((x) => x && { ...x, [k]: v });
    setDirty(true);
  };
  const publicUrl = `${window.location.origin}/e/${f.slug}`;
  const saved = !!q.data?.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <Card title="Event page">
          <div className="space-y-4">
            <Field label="Web address" required error={errors.slug} hint="Lowercase letters, numbers and hyphens.">
              <div className="flex items-stretch overflow-hidden rounded-lg border border-adm-line focus-within:border-adm-gold focus-within:ring-2 focus-within:ring-adm-gold/20">
                <span className="flex items-center bg-adm-bg px-3 text-xs text-adm-muted">/e/</span>
                <input className="min-w-0 flex-1 px-3 py-2 text-sm outline-none" value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} aria-label="Microsite address" aria-invalid={!!errors.slug || undefined} maxLength={80} />
              </div>
            </Field>
            <Field label="Headline" error={errors.headline}>
              <Input value={f.headline} onChange={(e) => set('headline', e.target.value)} maxLength={200} placeholder={booking.title} />
            </Field>
            <Field label="Welcome message" error={errors.message}>
              <Textarea rows={4} value={f.message} onChange={(e) => set('message', e.target.value)} maxLength={4000} />
            </Field>
            <Field label="Cover image URL" error={errors.coverImage} hint="https:// link or an /uploads/… path from the media library.">
              <Input value={f.coverImage} onChange={(e) => set('coverImage', e.target.value)} placeholder="https://…" />
            </Field>
            {f.coverImage && <Img src={f.coverImage} alt="Cover preview" className="aspect-[21/9] w-full rounded-lg object-cover" />}
            <Field label="Photo-sharing link" error={errors.photoShareUrl} hint="e.g. a shared album for guests to upload photos (https://).">
              <Input value={f.photoShareUrl} onChange={(e) => set('photoShareUrl', e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </Card>

        <Card
          title="Schedule"
          actions={
            <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => set('schedule', [...f.schedule, { time: '', title: '', location: '' }])}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </button>
          }
        >
          {f.schedule.length === 0 ? (
            <p className="text-sm text-adm-muted">Add the ceremonies, dinners and after-parties guests should know about.</p>
          ) : (
            <ul className="space-y-3">
              {f.schedule.map((s, i) => (
                <li key={i} className="grid gap-2 rounded-lg border border-adm-line p-3 sm:grid-cols-[120px_1fr_1fr_auto] sm:items-end">
                  <Field label="Time">
                    <Input value={s.time} onChange={(e) => set('schedule', f.schedule.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} placeholder="Sat 7 pm" maxLength={40} />
                  </Field>
                  <Field label="Title" error={errors[`schedule.${i}.title`]}>
                    <Input value={s.title} onChange={(e) => set('schedule', f.schedule.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} maxLength={200} />
                  </Field>
                  <Field label="Location">
                    <Input value={s.location} onChange={(e) => set('schedule', f.schedule.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))} maxLength={200} />
                  </Field>
                  <div className="flex gap-0.5">
                    <button className="adm-btn-ghost !px-1.5" disabled={i === 0} onClick={() => set('schedule', move(f.schedule, i, -1))} aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button className="adm-btn-ghost !px-1.5" disabled={i === f.schedule.length - 1} onClick={() => set('schedule', move(f.schedule, i, 1))} aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button className="adm-btn-ghost !px-1.5 text-red-600" onClick={() => set('schedule', f.schedule.filter((_, j) => j !== i))} aria-label="Remove schedule item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Gallery"
          actions={
            <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => set('gallery', [...f.gallery, { url: '', alt: '', caption: '' }])}>
              <Plus className="h-3.5 w-3.5" /> Add image
            </button>
          }
        >
          {f.gallery.length === 0 ? (
            <p className="text-sm text-adm-muted">Add pre-event photos or venue imagery (https:// URLs or /uploads/ paths).</p>
          ) : (
            <ul className="space-y-3">
              {f.gallery.map((g, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-adm-line p-3">
                  <div className="hidden h-16 w-24 shrink-0 overflow-hidden rounded-md bg-adm-bg sm:block">{g.url && <Img src={g.url} alt={g.alt} className="h-full w-full object-cover" />}</div>
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <Field label="Image URL" error={errors[`gallery.${i}.url`]} className="sm:col-span-2">
                      <Input value={g.url} onChange={(e) => set('gallery', f.gallery.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" />
                    </Field>
                    <Field label="Alt text">
                      <Input value={g.alt} onChange={(e) => set('gallery', f.gallery.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} maxLength={200} />
                    </Field>
                    <Field label="Caption">
                      <Input value={g.caption} onChange={(e) => set('gallery', f.gallery.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} maxLength={300} />
                    </Field>
                  </div>
                  <button className="adm-btn-ghost self-start !px-1.5 text-red-600" onClick={() => set('gallery', f.gallery.filter((_, j) => j !== i))} aria-label="Remove image">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card title="Publishing">
          <div className="space-y-4">
            <Toggle checked={f.enabled} onChange={(v) => set('enabled', v)} label={f.enabled ? 'Live — visible to anyone with the link' : 'Hidden'} />
            <div className="rounded-lg bg-adm-bg p-3">
              <p className="text-xs text-adm-muted">Public link</p>
              <p className="mt-0.5 break-all text-sm">{publicUrl}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="adm-btn-secondary !px-2 !py-1 text-xs"
                  onClick={() =>
                    navigator.clipboard.writeText(publicUrl).then(
                      () => toast.success('Link copied'),
                      () => toast.error('Copy failed'),
                    )
                  }
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                {saved && q.data?.data?.enabled && (
                  <a href={`/e/${q.data.data.slug}`} target="_blank" rel="noopener" className="adm-btn-secondary !px-2 !py-1 text-xs">
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </a>
                )}
              </div>
            </div>
            <Toggle checked={f.showCountdown} onChange={(v) => set('showCountdown', v)} label="Show countdown" />
            <Toggle checked={f.rsvpEnabled} onChange={(v) => set('rsvpEnabled', v)} label="Accept RSVPs" />
            <Field label="RSVP deadline" error={errors.rsvpDeadline}>
              <Input type="date" value={f.rsvpDeadline ?? ''} max={booking.eventDate} onChange={(e) => set('rsvpDeadline', e.target.value || null)} disabled={!f.rsvpEnabled} />
            </Field>
            <button className="adm-btn-primary !w-full" disabled={save.isPending || (!dirty && saved) || f.slug.length < 3} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : saved ? (dirty ? 'Save changes' : 'Saved') : 'Create microsite'}
            </button>
            {dirty && <p className="text-center text-xs text-adm-muted" aria-live="polite">You have unsaved changes.</p>}
          </div>
        </Card>
      </aside>
    </div>
  );
}
