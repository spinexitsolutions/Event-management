import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TASK_PRIORITIES, type TaskPriority } from '@maison/shared';
import { ArrowDown, ArrowDownUp, ArrowUp, Download, Eye, Flag, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, ConfirmDialog, Field, Input, PageHeader, Select } from '@/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, apiRequest, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { titleCase } from '@/lib/format';
import { AddRowButton, AdmError, ChipsInput, fieldErrorsOf, RequirePerm, SkeletonRows } from '../shared';

interface TemplateItem {
  title: string;
  phase: string;
  offsetDays: number;
  priority: TaskPriority;
  isMilestone: boolean;
  visibleToClient: boolean;
  checklist: string[];
}
interface Template {
  id: string;
  name: string;
  eventType: string;
  items: TemplateItem[];
  updatedAt: string;
}
interface TemplatesMeta {
  defaults: { name: string; eventType: string; taskCount: number }[];
  phases: string[];
}

const blankItem = (phase: string): TemplateItem => ({ title: '', phase, offsetDays: -7, priority: 'MEDIUM', isMilestone: false, visibleToClient: false, checklist: [] });
const offsetLabel = (d: number) => (d === 0 ? 'Event day' : d < 0 ? `${-d} day${d === -1 ? '' : 's'} before` : `${d} day${d === 1 ? '' : 's'} after`);

function TemplateEditor({ open, template, phases, onClose }: { open: boolean; template: Template | null; phases: string[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(template?.name ?? '');
  const [eventType, setEventType] = useState(template?.eventType ?? '');
  const [items, setItems] = useState<TemplateItem[]>(template?.items ?? [blankItem(phases[0] ?? 'General')]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), eventType: eventType.trim(), items: items.map((i) => ({ ...i, title: i.title.trim(), phase: i.phase.trim() || 'General' })) };
      return template ? api.put(`/admin/tasks/templates/${template.id}`, body) : api.post('/admin/tasks/templates', body);
    },
    onSuccess: () => {
      toast.success(template ? 'Template saved' : 'Template created');
      qc.invalidateQueries({ queryKey: ['task-templates'] });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not save the template', errorMessage(err));
    },
  });
  const upd = (i: number, patch: Partial<TemplateItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const n = [...xs];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x);
      return n;
    });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!items.length) errs.items = 'Add at least one task';
    items.forEach((it, i) => {
      if (!it.title.trim()) errs[`items.${i}.title`] = 'Title is required';
      if (!Number.isInteger(it.offsetDays) || it.offsetDays < -730 || it.offsetDays > 365) errs[`items.${i}.offsetDays`] = 'Between -730 and 365';
    });
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error('Please fix the highlighted tasks');
    save.mutate();
  };
  const phaseOptions = [...new Set([...phases, 'General', ...items.map((i) => i.phase).filter(Boolean)])];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={template ? `Edit “${template.name}”` : 'New task template'}
      size="xl"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" type="submit" form="tpl-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : template ? 'Save template' : 'Create template'}
          </button>
        </>
      }
    >
      <form id="tpl-form" onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template name" required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} invalid={!!errors.name} placeholder="e.g. Destination wedding — 3 days" />
          </Field>
          <Field label="Event type" error={errors.eventType} hint="Helps planners pick the right template.">
            <Input value={eventType} onChange={(e) => setEventType(e.target.value)} maxLength={80} placeholder="e.g. Wedding" />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              Tasks <span className="font-normal text-adm-muted">· {items.length}</span>
            </p>
            <div className="flex gap-1">
              <button type="button" className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => setItems((xs) => [...xs].sort((a, b) => a.offsetDays - b.offsetDays))}>
                <ArrowDownUp className="h-3.5 w-3.5" /> Sort by timing
              </button>
              <AddRowButton
                disabled={items.length >= 300}
                onClick={() => {
                  setItems((xs) => [...xs, blankItem(xs[xs.length - 1]?.phase ?? phases[0] ?? 'General')]);
                  setExpanded(items.length);
                }}
              >
                Add task
              </AddRowButton>
            </div>
          </div>
          {errors.items && <p className="mb-2 text-xs text-red-600">{errors.items}</p>}
          <p className="mb-3 text-xs text-adm-muted">Due dates are calculated from the event date when the template is applied to a booking (negative = before the event).</p>
          <ol className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className={cn('rounded-lg border border-adm-line', expanded === i && 'border-adm-gold/60 bg-[#FDFBF6]')}>
                <div className="grid gap-2 p-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_120px_110px_auto] md:items-start">
                  <Field error={errors[`items.${i}.title`]}>
                    <Input value={it.title} maxLength={200} placeholder="Task title" aria-label={`Task ${i + 1} title`} invalid={!!errors[`items.${i}.title`]} onChange={(e) => upd(i, { title: e.target.value })} />
                  </Field>
                  <div>
                    <Input value={it.phase} maxLength={60} list="phase-list" aria-label={`Task ${i + 1} phase`} onChange={(e) => upd(i, { phase: e.target.value })} />
                  </div>
                  <Field error={errors[`items.${i}.offsetDays`]} hint={offsetLabel(it.offsetDays)}>
                    <Input type="number" min={-730} max={365} value={it.offsetDays} aria-label={`Task ${i + 1} offset days`} onChange={(e) => upd(i, { offsetDays: Math.round(Number(e.target.value) || 0) })} />
                  </Field>
                  <Select value={it.priority} onChange={(e) => upd(i, { priority: e.target.value as TaskPriority })} aria-label={`Task ${i + 1} priority`} options={TASK_PRIORITIES.map((p) => ({ value: p, label: titleCase(p) }))} />
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" className={cn('adm-btn-ghost px-2 py-1 text-xs', expanded === i && 'text-adm-ink')} onClick={() => setExpanded(expanded === i ? null : i)} aria-expanded={expanded === i} aria-label={`More options for task ${i + 1}`}>
                      <ListChecks className="h-3.5 w-3.5" />
                      {it.checklist.length > 0 && <span className="tabular-nums">{it.checklist.length}</span>}
                      {it.isMilestone && <Flag className="h-3 w-3 text-adm-gold" />}
                      {it.visibleToClient && <Eye className="h-3 w-3 text-sky-600" />}
                    </button>
                    <button type="button" className="adm-btn-ghost px-1.5 py-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="adm-btn-ghost px-1.5 py-1" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="adm-btn-ghost px-1.5 py-1 text-red-600" disabled={items.length <= 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {expanded === i && (
                  <div className="grid gap-3 border-t border-adm-line/70 p-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-[#A98A4E]" checked={it.isMilestone} onChange={(e) => upd(i, { isMilestone: e.target.checked })} /> Milestone
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-[#A98A4E]" checked={it.visibleToClient} onChange={(e) => upd(i, { visibleToClient: e.target.checked })} /> Visible to client
                      </label>
                    </div>
                    <Field label="Checklist" hint="Press Enter after each item.">
                      <ChipsInput value={it.checklist} onChange={(c) => upd(i, { checklist: c })} placeholder="e.g. Contract signed" />
                    </Field>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <datalist id="phase-list">
            {phaseOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      </form>
    </Modal>
  );
}

function TemplatesScreen() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can('tasks.manage');
  const q = useQuery({ queryKey: ['task-templates'], queryFn: () => apiRequest<Template[]>('/admin/tasks/templates') });
  const meta = q.data?.meta as unknown as TemplatesMeta | undefined;
  const [editing, setEditing] = useState<{ template: Template | null } | null>(null);
  const [del, setDel] = useState<Template | null>(null);
  const install = useMutation({
    mutationFn: () => api.post<{ installed: number }>('/admin/tasks/templates/install-defaults'),
    onSuccess: (r) => {
      toast.success(r.installed ? `${r.installed} template${r.installed === 1 ? '' : 's'} installed` : 'All default templates are already installed');
      qc.invalidateQueries({ queryKey: ['task-templates'] });
    },
    onError: (err) => toast.error('Could not install templates', errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/tasks/templates/${id}`),
    onSuccess: () => {
      toast.success('Template deleted');
      setDel(null);
      qc.invalidateQueries({ queryKey: ['task-templates'] });
    },
    onError: (err) => toast.error('Could not delete', errorMessage(err)),
  });
  const templates = q.data?.data ?? [];
  const missing = meta?.defaults.filter((d) => !templates.some((t) => t.name === d.name)) ?? [];

  return (
    <div>
      <PageHeader
        back={{ to: '/admin/settings/business', label: 'Business settings' }}
        title="Task templates"
        subtitle="Reusable planning checklists. Apply one to a booking from its Tasks tab to create every task with due dates relative to the event."
        actions={
          canManage && (
            <>
              {missing.length > 0 && (
                <button className="adm-btn-secondary" onClick={() => install.mutate()} disabled={install.isPending}>
                  <Download className="h-4 w-4" /> {install.isPending ? 'Installing…' : `Install default templates (${missing.length})`}
                </button>
              )}
              <button className="adm-btn-primary" onClick={() => setEditing({ template: null })}>
                <Plus className="h-4 w-4" /> New template
              </button>
            </>
          )
        }
      />
      {q.isLoading ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <AdmError error={q.error} onRetry={() => q.refetch()} />
      ) : templates.length === 0 ? (
        <div className="adm-card flex flex-col items-center px-6 py-14 text-center">
          <ListChecks className="h-8 w-8 text-adm-gold" aria-hidden />
          <p className="mt-3 font-medium">No task templates yet</p>
          <p className="mt-1 max-w-md text-sm text-adm-muted">Start from our planning templates for weddings, corporate events, concerts and private parties — then adapt them to how your team works.</p>
          {canManage && (
            <button className="adm-btn-gold mt-5" onClick={() => install.mutate()} disabled={install.isPending}>
              <Download className="h-4 w-4" /> Install default templates
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const phases = [...new Set(t.items.map((i) => i.phase))];
            const milestones = t.items.filter((i) => i.isMilestone).length;
            const span = t.items.length ? [Math.min(...t.items.map((i) => i.offsetDays)), Math.max(...t.items.map((i) => i.offsetDays))] : [0, 0];
            return (
              <article key={t.id} className="adm-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold leading-snug">{t.name}</h2>
                    {t.eventType && <p className="mt-0.5 text-xs text-adm-muted">{t.eventType}</p>}
                  </div>
                  <Badge tone="gold">{t.items.length} tasks</Badge>
                </div>
                <p className="mt-3 text-xs text-adm-muted">
                  {milestones} milestone{milestones === 1 ? '' : 's'} · from {offsetLabel(span[0]).toLowerCase()} to {offsetLabel(span[1]).toLowerCase()}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {phases.slice(0, 6).map((p) => (
                    <span key={p} className="rounded-md bg-adm-bg px-2 py-0.5 text-[11px] text-adm-muted ring-1 ring-inset ring-adm-line">
                      {p}
                    </span>
                  ))}
                  {phases.length > 6 && <span className="text-[11px] text-adm-muted">+{phases.length - 6}</span>}
                </div>
                {canManage && (
                  <div className="mt-auto flex justify-end gap-1 pt-4">
                    <button className="adm-btn-ghost px-2 py-1 text-red-600" onClick={() => setDel(t)} aria-label={`Delete ${t.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button className="adm-btn-secondary px-3 py-1.5" onClick={() => setEditing({ template: t })}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {editing && <TemplateEditor open key={editing.template?.id ?? 'new'} template={editing.template} phases={meta?.phases ?? []} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!del} title={`Delete “${del?.name}”?`} body="Tasks already created on bookings from this template are not affected." confirmLabel="Delete template" danger loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(null)} />
    </div>
  );
}

export default function TaskTemplatesPage() {
  return (
    <RequirePerm any={['tasks.manage', 'bookings.view']}>
      <TemplatesScreen />
    </RequirePerm>
  );
}
