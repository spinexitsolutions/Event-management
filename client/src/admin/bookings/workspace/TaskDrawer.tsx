import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TASK_PRIORITIES, TASK_STATUSES } from '@maison/shared';
import { Plus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, fromNow, titleCase } from '@/lib/format';
import { ConfirmDialog, Field, Input, Select, Textarea, Toggle } from '@/admin/ui';
import type { BookingDetail, Task, TaskComment } from '../types';
import { fieldErrors, fromLocalInput, isConflict, toLocalInput, useStaff } from '../shared/hooks';
import { Alert } from '../shared/ui';

export const STATUS_LABEL: Record<string, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', BLOCKED: 'Blocked', DONE: 'Done' };

interface Form {
  title: string;
  description: string;
  phase: string;
  assigneeId: string;
  dueAt: string;
  priority: string;
  status: string;
  isMilestone: boolean;
  visibleToClient: boolean;
  dependsOnId: string;
  checklist: { id?: string; label: string; done: boolean }[];
}

export function TaskDrawer({
  open,
  onClose,
  task,
  defaultPhase,
  booking,
  phases,
  allTasks,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  defaultPhase: string;
  booking: BookingDetail;
  phases: string[];
  allTasks: Task[];
  onSaved: () => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const staff = useStaff();
  const manage = can('tasks.manage');
  const [f, setF] = useState<Form | null>(null);
  const [newItem, setNewItem] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [customPhase, setCustomPhase] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setNewItem('');
    const phase = task?.phase ?? defaultPhase;
    setCustomPhase(!!phase && !phases.includes(phase));
    setF({
      title: task?.title ?? '',
      description: task?.description ?? '',
      phase,
      assigneeId: task ? (task.assigneeId ?? '') : (booking.managerId ?? ''),
      dueAt: toLocalInput(task?.dueAt),
      priority: task?.priority ?? 'MEDIUM',
      status: task?.status ?? 'TODO',
      isMilestone: task?.isMilestone ?? false,
      visibleToClient: task?.visibleToClient ?? false,
      dependsOnId: task?.dependsOnId ?? '',
      checklist: task?.checklist.map((c) => ({ ...c })) ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: f!.title.trim(),
        description: f!.description.trim(),
        phase: f!.phase.trim() || 'General',
        assigneeId: f!.assigneeId || null,
        dueAt: fromLocalInput(f!.dueAt),
        priority: f!.priority,
        status: f!.status,
        isMilestone: f!.isMilestone,
        visibleToClient: f!.visibleToClient,
        dependsOnId: f!.dependsOnId || null,
        checklist: f!.checklist.filter((c) => c.label.trim()).map((c) => ({ ...(c.id ? { id: c.id } : {}), label: c.label.trim(), done: c.done })),
      };
      return task ? api.patch<Task>(`/admin/tasks/${task.id}`, body) : api.post<Task>('/admin/tasks', { ...body, bookingId: booking.id });
    },
    onSuccess: () => {
      toast.success(task ? 'Task saved' : 'Task created');
      onSaved();
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      setServerError(isConflict(err) ? errorMessage(err) : errorMessage(err));
    },
  });
  const toggle = useMutation({
    mutationFn: (v: { itemId: string; done: boolean }) => api.post<Task>(`/admin/tasks/${task!.id}/checklist/${v.itemId}/toggle`, { done: v.done }),
    onSuccess: () => onSaved(),
    onError: (err, v) => {
      setF((x) => x && { ...x, checklist: x.checklist.map((c) => (c.id === v.itemId ? { ...c, done: !v.done } : c)) });
      toast.error('Checklist not updated', errorMessage(err));
    },
  });
  const del = useMutation({
    mutationFn: () => api.delete(`/admin/tasks/${task!.id}`),
    onSuccess: () => {
      toast.success('Task deleted');
      setConfirmDelete(false);
      onSaved();
      onClose();
    },
    onError: (err) => toast.error('Could not delete', errorMessage(err)),
  });

  if (!f) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => x && { ...x, [k]: v });
  const submit = () => {
    if (!f.title.trim()) return setErrors({ title: 'Title is required' });
    setServerError(null);
    save.mutate();
  };
  const phaseOptions = [...phases, ...(f.phase && !phases.includes(f.phase) && !customPhase ? [f.phase] : [])];
  const persistedItem = (c: Form['checklist'][number]) => !!task && !!c.id && task.checklist.some((x) => x.id === c.id);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        side
        title={task ? 'Task' : 'New task'}
        footer={
          manage ? (
            <>
              {task && (
                <button className="adm-btn-ghost mr-auto text-red-700" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
              <button className="adm-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="adm-btn-primary" onClick={submit} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : task ? 'Save task' : 'Create task'}
              </button>
            </>
          ) : undefined
        }
      >
        <fieldset disabled={!manage} className="space-y-4">
          <Field label="Title" required error={errors.title}>
            <Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} invalid={!!errors.title} />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={8000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phase">
              {customPhase ? (
                <div className="flex gap-2">
                  <Input value={f.phase} onChange={(e) => set('phase', e.target.value)} maxLength={60} placeholder="Custom phase" />
                  <button type="button" className="adm-btn-ghost !px-2" onClick={() => (setCustomPhase(false), set('phase', phases[0] ?? 'General'))} aria-label="Use a standard phase">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Select
                  value={f.phase}
                  onChange={(e) => {
                    if (e.target.value === '__custom') {
                      setCustomPhase(true);
                      set('phase', '');
                    } else set('phase', e.target.value);
                  }}
                >
                  {phaseOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="__custom">Custom phase…</option>
                </Select>
              )}
            </Field>
            <Field label="Assignee">
              <Select value={f.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
                <option value="">Unassigned</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {task?.assignee && !staff.data?.some((s) => s.id === task.assignee!.id) && <option value={task.assignee.id}>{task.assignee.name}</option>}
              </Select>
            </Field>
            <Field label="Due" error={errors.dueAt}>
              <Input type="datetime-local" value={f.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
            </Field>
            <Field label="Priority">
              <Select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={f.status} onChange={(e) => set('status', e.target.value)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Depends on" hint="Can’t be marked done until this task is done.">
              <Select value={f.dependsOnId} onChange={(e) => set('dependsOnId', e.target.value)}>
                <option value="">No dependency</option>
                {allTasks
                  .filter((t) => t.id !== task?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.status === 'DONE' ? ' ✓' : ''}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <Toggle checked={f.isMilestone} onChange={(v) => set('isMilestone', v)} label="Milestone" disabled={!manage} />
            <Toggle checked={f.visibleToClient} onChange={(v) => set('visibleToClient', v)} label="Visible to client" disabled={!manage} />
          </div>

          <div>
            <p className="adm-label">
              Checklist{' '}
              {f.checklist.length > 0 && (
                <span className="tabular-nums">
                  ({f.checklist.filter((c) => c.done).length}/{f.checklist.length})
                </span>
              )}
            </p>
            <ul className="space-y-1.5">
              {f.checklist.map((c, i) => (
                <li key={c.id ?? `n${i}`} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-adm-line bg-white bg-center bg-no-repeat transition checked:border-adm-gold checked:bg-adm-gold checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4 8.5l2.5 2.5L12 5.5%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22/></svg>')] focus-visible:outline focus-visible:outline-2 focus-visible:outline-adm-gold"
                    checked={c.done}
                    aria-label={`Done: ${c.label}`}
                    onChange={(e) => {
                      const done = e.target.checked;
                      setF((x) => x && { ...x, checklist: x.checklist.map((y, j) => (j === i ? { ...y, done } : y)) });
                      if (persistedItem(c)) toggle.mutate({ itemId: c.id!, done });
                    }}
                  />
                  <Input className={cn('py-1.5', c.done && 'text-adm-muted line-through')} value={c.label} aria-label={`Checklist item ${i + 1}`} onChange={(e) => setF((x) => x && { ...x, checklist: x.checklist.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} maxLength={300} />
                  <button type="button" className="adm-btn-ghost !px-2 !py-1" onClick={() => setF((x) => x && { ...x, checklist: x.checklist.filter((_, j) => j !== i) })} aria-label={`Remove ${c.label}`}>
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            {manage && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newItem.trim()) return;
                  setF((x) => x && { ...x, checklist: [...x.checklist, { label: newItem.trim(), done: false }] });
                  setNewItem('');
                }}
              >
                <Input className="!py-1.5" placeholder="Add checklist item" value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={300} aria-label="New checklist item" />
                <button className="adm-btn-secondary !px-2.5 !py-1.5" aria-label="Add checklist item">
                  <Plus className="h-4 w-4" />
                </button>
              </form>
            )}
            {task && <p className="mt-1.5 text-xs text-adm-muted">Ticking an item saves immediately. Renamed, added or removed items are saved with the task.</p>}
          </div>
        </fieldset>
        {serverError && (
          <Alert tone="error" className="mt-4">
            {serverError}
          </Alert>
        )}
        {task && <Comments taskId={task.id} canWrite={manage} />}
      </Modal>
      <ConfirmDialog open={confirmDelete} title="Delete task?" body={`“${task?.title}” and its comments will be removed.`} confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => del.mutate()} onClose={() => setConfirmDelete(false)} />
    </>
  );
}

function Comments({ taskId, canWrite }: { taskId: string; canWrite: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const q = useQuery({ queryKey: ['task-comments', taskId], queryFn: () => api.get<TaskComment[]>(`/admin/tasks/${taskId}/comments`) });
  const add = useMutation({
    mutationFn: () => api.post<TaskComment>(`/admin/tasks/${taskId}/comments`, { body: body.trim() }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] });
    },
    onError: (err) => toast.error('Comment not posted', errorMessage(err)),
  });
  return (
    <section className="mt-6 border-t border-adm-line pt-5" aria-label="Comments">
      <h3 className="text-sm font-semibold">Comments</h3>
      {q.isLoading ? (
        <div className="mt-3 h-12 animate-pulse rounded-lg bg-adm-line/60" />
      ) : q.isError ? (
        <p className="mt-2 text-sm text-red-700">{errorMessage(q.error)}</p>
      ) : q.data?.length ? (
        <ul className="mt-3 space-y-3">
          {q.data.map((c) => (
            <li key={c.id} className="rounded-lg bg-adm-bg/70 px-3 py-2">
              <p className="text-xs text-adm-muted">
                <span className="font-medium text-adm-ink">{c.authorName}</span> · <time title={fmtDateTime(c.createdAt)}>{fromNow(c.createdAt)}</time>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-adm-muted">No comments yet.</p>
      )}
      {canWrite && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate();
          }}
        >
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment… The assignee is notified." aria-label="New comment" maxLength={4000} />
          <button className="adm-btn-primary !px-3" disabled={!body.trim() || add.isPending} aria-label="Post comment">
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </section>
  );
}
