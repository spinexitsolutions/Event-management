import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Field, Input, PageHeader, Pagination, SearchInput, Select } from '@/admin/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, fromNow, titleCase } from '@/lib/format';
import { AdmError, RequirePerm, useStaffDirectory } from '../shared';

interface AuditRow {
  id: string;
  actorId: string | null;
  actorName: string;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes: unknown;
  ip: string | null;
  createdAt: string;
}
interface AuditMeta {
  page: number;
  pages: number;
  total: number;
  entityTypes: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'string' ? v || '""' : JSON.stringify(v));

/** Flattens nested objects into dotted paths (arrays stay whole). */
function flatten(o: unknown, prefix = '', out: Record<string, unknown> = {}) {
  if (isObj(o)) for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = o;
  return out;
}

/** Normalises the different `changes` shapes the server writes into from/to rows. */
function changeRows(changes: unknown): { path: string; from: unknown; to: unknown }[] | null {
  if (!isObj(changes)) return null;
  const vals = Object.values(changes);
  if (vals.length && vals.every((v) => isObj(v) && 'from' in v && 'to' in v)) return Object.entries(changes).map(([path, v]) => ({ path, from: (v as { from: unknown }).from, to: (v as { to: unknown }).to }));
  if ('before' in changes && 'after' in changes) {
    const a = flatten(changes.before);
    const b = flatten(changes.after);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((path) => ({ path, from: a[path], to: b[path] }));
  }
  return null;
}

function Changes({ changes }: { changes: unknown }) {
  const rows = changeRows(changes);
  if (changes === null || changes === undefined) return <p className="text-xs text-adm-muted">No field-level changes recorded.</p>;
  if (rows && rows.length === 0) return <p className="text-xs text-adm-muted">Saved without any value changes.</p>;
  if (rows)
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-adm-muted">
              <th className="py-1 pr-4 font-medium">Field</th>
              <th className="py-1 pr-4 font-medium">Before</th>
              <th className="py-1 font-medium">After</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.path} className="align-top">
                <td className="py-1 pr-4 font-sans font-medium text-adm-ink">{r.path}</td>
                <td className="max-w-[320px] break-words py-1 pr-4">
                  <span className="rounded bg-red-50 px-1 text-red-800">{show(r.from)}</span>
                </td>
                <td className="max-w-[320px] break-words py-1">
                  <span className="rounded bg-emerald-50 px-1 text-emerald-800">{show(r.to)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-mono text-xs ring-1 ring-adm-line">{JSON.stringify(changes, null, 2)}</pre>;
}

function AuditScreen() {
  const staff = useStaffDirectory();
  const [q, setQ] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const query = { q, entityType, actorId, from, to, page, limit: 50 };
  const list = useQuery({ queryKey: ['audit', query], queryFn: () => api.getPaged<AuditRow[]>('/admin/staff/audit', query), placeholderData: keepPreviousData });
  const meta = list.data?.meta as unknown as AuditMeta | undefined;
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every significant change — who did what, when, and what changed." />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_150px_150px]">
        <SearchInput value={q} onChange={(v) => reset(() => setQ(v))} placeholder="Search summary, action, actor or id…" />
        <Select value={entityType} onChange={(e) => reset(() => setEntityType(e.target.value))} aria-label="Entity type">
          <option value="">All record types</option>
          {meta?.entityTypes?.map((t) => (
            <option key={t} value={t}>
              {titleCase(t.replace(/([a-z])([A-Z])/g, '$1_$2'))}
            </option>
          ))}
        </Select>
        <Select value={actorId} onChange={(e) => reset(() => setActorId(e.target.value))} aria-label="Actor">
          <option value="">Anyone</option>
          {staff.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Field>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => reset(() => setFrom(e.target.value))} aria-label="From date" />
        </Field>
        <Field>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => reset(() => setTo(e.target.value))} aria-label="To date" />
        </Field>
      </div>
      {list.isError ? (
        <AdmError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <div className="adm-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead className="bg-adm-bg/60">
                <tr>
                  <th className="w-8" />
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th className="hidden md:table-cell">Record</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}>
                          <div className="h-4 animate-pulse rounded bg-adm-line/70" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {list.data?.data.map((r) => {
                  const isOpen = open.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer" onClick={() => toggle(r.id)}>
                        <td>
                          <button className="text-adm-muted" aria-expanded={isOpen} aria-label={isOpen ? 'Hide changes' : 'Show changes'} onClick={(e) => (e.stopPropagation(), toggle(r.id))}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap" title={fmtDateTime(r.createdAt)}>
                          {fromNow(r.createdAt)}
                        </td>
                        <td className="whitespace-nowrap">{r.actorName}</td>
                        <td>
                          <code className="rounded bg-adm-bg px-1.5 py-0.5 text-xs">{r.action}</code>
                        </td>
                        <td className="hidden whitespace-nowrap text-xs text-adm-muted md:table-cell">
                          {r.entityType}
                          {r.entityId && <span className="block font-mono">{r.entityId.slice(0, 14)}</span>}
                        </td>
                        <td className="max-w-[420px]">
                          <span className="line-clamp-2">{r.summary || '—'}</span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className={cn('bg-adm-bg/50 hover:bg-adm-bg/50')}>
                          <td />
                          <td colSpan={5} className="py-4">
                            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-adm-muted">
                              <span>{fmtDateTime(r.createdAt)}</span>
                              {r.actor && <span>{r.actor.email}</span>}
                              {r.ip && <span>IP {r.ip}</span>}
                              {r.entityId && <span className="font-mono">id {r.entityId}</span>}
                            </div>
                            <Changes changes={r.changes} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!list.isLoading && !list.data?.data.length && <p className="px-6 py-14 text-center text-sm text-adm-muted">No audit entries match these filters.</p>}
        </div>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
    </div>
  );
}

export default function AuditPage() {
  return (
    <RequirePerm any={['audit.view']}>
      <AuditScreen />
    </RequirePerm>
  );
}
