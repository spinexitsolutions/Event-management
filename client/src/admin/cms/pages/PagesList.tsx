import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, EyeOff, FilePlus2, FileText, Home, Info, Mail, MoreHorizontal, Pencil, Scale, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RESERVED_SLUGS } from '@maison/shared';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Badge, ConfirmDialog, DataTable, Field, Input, PageHeader, Select, type Column } from '@/admin/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fmtDateTime, fromNow } from '@/lib/format';
import type { PageRow } from '../lib/types';
import { publicPath, slugify } from '../lib/util';

const KIND_META: Record<PageRow['kind'], { label: string; icon: typeof Home }> = {
  HOME: { label: 'Homepage', icon: Home },
  ABOUT: { label: 'About', icon: Info },
  CONTACT: { label: 'Contact', icon: Mail },
  STANDARD: { label: 'Custom page', icon: FileText },
  LEGAL: { label: 'Legal', icon: Scale },
};
const KIND_ORDER = ['HOME', 'ABOUT', 'CONTACT', 'STANDARD', 'LEGAL'];


function RowMenu({ page, onUnpublish, onDelete }: { page: PageRow; onUnpublish: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const builtIn = ['HOME', 'ABOUT', 'CONTACT'].includes(page.kind);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button className="adm-btn-ghost p-1.5" onClick={() => setOpen((v) => !v)} aria-label={`More actions for ${page.title}`} aria-expanded={open}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-lg border border-adm-line bg-white py-1 text-sm shadow-xl" role="menu">
            {page.status === 'PUBLISHED' && (
              <a role="menuitem" href={publicPath(page)} target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-2 hover:bg-adm-bg">
                <ExternalLink className="h-4 w-4 text-adm-muted" /> View live page
              </a>
            )}
            {page.status === 'PUBLISHED' && page.kind !== 'HOME' && (
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-adm-bg"
                onClick={() => {
                  setOpen(false);
                  onUnpublish();
                }}
              >
                <EyeOff className="h-4 w-4 text-adm-muted" /> Unpublish
              </button>
            )}
            <button
              role="menuitem"
              disabled={builtIn}
              title={builtIn ? 'Built-in pages cannot be deleted — hide their sections instead' : undefined}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-adm-muted disabled:hover:bg-transparent"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete page{builtIn && ' (built-in)'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CreatePageModal({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: PageRow[] }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<'STANDARD' | 'LEGAL'>('STANDARD');
  const [templateFrom, setTemplateFrom] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setTitle('');
      setSlug('');
      setSlugTouched(false);
      setKind('STANDARD');
      setTemplateFrom('');
      setErrors({});
    }
  }, [open]);
  const effectiveSlug = slugTouched ? slug : slugify(title);
  const slugError = !effectiveSlug ? undefined : RESERVED_SLUGS.includes(effectiveSlug) ? 'This URL is used by a built-in page' : pages.some((p) => p.slug === effectiveSlug) ? 'Another page already uses this URL' : !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effectiveSlug) ? 'Use lowercase letters, numbers and hyphens' : undefined;
  const create = useMutation({
    mutationFn: () => api.post<PageRow>('/admin/cms/pages', { title: title.trim(), slug: effectiveSlug, kind, templateFrom: templateFrom || undefined }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['cms-pages'] });
      toast.success('Page created', 'Add sections, then publish when ready.');
      onClose();
      nav(`/admin/website/pages/${p.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) setErrors(e.code === 'RESERVED_SLUG' ? { slug: e.message } : e.fieldErrors);
      else if (e instanceof ApiError && e.status === 409) setErrors({ slug: 'Another page already uses this URL' });
      toast.error('Could not create the page', errorMessage(e));
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New page"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" form="cms-new-page" type="submit" disabled={!title.trim() || !effectiveSlug || !!slugError || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create & open builder'}
          </button>
        </>
      }
    >
      <form
        id="cms-new-page"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && effectiveSlug && !slugError) create.mutate();
        }}
      >
        <Field label="Page title" required error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Destination weddings in Udaipur" autoFocus />
        </Field>
        <Field label="Page URL" required error={errors.slug ?? slugError} hint="Generated from the title — you can edit it.">
          <div className="flex items-center rounded-lg border border-adm-line bg-adm-bg/60 focus-within:border-adm-gold focus-within:ring-2 focus-within:ring-adm-gold/20">
            <span className="pl-3 text-sm text-adm-muted">{window.location.host}/</span>
            <input
              className="w-full bg-transparent px-1 py-2 text-sm outline-none"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-'));
              }}
              aria-label="Page URL slug"
              maxLength={80}
            />
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Page type" hint={kind === 'LEGAL' ? 'Legal pages are listed in the footer’s legal links.' : 'A regular page built from sections.'}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as 'STANDARD' | 'LEGAL')} options={[{ value: 'STANDARD', label: 'Standard page' }, { value: 'LEGAL', label: 'Legal / policy page' }]} />
          </Field>
          <Field label="Start from" hint="Copies the sections of another page as a starting point.">
            <Select value={templateFrom} onChange={(e) => setTemplateFrom(e.target.value)}>
              <option value="">Blank page</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  Copy sections from “{p.title}”
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function PagesList() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['cms-pages'], queryFn: () => api.get<PageRow[]>('/admin/cms/pages') });
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ page: PageRow; action: 'unpublish' | 'delete' } | null>(null);
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title)), [q.data]);
  const act = useMutation({
    mutationFn: ({ page, action }: { page: PageRow; action: 'unpublish' | 'delete' }) => (action === 'delete' ? api.delete(`/admin/cms/pages/${page.id}`) : api.post(`/admin/cms/pages/${page.id}/unpublish`)),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'delete' ? 'Page deleted' : 'Page unpublished', v.action === 'unpublish' ? 'Visitors will no longer see it. Publish again from the builder.' : undefined);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ['cms-pages'] });
    },
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });

  const columns: Column<PageRow>[] = [
    {
      key: 'title',
      header: 'Page',
      cell: (p) => {
        const K = KIND_META[p.kind] ?? KIND_META.STANDARD;
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adm-bg text-adm-muted">
              <K.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <Link to={`/admin/website/pages/${p.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                {p.title}
              </Link>
              <p className="truncate text-xs text-adm-muted">{publicPath(p)}</p>
            </div>
          </div>
        );
      },
    },
    { key: 'kind', header: 'Type', cell: (p) => <span className="text-adm-muted">{KIND_META[p.kind]?.label ?? p.kind}</span>, className: 'hidden md:table-cell' },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {p.status === 'PUBLISHED' ? <Badge tone="green">Live · v{p.publishedVersion}</Badge> : p.status === 'UNPUBLISHED' ? <Badge tone="gray">Unpublished</Badge> : <Badge tone="gray">Draft</Badge>}
          {p.hasUnpublished && <Badge tone="amber">Unpublished changes</Badge>}
        </div>
      ),
    },
    {
      key: 'updated',
      header: 'Last updated',
      cell: (p) => (
        <span className="text-adm-muted" title={fmtDateTime(p.updatedAt)}>
          {fromNow(p.updatedAt)}
        </span>
      ),
      className: 'hidden sm:table-cell',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-px text-right',
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Link to={`/admin/website/pages/${p.id}`} className="adm-btn-secondary px-2.5 py-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
          <RowMenu page={p} onUnpublish={() => setConfirm({ page: p, action: 'unpublish' })} onDelete={() => setConfirm({ page: p, action: 'delete' })} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Pages & homepage"
        subtitle="Build pages from sections with a live preview. Changes are saved as drafts until you publish."
        actions={
          <button className="adm-btn-primary" onClick={() => setCreating(true)}>
            <FilePlus2 className="h-4 w-4" /> New page
          </button>
        }
      />
      {q.isError ? (
        <div className="adm-card p-8 text-center text-sm">
          <p className="font-medium">Couldn’t load pages</p>
          <p className="mt-1 text-adm-muted">{errorMessage(q.error)}</p>
          <button className="adm-btn-secondary mt-3" onClick={() => q.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={q.isLoading} onRowClick={(r) => nav(`/admin/website/pages/${r.id}`)} empty="No pages yet — create your first page." />
      )}
      <CreatePageModal open={creating} onClose={() => setCreating(false)} pages={rows} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger={confirm?.action === 'delete'}
        loading={act.isPending}
        title={confirm?.action === 'delete' ? `Delete “${confirm.page.title}”?` : `Unpublish “${confirm?.page.title}”?`}
        body={confirm?.action === 'delete' ? 'The page, its draft and its version history are removed permanently. Links to it will show “Page not found”.' : 'The page stops being visible to visitors. Its draft and history are kept and you can publish it again at any time.'}
        confirmLabel={confirm?.action === 'delete' ? 'Delete page' : 'Unpublish'}
        onConfirm={() => confirm && act.mutate(confirm)}
      />
    </div>
  );
}
