import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Copy, ExternalLink, Eye, EyeOff, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { Badge, ConfirmDialog, PageHeader, Pagination, SearchInput, Select, StatusBadge } from '@/admin/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, fromNow } from '@/lib/format';
import { Callout, Thumb } from '../components/bits';
import { SortableList } from '../components/Sortable';
import { COLLECTION_MAP } from '../content/collections';
import { moveItem } from '../lib/util';

type Row = Record<string, unknown> & { id: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; updatedAt: string };
const PAGE_SIZE = 50;

function RowActions({ row, onStatus, onDuplicate, onDelete, viewHref }: { row: Row; onStatus: (s: Row['status']) => void; onDuplicate: () => void; onDelete: () => void; viewHref: string | null }) {
  const [open, setOpen] = useState(false);
  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-adm-bg';
  return (
    <div className="relative">
      <button className="adm-btn-ghost p-1.5" onClick={() => setOpen((v) => !v)} aria-label="More actions" aria-expanded={open}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-lg border border-adm-line bg-white py-1 text-sm shadow-xl" role="menu" onClick={() => setOpen(false)}>
            {viewHref && row.status === 'PUBLISHED' && (
              <a role="menuitem" className={item} href={viewHref} target="_blank" rel="noopener">
                <ExternalLink className="h-4 w-4 text-adm-muted" /> View on site
              </a>
            )}
            <button role="menuitem" className={item} onClick={onDuplicate}>
              <Copy className="h-4 w-4 text-adm-muted" /> Duplicate
            </button>
            {row.status === 'ARCHIVED' ? (
              <button role="menuitem" className={item} onClick={() => onStatus('DRAFT')}>
                <ArchiveRestore className="h-4 w-4 text-adm-muted" /> Restore as draft
              </button>
            ) : (
              <button role="menuitem" className={item} onClick={() => onStatus('ARCHIVED')}>
                <Archive className="h-4 w-4 text-adm-muted" /> Archive
              </button>
            )}
            <button role="menuitem" className={cn(item, 'text-red-600 hover:bg-red-50')} onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> Delete…
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ContentList() {
  const { collection = '' } = useParams();
  const cfg = COLLECTION_MAP[collection];
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const status = sp.get('status') ?? '';
  const categoryId = sp.get('category') ?? '';
  const group = sp.get('group') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setSp(next, { replace: true });
  };
  const [confirm, setConfirm] = useState<{ row: Row; action: 'delete' | 'ARCHIVED' } | null>(null);
  const [order, setOrder] = useState<Row[] | null>(null);

  const list = useQuery({
    queryKey: ['cms-content', collection, { q, status, categoryId, group, page }],
    queryFn: () => api.getPaged<Row[]>(`/admin/content/${collection}`, { q, status, categoryId, group, page, limit: cfg?.reorder ? 200 : PAGE_SIZE }),
    enabled: !!cfg,
    placeholderData: (p) => p,
  });
  const cats = useQuery({ queryKey: ['cms-content-options', 'categories'], queryFn: () => api.get<{ id: string; name: string }[]>('/admin/content/categories', { limit: 200 }), enabled: !!cfg?.categoryFilter });
  const groups = useQuery({ queryKey: ['cms-content-options', 'faq-groups'], queryFn: () => api.get<{ group: string }[]>('/admin/content/faqs', { limit: 200 }), enabled: !!cfg?.groupFilter });
  useEffect(() => setOrder(null), [list.data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cms-content', collection] });
    void qc.invalidateQueries({ queryKey: ['cms-content-count', collection] });
  };
  const setStatus = useMutation({
    mutationFn: ({ row, s }: { row: Row; s: Row['status'] }) => api.patch(`/admin/content/${collection}/${row.id}/status`, { status: s }),
    onSuccess: (_d, v) => {
      toast.success(v.s === 'PUBLISHED' ? 'Published' : v.s === 'ARCHIVED' ? 'Archived' : 'Moved to drafts', v.s === 'PUBLISHED' ? 'It is now visible on the website.' : undefined);
      setConfirm(null);
      invalidate();
    },
    onError: (e, v) => {
      if (e instanceof ApiError && e.code === 'PUBLISH_BLOCKED') toast.error('Can’t publish yet', `${e.message} Open “${String(v.row[cfg.titleField])}” to record it.`);
      else toast.error('Could not change status', errorMessage(e));
    },
  });
  const duplicate = useMutation({
    mutationFn: (row: Row) => api.post<Row>(`/admin/content/${collection}/${row.id}/duplicate`),
    onSuccess: (r) => {
      toast.success('Duplicated', 'The copy is saved as a draft.');
      invalidate();
      nav(`/admin/website/content/${collection}/${r.id}`);
    },
    onError: (e) => toast.error('Could not duplicate', errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (row: Row) => api.delete(`/admin/content/${collection}/${row.id}`),
    onSuccess: () => {
      toast.success('Deleted');
      setConfirm(null);
      invalidate();
    },
    onError: (e) => toast.error('Could not delete', errorMessage(e)),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post(`/admin/content/${collection}/reorder`, { ids }),
    onSuccess: () => {
      toast.success('Order saved', 'The website shows items in this order.');
      invalidate();
    },
    onError: (e) => {
      setOrder(null);
      toast.error('Could not save the order', errorMessage(e));
    },
  });

  if (!cfg) {
    return (
      <div className="adm-card mx-auto max-w-lg p-8 text-center">
        <p className="font-medium">{collection === 'venues' ? 'Venues are managed under Operations' : 'Unknown collection'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/admin/website/content" className="adm-btn-secondary">
            Content library
          </Link>
          {collection === 'venues' && (
            <Link to="/admin/venues" className="adm-btn-primary">
              Open venues
            </Link>
          )}
        </div>
      </div>
    );
  }

  const rows = order ?? list.data?.data ?? [];
  const meta = list.data?.meta;
  const filtered = !!(q || status || categoryId || group);
  const canDrag = cfg.reorder && !filtered && (meta?.total ?? 0) <= 200 && rows.length > 1;
  const faqGroups = [...new Set((groups.data ?? []).map((g) => g.group).filter(Boolean))].sort();

  const renderRow = (r: Row, handle?: ReactNode) => {
    const title = String(r[cfg.titleField] ?? '') || 'Untitled';
    const sub = cfg.subtitle?.(r);
    const view = cfg.publicPath?.(r) ?? null;
    return (
      <div className="flex items-center gap-3 border-b border-adm-line/70 bg-white px-3 py-2.5 last:border-b-0 hover:bg-adm-bg/50">
        {handle !== undefined && <span className="w-6">{handle}</span>}
        {cfg.imageField && <Thumb src={String(r[cfg.imageField] ?? '')} className={cn('h-11 shrink-0 rounded-md', cfg.key === 'testimonials' || cfg.key === 'team' ? 'w-11 rounded-full' : 'w-12 sm:w-16')} width={200} />}
        <Link to={`/admin/website/content/${collection}/${r.id}`} className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium hover:underline">{title}</span>
            {cfg.featuredField && r[cfg.featuredField] === true && <Star className="h-3.5 w-3.5 shrink-0 fill-adm-gold text-adm-gold" aria-label="Featured" />}
          </span>
          {sub && <span className="block truncate text-xs text-adm-muted">{sub}</span>}
        </Link>
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {cfg.key === 'packages' && r.visible === false && <Badge tone="gray">Hidden</Badge>}
          {cfg.key === 'projects' && !r.publicationConsent && <Badge tone="amber">No consent</Badge>}
          {cfg.key === 'testimonials' && !r.clientApproved && <Badge tone="amber">Not approved</Badge>}
          {cfg.key === 'logos' && !r.authorized && <Badge tone="amber">No permission</Badge>}
          <StatusBadge status={r.status} />
        </div>
        <span className="hidden w-24 shrink-0 text-right text-xs text-adm-muted lg:block" title={fmtDateTime(r.updatedAt)}>
          {fromNow(r.updatedAt)}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {r.status !== 'ARCHIVED' && (
            <button
              className="adm-btn-secondary px-2 py-1 text-xs"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ row: r, s: r.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })}
              title={r.status === 'PUBLISHED' ? 'Unpublish (move to drafts)' : 'Publish now'}
            >
              {r.status === 'PUBLISHED' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="hidden md:inline">{r.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}</span>
            </button>
          )}
          <Link to={`/admin/website/content/${collection}/${r.id}`} className="adm-btn-ghost p-1.5" aria-label={`Edit ${title}`}>
            <Pencil className="h-4 w-4" />
          </Link>
          <RowActions row={r} viewHref={view} onStatus={(s) => (s === 'ARCHIVED' ? setConfirm({ row: r, action: 'ARCHIVED' }) : setStatus.mutate({ row: r, s }))} onDuplicate={() => duplicate.mutate(r)} onDelete={() => setConfirm({ row: r, action: 'delete' })} />
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={cfg.label}
        subtitle={cfg.description}
        back={{ to: '/admin/website/content', label: 'Content library' }}
        actions={
          <Link to={`/admin/website/content/${collection}/new`} className="adm-btn-primary">
            <Plus className="h-4 w-4" /> New {cfg.singular.toLowerCase()}
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(v) => setParam('q', v)} placeholder={`Search ${cfg.label.toLowerCase()}`} />
        <Select className="w-44" aria-label="Status" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">Active (not archived)</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Drafts</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        {cfg.categoryFilter && (
          <Select className="w-52" aria-label="Category" value={categoryId} onChange={(e) => setParam('category', e.target.value)}>
            <option value="">All categories</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        {cfg.groupFilter && (
          <Select className="w-44" aria-label="Group" value={group} onChange={(e) => setParam('group', e.target.value)}>
            <option value="">All groups</option>
            {faqGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        )}
      </div>
      {cfg.reorder && rows.length > 1 && (
        <p className="mb-2 text-xs text-adm-muted" aria-live="polite">
          {canDrag ? (reorder.isPending ? 'Saving order…' : 'Drag the handles (or focus a handle and use Space + arrow keys) to set the order shown on the website.') : 'Clear search and filters to reorder.'}
        </p>
      )}
      {list.isError ? (
        <Callout tone="danger" title="Couldn’t load this list">
          {errorMessage(list.error)}{' '}
          <button className="underline" onClick={() => list.refetch()}>
            Try again
          </button>
        </Callout>
      ) : list.isLoading ? (
        <div className="adm-card overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-adm-line/70 px-3 py-3">
              <div className="h-11 w-16 animate-pulse rounded-md bg-adm-line/60" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-adm-line/60" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-card px-6 py-14 text-center">
          <cfg.icon className="mx-auto h-8 w-8 text-adm-muted" strokeWidth={1.25} />
          <p className="mt-3 font-medium">{filtered ? 'Nothing matches your filters' : `No ${cfg.label.toLowerCase()} yet`}</p>
          <p className="mt-1 text-sm text-adm-muted">{filtered ? 'Try a different search or status.' : cfg.description}</p>
          {!filtered && (
            <Link to={`/admin/website/content/${collection}/new`} className="adm-btn-primary mt-4">
              <Plus className="h-4 w-4" /> Add the first one
            </Link>
          )}
        </div>
      ) : canDrag ? (
        <div className="adm-card overflow-hidden">
          <SortableList
            ids={rows.map((r) => r.id)}
            onMove={(from, to) => {
              const next = moveItem(rows, from, to);
              setOrder(next);
              reorder.mutate(next.map((r) => r.id));
            }}
          >
            {(_id, i, { handle }) => renderRow(rows[i], handle)}
          </SortableList>
        </div>
      ) : (
        <div className="adm-card overflow-hidden">{rows.map((r) => <div key={r.id}>{renderRow(r)}</div>)}</div>
      )}
      {meta && !cfg.reorder && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={(p) => setParam('page', String(p))} />}
      {meta && cfg.reorder && <p className="mt-3 text-xs text-adm-muted">{meta.total} total</p>}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger={confirm?.action === 'delete'}
        loading={del.isPending || setStatus.isPending}
        title={confirm?.action === 'delete' ? `Delete “${String(confirm.row[cfg.titleField] ?? '')}”?` : `Archive “${String(confirm?.row[cfg.titleField] ?? '')}”?`}
        body={confirm?.action === 'delete' ? 'This permanently deletes the item. Pages that showed it will simply skip it. Consider archiving instead — archived items can be restored.' : 'Archived items are hidden from the website and from this list (use the “Archived” filter to find them). You can restore them at any time.'}
        confirmLabel={confirm?.action === 'delete' ? 'Delete permanently' : 'Archive'}
        onConfirm={() => confirm && (confirm.action === 'delete' ? del.mutate(confirm.row) : setStatus.mutate({ row: confirm.row, s: 'ARCHIVED' }))}
      />
    </div>
  );
}
