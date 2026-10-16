import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TASK_STATUSES } from '@maison/shared';
import { AlertCircle, ArrowDown, ArrowUp, Check, Diamond, Eye, GripVertical, Link2, ListChecks, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, titleCase } from '@/lib/format';
import { Card, Select } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { Task } from '../types';
import { useRefreshBooking } from '../shared/hooks';
import { LoadError, ProgressBar, SectionEmpty, SkeletonRows } from '../shared/ui';
import { STATUS_LABEL, TaskDrawer } from './TaskDrawer';
import { ApplyTemplateModal } from './ApplyTemplateModal';

export const tasksKey = (bookingId: string) => ['booking-tasks', bookingId] as const;
const PRIORITY_TONE: Record<string, string> = { LOW: 'text-adm-muted', MEDIUM: 'text-adm-ink', HIGH: 'text-amber-700', URGENT: 'text-red-700' };

interface Progress {
  done: number;
  total: number;
  overdue: number;
  percent: number;
  milestones: { done: number; total: number };
  byPhase: { phase: string; done: number; total: number; overdue: number; percent: number }[];
}

export default function TasksTab({ booking: b }: TabProps) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const refreshBooking = useRefreshBooking(b.id);
  const manage = can('tasks.manage');
  const [sp, setSp] = useSearchParams();
  const [drawer, setDrawer] = useState<{ task: Task | null; phase?: string } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'mine' | 'overdue'>('all');
  const { user } = useAuth();

  const list = useQuery({ queryKey: tasksKey(b.id), queryFn: () => api.getPaged<Task[]>('/admin/tasks', { bookingId: b.id }) });
  const progress = useQuery({ queryKey: ['booking-task-progress', b.id], queryFn: () => api.get<Progress>('/admin/tasks/progress', { bookingId: b.id }) });
  const tasks = useMemo(() => list.data?.data ?? [], [list.data]);
  const phases = useMemo(() => (list.data?.meta?.phases as string[] | undefined) ?? [], [list.data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: tasksKey(b.id) });
    qc.invalidateQueries({ queryKey: ['booking-task-progress', b.id] });
    refreshBooking();
  };

  // ?task=<id> deep link (from notifications) opens the drawer.
  const deep = sp.get('task');
  useEffect(() => {
    if (!deep || !tasks.length) return;
    const t = tasks.find((x) => x.id === deep);
    if (t) setDrawer({ task: t });
  }, [deep, tasks]);
  const closeDrawer = () => {
    setDrawer(null);
    if (deep) {
      const n = new URLSearchParams(sp);
      n.delete('task');
      setSp(n, { replace: true });
    }
  };

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.patch<Task>(`/admin/tasks/${v.id}`, { status: v.status }),
    onSuccess: () => refresh(),
    onError: (err) => toast.error('Status not changed', errorMessage(err)),
  });
  const reorder = useMutation({
    mutationFn: (v: { ids: string[]; phase: string }) => api.post('/admin/tasks/reorder', { bookingId: b.id, ids: v.ids, phase: v.phase }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: tasksKey(b.id) });
      const prev = qc.getQueryData(tasksKey(b.id));
      qc.setQueryData<{ data: Task[]; meta?: unknown }>(tasksKey(b.id), (old) => {
        if (!old) return old;
        // Keep other phases in place; refill this phase's slots in the new order.
        const inPhase = new Set(v.ids);
        const byId = new Map(old.data.map((t) => [t.id, t]));
        let k = 0;
        const data = old.data.map((t) => {
          if (!inPhase.has(t.id)) return t;
          const next = byId.get(v.ids[k])!;
          return { ...next, sortOrder: k++ };
        });
        return { ...old, data };
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tasksKey(b.id), ctx.prev);
      toast.error('Could not reorder', errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKey(b.id) }),
  });

  const visible = tasks.filter((t) => (filter === 'open' ? t.status !== 'DONE' : filter === 'mine' ? t.assigneeId === user?.id : filter === 'overdue' ? t.overdue : true));
  const groups = useMemo(() => {
    const names = [...phases, ...[...new Set(tasks.map((t) => t.phase))].filter((p) => !phases.includes(p))];
    return names.map((phase) => ({ phase, tasks: visible.filter((t) => t.phase === phase) })).filter((g) => g.tasks.length > 0);
  }, [phases, tasks, visible]);

  if (list.isError) return <LoadError error={list.error} onRetry={() => list.refetch()} />;
  const p = progress.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="adm-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Planning progress</p>
            {p && (
              <p className="text-xs text-adm-muted">
                <span className="font-medium text-adm-ink tabular-nums">
                  {p.done}/{p.total}
                </span>{' '}
                tasks · {p.milestones.done}/{p.milestones.total} milestones
                {p.overdue > 0 && <span className="ml-2 font-medium text-red-700">{p.overdue} overdue</span>}
              </p>
            )}
          </div>
          <ProgressBar value={p?.done ?? 0} total={p?.total ?? 0} className="mt-3" label="Tasks done" />
          {p && p.byPhase.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {p.byPhase.map((ph) => (
                <div key={ph.phase} className="min-w-0">
                  <div className="flex justify-between gap-2 text-[11px] text-adm-muted">
                    <span className="truncate">{ph.phase}</span>
                    <span className="tabular-nums">{ph.percent}%</span>
                  </div>
                  <ProgressBar value={ph.done} total={ph.total} className="mt-1" label={`${ph.phase} progress`} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filter tasks" className="!w-auto !py-1.5" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All tasks</option>
            <option value="open">Open</option>
            <option value="mine">Assigned to me</option>
            <option value="overdue">Overdue</option>
          </Select>
          {manage && b.status !== 'CANCELLED' && (
            <>
              <button className="adm-btn-secondary" onClick={() => setTemplatesOpen(true)}>
                <Sparkles className="h-4 w-4" /> Apply template
              </button>
              <button className="adm-btn-primary" onClick={() => setDrawer({ task: null })}>
                <Plus className="h-4 w-4" /> New task
              </button>
            </>
          )}
        </div>
      </div>

      {list.isLoading ? (
        <SkeletonRows rows={6} />
      ) : tasks.length === 0 ? (
        <div className="adm-card">
          <SectionEmpty
            icon={<ListChecks className="h-5 w-5" />}
            title="No tasks yet"
            body="Start from a planning template — tasks are scheduled relative to the event date — or add tasks one by one."
            action={
              manage && b.status !== 'CANCELLED' ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <button className="adm-btn-gold" onClick={() => setTemplatesOpen(true)}>
                    <Sparkles className="h-4 w-4" /> Apply a template
                  </button>
                  <button className="adm-btn-secondary" onClick={() => setDrawer({ task: null })}>
                    <Plus className="h-4 w-4" /> New task
                  </button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : groups.length === 0 ? (
        <p className="adm-card px-5 py-10 text-center text-sm text-adm-muted">No tasks match this filter.</p>
      ) : (
        groups.map((g) => (
          <PhaseGroup
            key={g.phase}
            phase={g.phase}
            tasks={g.tasks}
            manage={manage}
            canDrag={manage && filter === 'all'}
            onOpen={(t) => setDrawer({ task: t })}
            onAdd={() => setDrawer({ task: null, phase: g.phase })}
            onStatus={(id, status) => setStatus.mutate({ id, status })}
            onReorder={(ids) => reorder.mutate({ ids, phase: g.phase })}
          />
        ))
      )}

      <TaskDrawer open={!!drawer} onClose={closeDrawer} task={drawer?.task ?? null} defaultPhase={drawer?.phase ?? phases[0] ?? 'General'} booking={b} phases={phases} allTasks={tasks} onSaved={refresh} />
      <ApplyTemplateModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} booking={b} onApplied={refresh} />
    </div>
  );
}

function PhaseGroup({
  phase,
  tasks,
  manage,
  canDrag,
  onOpen,
  onAdd,
  onStatus,
  onReorder,
}: {
  phase: string;
  tasks: Task[];
  manage: boolean;
  canDrag: boolean;
  onOpen: (t: Task) => void;
  onAdd: () => void;
  onStatus: (id: string, status: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const done = tasks.filter((t) => t.status === 'DONE').length;
  const ids = tasks.map((t) => t.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  const move = (i: number, d: -1 | 1) => onReorder(arrayMove(ids, i, i + d));
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {phase}
          <span className="text-xs font-normal text-adm-muted tabular-nums">
            {done}/{tasks.length}
          </span>
        </span>
      }
      actions={
        manage ? (
          <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={onAdd} aria-label={`Add task to ${phase}`}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        ) : undefined
      }
      bodyClassName="p-0"
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-adm-line">
            {tasks.map((t, i) => (
              <TaskRow key={t.id} task={t} manage={manage} canDrag={canDrag} first={i === 0} last={i === tasks.length - 1} onOpen={() => onOpen(t)} onStatus={(s) => onStatus(t.id, s)} onMove={(d) => move(i, d)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </Card>
  );
}

function TaskRow({ task: t, manage, canDrag, first, last, onOpen, onStatus, onMove }: { task: Task; manage: boolean; canDrag: boolean; first: boolean; last: boolean; onOpen: () => void; onStatus: (s: string) => void; onMove: (d: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !canDrag });
  const checklistDone = t.checklist.filter((c) => c.done).length;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex items-center gap-2 bg-white px-3 py-3 sm:px-4', isDragging && 'relative z-10 shadow-lg', t.overdue && 'bg-red-50/40', t.status === 'DONE' && 'bg-adm-bg/30')}
    >
      {canDrag && (
        <button className="hidden cursor-grab touch-none rounded p-1 text-adm-muted hover:bg-adm-bg active:cursor-grabbing sm:block" aria-label={`Drag to reorder ${t.title}`} {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border transition', t.status === 'DONE' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-adm-line hover:border-adm-gold')}
        aria-label={t.status === 'DONE' ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
        disabled={!manage}
        onClick={() => onStatus(t.status === 'DONE' ? 'TODO' : 'DONE')}
      >
        {t.status === 'DONE' && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className={cn('flex items-center gap-1.5 text-sm font-medium', t.status === 'DONE' && 'text-adm-muted line-through')}>
          {t.isMilestone && <Diamond className="h-3.5 w-3.5 shrink-0 fill-adm-gold text-adm-gold" aria-label="Milestone" />}
          <span className="truncate">{t.title}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-adm-muted">
          {t.dueAt && (
            <span className={cn(t.overdue && 'font-medium text-red-700')}>
              {t.overdue && <AlertCircle className="mr-0.5 inline h-3 w-3" />}Due {fmtDate(t.dueAt)}
            </span>
          )}
          <span>{t.assignee?.name ?? 'Unassigned'}</span>
          <span className={PRIORITY_TONE[t.priority]}>{titleCase(t.priority)}</span>
          {t.checklist.length > 0 && (
            <span>
              <ListChecks className="mr-0.5 inline h-3 w-3" />
              {checklistDone}/{t.checklist.length}
            </span>
          )}
          {!!t._count?.comments && (
            <span>
              <MessageSquare className="mr-0.5 inline h-3 w-3" />
              {t._count.comments}
            </span>
          )}
          {t.dependsOn && (
            <span className={cn(t.blockedByDependency && 'text-amber-700')}>
              <Link2 className="mr-0.5 inline h-3 w-3" />
              After “{t.dependsOn.title}”
            </span>
          )}
          {t.visibleToClient && (
            <span>
              <Eye className="mr-0.5 inline h-3 w-3" />
              Client
            </span>
          )}
        </p>
      </button>
      {manage ? (
        <Select aria-label={`Status of ${t.title}`} className="hidden !w-32 !py-1 text-xs sm:block" value={t.status} onChange={(e) => onStatus(e.target.value)}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      ) : (
        <span className="text-xs text-adm-muted">{STATUS_LABEL[t.status]}</span>
      )}
      {canDrag && (
        <div className="flex flex-col">
          <button className="rounded p-0.5 text-adm-muted hover:text-adm-ink disabled:opacity-30" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${t.title} up`}>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-0.5 text-adm-muted hover:text-adm-ink disabled:opacity-30" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${t.title} down`}>
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

