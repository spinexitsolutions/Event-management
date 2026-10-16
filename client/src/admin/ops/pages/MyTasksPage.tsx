import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, CheckCircle2, Flag, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, PageHeader, StatusBadge, Toggle } from '@/admin/ui';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fromNow, titleCase } from '@/lib/format';
import { addDaysLocal, AdmError, fmtTime, RequirePerm, SkeletonRows, startOfDay } from '../shared';

interface MyTask {
  id: string;
  title: string;
  phase: string;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueAt: string | null;
  isMilestone: boolean;
  overdue: boolean;
  bookingId: string;
  checklist: { id: string; label: string; done: boolean }[];
  dependsOn: { id: string; title: string; status: string } | null;
  booking: { id: string; reference: string; title: string; eventDate: string | null };
  _count?: { comments: number };
}

type Group = 'overdue' | 'today' | 'week' | 'later' | 'done';
const GROUPS: { key: Group; label: string; hint: string }[] = [
  { key: 'overdue', label: 'Overdue', hint: 'Past their due time' },
  { key: 'today', label: 'Today', hint: 'Due before midnight' },
  { key: 'week', label: 'This week', hint: 'Due in the next 7 days' },
  { key: 'later', label: 'Later', hint: 'Further out or without a due date' },
  { key: 'done', label: 'Completed', hint: 'Recently finished' },
];

const PRIORITY_TONE = { LOW: 'gray', MEDIUM: 'blue', HIGH: 'amber', URGENT: 'red' } as const;

function groupOf(t: MyTask): Group {
  if (t.status === 'DONE') return 'done';
  if (t.overdue) return 'overdue';
  if (!t.dueAt) return 'later';
  const due = new Date(t.dueAt);
  const today = startOfDay(new Date());
  if (due < addDaysLocal(today, 1)) return 'today';
  if (due < addDaysLocal(today, 7)) return 'week';
  return 'later';
}

function TasksScreen() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [includeDone, setIncludeDone] = useState(false);
  const q = useQuery({ queryKey: ['my-tasks', includeDone], queryFn: () => api.get<MyTask[]>('/admin/tasks/mine', { includeDone: includeDone ? 'true' : undefined, limit: 300 }) });
  const [pending, setPending] = useState<string | null>(null);
  const complete = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.patch<MyTask>(`/admin/tasks/${id}`, { status: done ? 'DONE' : 'TODO' }),
    onMutate: ({ id }) => setPending(id),
    onSettled: () => setPending(null),
    onSuccess: (_r, v) => {
      toast.success(v.done ? 'Task completed' : 'Task reopened');
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
      qc.invalidateQueries({ queryKey: ['calendar-feed'] });
    },
    onError: (err) => toast.error(err instanceof ApiError && err.status === 409 ? 'Blocked by a dependency' : 'Could not update the task', errorMessage(err)),
  });
  const canEdit = can('tasks.manage');
  const tasks = q.data ?? [];
  const grouped = GROUPS.map((g) => ({ ...g, items: tasks.filter((t) => groupOf(t) === g.key) })).filter((g) => g.items.length);

  return (
    <div>
      <PageHeader
        title="My tasks"
        subtitle="Everything assigned to you across events, ordered by due date."
        actions={<Toggle checked={includeDone} onChange={setIncludeDone} label="Show completed" />}
      >
        {!q.isLoading && !q.isError && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {GROUPS.filter((g) => g.key !== 'done').map((g) => {
              const n = tasks.filter((t) => groupOf(t) === g.key).length;
              return (
                <a key={g.key} href={`#group-${g.key}`} className={cn('rounded-full border px-3 py-1', g.key === 'overdue' && n ? 'border-red-200 bg-red-50 text-red-700' : 'border-adm-line bg-white text-adm-muted')}>
                  {g.label} <span className="ml-1 font-semibold tabular-nums">{n}</span>
                </a>
              );
            })}
          </div>
        )}
      </PageHeader>

      {q.isLoading ? (
        <SkeletonRows rows={6} />
      ) : q.isError ? (
        <AdmError error={q.error} onRetry={() => q.refetch()} />
      ) : !grouped.length ? (
        <div className="adm-card flex flex-col items-center px-6 py-16 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
          <p className="mt-3 font-medium">You’re all caught up</p>
          <p className="mt-1 text-sm text-adm-muted">No open tasks are assigned to you right now.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.key} id={`group-${g.key}`} aria-labelledby={`h-${g.key}`}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 id={`h-${g.key}`} className={cn('text-sm font-semibold', g.key === 'overdue' && 'text-red-700')}>
                  {g.label}
                </h2>
                <span className="text-xs text-adm-muted">
                  {g.items.length} · {g.hint}
                </span>
              </div>
              <ul className="adm-card divide-y divide-adm-line/70 overflow-hidden">
                {g.items.map((t) => {
                  const done = t.status === 'DONE';
                  const blocked = !!t.dependsOn && t.dependsOn.status !== 'DONE';
                  const checklistDone = t.checklist.filter((c) => c.done).length;
                  return (
                    <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                      <button
                        type="button"
                        disabled={!canEdit || pending === t.id}
                        onClick={() => complete.mutate({ id: t.id, done: !done })}
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/50 disabled:opacity-50',
                          done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-adm-muted/50 hover:border-emerald-600 hover:text-emerald-600',
                          pending === t.id && 'animate-pulse',
                        )}
                        aria-label={done ? `Reopen “${t.title}”` : `Mark “${t.title}” complete`}
                        title={blocked ? `Waiting on “${t.dependsOn!.title}”` : undefined}
                      >
                        <Check className={cn('h-3 w-3', !done && 'opacity-0')} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/admin/bookings/${t.bookingId}?tab=tasks&task=${t.id}`} className={cn('font-medium hover:underline', done && 'text-adm-muted line-through')}>
                            {t.title}
                          </Link>
                          {t.isMilestone && (
                            <Badge tone="gold">
                              <Flag className="mr-1 h-3 w-3" /> Milestone
                            </Badge>
                          )}
                          {t.priority !== 'MEDIUM' && <Badge tone={PRIORITY_TONE[t.priority]}>{titleCase(t.priority)}</Badge>}
                          {t.status !== 'TODO' && t.status !== 'DONE' && <StatusBadge status={t.status} />}
                        </div>
                        <p className="mt-0.5 text-xs text-adm-muted">
                          <Link to={`/admin/bookings/${t.booking.id}?tab=tasks`} className="hover:text-adm-ink hover:underline">
                            {t.booking.reference} · {t.booking.title}
                          </Link>
                          {' · '}
                          {t.phase}
                          {t.checklist.length > 0 && ` · ${checklistDone}/${t.checklist.length} checklist`}
                        </p>
                        {blocked && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
                            <Link2 className="h-3 w-3" aria-hidden /> Depends on “{t.dependsOn!.title}”
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {t.dueAt ? (
                          <>
                            <p className={cn('font-medium tabular-nums', t.overdue ? 'text-red-700' : 'text-adm-ink')}>{fmtDate(t.dueAt, { day: 'numeric', month: 'short' })}</p>
                            <p className="text-adm-muted">{new Date(t.dueAt).getHours() || new Date(t.dueAt).getMinutes() ? fmtTime(new Date(t.dueAt)) : fromNow(t.dueAt)}</p>
                          </>
                        ) : (
                          <p className="text-adm-muted">No due date</p>
                        )}
                        <Link to={`/admin/bookings/${t.bookingId}?tab=tasks&task=${t.id}`} className="mt-1 inline-flex items-center gap-0.5 text-adm-gold hover:underline" aria-label={`Open ${t.title} in booking`}>
                          Open <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <RequirePerm any={['tasks.manage', 'bookings.view']}>
      <TasksScreen />
    </RequirePerm>
  );
}
