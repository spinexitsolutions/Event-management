import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { Field, Select } from '@/admin/ui';
import type { BookingDetail, TaskTemplate } from '../types';
import { useStaff } from '../shared/hooks';
import { Alert } from '../shared/ui';

/** Applies a task template: tasks are scheduled relative to the event date and appended to the booking. */
export function ApplyTemplateModal({ open, onClose, booking, onApplied }: { open: boolean; onClose: () => void; booking: BookingDetail; onApplied: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const [selected, setSelected] = useState('');
  const [assignee, setAssignee] = useState('');
  const q = useQuery({ queryKey: ['task-templates'], queryFn: () => api.getPaged<TaskTemplate[]>('/admin/tasks/templates'), enabled: open });
  const templates = useMemo(() => q.data?.data ?? [], [q.data]);
  useEffect(() => {
    if (!open) return;
    setAssignee(booking.managerId ?? '');
    setSelected('');
  }, [open, booking.managerId]);
  useEffect(() => {
    if (selected || !templates.length) return;
    const cat = (booking.category?.name ?? '').toLowerCase();
    const match = templates.find((t) => cat && (cat.includes(t.eventType.toLowerCase().split(/[\s/]/)[0]) || t.name.toLowerCase().split(/\s/).some((w) => w.length > 4 && cat.includes(w))));
    setSelected((match ?? templates[0]).id);
  }, [templates, selected, booking.category?.name]);

  const install = useMutation({
    mutationFn: () => api.post<{ installed: number }>('/admin/tasks/templates/install-defaults'),
    onSuccess: (r) => {
      toast.success(r.installed ? `${r.installed} starter templates installed` : 'Starter templates are already installed');
      qc.invalidateQueries({ queryKey: ['task-templates'] });
    },
    onError: (err) => toast.error('Could not install templates', errorMessage(err)),
  });
  const apply = useMutation({
    mutationFn: () => api.post<{ created: number }>(`/admin/tasks/templates/${selected}/apply`, { bookingId: booking.id, assigneeId: assignee || null }),
    onSuccess: (r) => {
      toast.success(`${r.created} tasks added`, 'Due dates are scheduled relative to the event date.');
      onApplied();
      onClose();
    },
  });
  const tpl = templates.find((t) => t.id === selected);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply task template"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" disabled={!selected || apply.isPending} onClick={() => apply.mutate()}>
            <Sparkles className="h-4 w-4" /> {apply.isPending ? 'Applying…' : `Add ${tpl ? tpl.items.length : ''} tasks`}
          </button>
        </>
      }
    >
      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-adm-line/60" />
          ))}
        </div>
      ) : q.isError ? (
        <Alert tone="error">{errorMessage(q.error)}</Alert>
      ) : templates.length === 0 ? (
        <div className="py-6 text-center">
          <p className="font-medium">No task templates yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-adm-muted">Install the starter templates for weddings, corporate events, concerts and private parties. You can edit them afterwards.</p>
          <button className="adm-btn-gold mt-4" onClick={() => install.mutate()} disabled={install.isPending}>
            <Download className="h-4 w-4" /> {install.isPending ? 'Installing…' : 'Install starter templates'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-adm-muted">Tasks are added to the existing list with due dates counted back from the event on {fmtDate(booking.eventDate)}.</p>
          <div role="radiogroup" aria-label="Template" className="space-y-2">
            {templates.map((t) => (
              <label key={t.id} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition', selected === t.id ? 'border-adm-gold bg-[#FBF7EE]' : 'border-adm-line hover:bg-adm-bg')}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="template" className="accent-[#B08D57]" checked={selected === t.id} onChange={() => setSelected(t.id)} />
                  <span>
                    <span className="block text-sm font-medium">{t.name}</span>
                    {t.eventType && <span className="block text-xs text-adm-muted">{t.eventType}</span>}
                  </span>
                </span>
                <span className="text-xs text-adm-muted tabular-nums">{t.items.length} tasks</span>
              </label>
            ))}
          </div>
          <Field label="Assign all tasks to" hint="You can reassign individual tasks later.">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Leave unassigned</option>
              {staff.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <button type="button" className="text-xs text-adm-gold hover:underline" onClick={() => install.mutate()} disabled={install.isPending}>
            Install any missing starter templates
          </button>
          {apply.isError && <Alert tone="error">{errorMessage(apply.error)}</Alert>}
        </div>
      )}
    </Modal>
  );
}
