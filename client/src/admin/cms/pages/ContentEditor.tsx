import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Save, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { Card, PageHeader, Select, StatusBadge } from '@/admin/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Callout, UnsavedDialog } from '../components/bits';
import { COLLECTION_MAP } from '../content/collections';
import { ContentField, type Rec } from '../content/ContentFields';
import { useUnsavedGuard } from '../lib/hooks';
import { prettyIssue, slugify } from '../lib/util';

export default function ContentEditor() {
  const { collection = '', id = 'new' } = useParams();
  const cfg = COLLECTION_MAP[collection];
  const isNew = id === 'new';
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cms-content-item', collection, id], queryFn: () => api.get<Rec>(`/admin/content/${collection}/${id}`), enabled: !!cfg && !isNew });
  const [rec, setRec] = useState<Rec | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [goTo, setGoTo] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    if (isNew) {
      const d = cfg.defaults();
      setRec(d);
      setBaseline(JSON.stringify(d));
      setSlugTouched(false);
    } else if (q.data) {
      setRec(q.data);
      setBaseline(JSON.stringify(q.data));
      setSlugTouched(true);
    }
    setErrors({});
    setBlocked(null);
  }, [cfg, isNew, q.data]);

  const dirty = !!rec && JSON.stringify(rec) !== baseline;
  const blocker = useUnsavedGuard(dirty && !goTo);
  useEffect(() => {
    if (goTo && !dirty) {
      nav(goTo, { replace: true });
      setGoTo(null);
    }
  }, [goTo, dirty, nav]);

  const set = useCallback(
    (key: string, v: unknown) =>
      setRec((r) => {
        if (!r) return r;
        const next: Rec = { ...r, [key]: v };
        if (cfg?.groups.some((g) => g.fields.some((f) => f.kind === 'slug' && f.from === key)) && !slugTouched) next.slug = slugify(String(v ?? ''));
        return next;
      }),
    [cfg, slugTouched],
  );
  const patch = useCallback((p: Rec) => setRec((r) => (r ? { ...r, ...p } : r)), []);

  const save = async (status?: string) => {
    if (!rec || !cfg) return;
    const body: Rec = { ...rec, ...(status ? { status } : {}) };
    if (collection === 'packages' && body.pricingModel === 'ON_REQUEST') body.priceMinor = null;
    if ('slug' in body && typeof body.slug === 'string') body.slug = slugify(body.slug);
    setSaving(true);
    setErrors({});
    setBlocked(null);
    try {
      const saved = isNew ? await api.post<Rec>(`/admin/content/${collection}`, body) : await api.put<Rec>(`/admin/content/${collection}/${id}`, body);
      setRec(saved);
      setBaseline(JSON.stringify(saved));
      qc.setQueryData(['cms-content-item', collection, String(saved.id)], saved);
      void qc.invalidateQueries({ queryKey: ['cms-content', collection] });
      void qc.invalidateQueries({ queryKey: ['cms-content-count', collection] });
      void qc.invalidateQueries({ queryKey: ['cms-content-options', collection] });
      toast.success(saved.status === 'PUBLISHED' ? (status === 'PUBLISHED' && rec.status !== 'PUBLISHED' ? 'Published' : 'Saved — live on the website') : 'Saved', saved.status === 'PUBLISHED' ? undefined : 'Not visible on the website until published.');
      if (isNew) setGoTo(`/admin/website/content/${collection}/${saved.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PUBLISH_BLOCKED') {
        setBlocked(e.message);
        toast.error('Can’t publish yet', e.message);
      } else if (e instanceof ApiError && e.status === 422) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fieldErrors)) fe[k] = prettyIssue(v);
        setErrors(fe);
        toast.error('Please check the highlighted fields', Object.values(fe)[0] ?? e.message);
      } else if (e instanceof ApiError && e.status === 409) {
        setErrors({ slug: 'This URL is already used by another item' });
        toast.error('URL already in use', 'Choose a different URL.');
      } else toast.error('Could not save', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const view = useMemo(() => (rec && cfg?.publicPath && rec.status === 'PUBLISHED' && !isNew ? cfg.publicPath(rec) : null), [rec, cfg, isNew]);

  if (!cfg) {
    return (
      <div className="adm-card mx-auto max-w-lg p-8 text-center">
        <p className="font-medium">Unknown collection</p>
        <Link to="/admin/website/content" className="adm-btn-secondary mt-4">
          Content library
        </Link>
      </div>
    );
  }
  if (!isNew && q.isError) {
    return (
      <div className="adm-card mx-auto max-w-lg p-8 text-center">
        <p className="font-medium">{q.error instanceof ApiError && q.error.status === 404 ? `This ${cfg.singular.toLowerCase()} no longer exists` : 'Couldn’t load this item'}</p>
        <p className="mt-1 text-sm text-adm-muted">{errorMessage(q.error)}</p>
        <Link to={`/admin/website/content/${collection}`} className="adm-btn-secondary mt-4">
          Back to {cfg.label.toLowerCase()}
        </Link>
      </div>
    );
  }
  if (!rec) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-1/3 animate-pulse rounded bg-adm-line/60" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="h-96 animate-pulse rounded-xl bg-adm-line/40" />
          <div className="h-64 animate-pulse rounded-xl bg-adm-line/40" />
        </div>
      </div>
    );
  }

  const title = String(rec[cfg.titleField] ?? '') || (isNew ? `New ${cfg.singular.toLowerCase()}` : 'Untitled');
  const ctx = { rec, set, patch, errors, slugTouched, setSlugTouched, blocked };
  const main = cfg.groups.filter((g) => !g.side);
  const side = cfg.groups.filter((g) => g.side);
  const status = String(rec.status ?? 'DRAFT');
  const unknownErrors = Object.entries(errors).filter(([k]) => !cfg.groups.some((g) => g.fields.some((f) => 'key' in f && (k === f.key || k.startsWith(`${f.key}.`)))) && !['priceMinor', 'currency', 'discountBps', 'discountLabel', 'pricingModel'].includes(k.split('.')[0]));

  return (
    <div className="pb-10">
      <PageHeader
        back={{ to: `/admin/website/content/${collection}`, label: cfg.label }}
        title={title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {!isNew && rec.updatedAt ? <span>Last saved {fmtDateTime(String(rec.updatedAt))}</span> : <span>Not saved yet</span>}
            {dirty && <span className="text-amber-700">· Unsaved changes</span>}
          </span>
        }
        actions={
          <>
            {view && (
              <a href={view} target="_blank" rel="noopener" className="adm-btn-ghost">
                <ExternalLink className="h-4 w-4" /> View on site
              </a>
            )}
            <button className="adm-btn-secondary" disabled={saving || (!dirty && !isNew)} onClick={() => save()}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : status === 'PUBLISHED' ? 'Save changes' : 'Save draft'}
            </button>
            {status !== 'PUBLISHED' && (
              <button className="adm-btn-gold" disabled={saving} onClick={() => save('PUBLISHED')}>
                <Upload className="h-4 w-4" /> {isNew ? 'Save & publish' : 'Publish'}
              </button>
            )}
          </>
        }
      />
      {blocked && (
        <Callout tone="danger" title="Publishing was blocked" className="mb-4">
          {blocked}
        </Callout>
      )}
      {unknownErrors.length > 0 && (
        <Callout tone="danger" title="Please fix" className="mb-4">
          <ul className="list-disc pl-4">
            {unknownErrors.map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      <form
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="min-w-0 space-y-6">
          {main.map((g) => (
            <Card key={g.title} title={g.title}>
              {g.description && <p className="-mt-1 mb-4 text-xs text-adm-muted">{g.description}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                {g.fields.map((f, i) => (
                  <div key={i} className={['number', 'date'].includes(f.kind) ? '' : 'sm:col-span-2'}>
                    <ContentField spec={f} ctx={ctx} />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <aside className="space-y-6 lg:sticky lg:top-20">
          <Card title="Status">
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => set('status', e.target.value)}
              options={[
                { value: 'DRAFT', label: 'Draft — not on the website' },
                { value: 'PUBLISHED', label: 'Published — visible on the website' },
                { value: 'ARCHIVED', label: 'Archived — hidden & tucked away' },
              ]}
            />
            <p className="mt-2 text-xs text-adm-muted">Changes to a published item go live as soon as you save.</p>
          </Card>
          {side.map((g) => (
            <Card key={g.title} title={g.title}>
              {g.description && <p className="-mt-1 mb-3 text-xs text-adm-muted">{g.description}</p>}
              <div className="space-y-4">
                {g.fields.map((f, i) => (
                  <ContentField key={i} spec={f} ctx={ctx} />
                ))}
              </div>
            </Card>
          ))}
        </aside>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
      <UnsavedDialog blocker={blocker} />
    </div>
  );
}
