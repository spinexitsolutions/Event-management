import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { Field as KitField, Input, Select, Textarea } from '@/admin/ui';
import { Field } from './common';
import { fieldErrorsOf, SOURCES, useStaff, type ClientDetail } from '../lib';

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  source: string;
  tags: string[];
  prefs: { k: string; v: string }[];
  notes: string;
  relationshipManagerId: string;
}

const fromClient = (c?: ClientDetail | null): FormState => ({
  name: c?.name ?? '',
  email: c?.email ?? '',
  phone: c?.phone ?? '',
  company: c?.company ?? '',
  city: c?.city ?? '',
  source: c?.source ?? 'manual',
  tags: c?.tags ?? [],
  prefs: Object.entries(c?.preferences ?? {}).map(([k, v]) => ({ k, v: String(v) })),
  notes: c?.notes ?? '',
  relationshipManagerId: c?.relationshipManagerId ?? '',
});

/** Create or edit a client profile (contact, company, preferences, tags, notes, relationship manager). */
export function ClientFormModal({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client?: ClientDetail | null; onSaved?: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const staff = useStaff();
  const [f, setF] = useState<FormState>(() => fromClient(client));
  const [tagDraft, setTagDraft] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = open ? (client?.id ?? 'new') : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (open) {
      setF(fromClient(client));
      setErrs({});
      setTagDraft('');
    }
  }
  const m = useMutation({
    mutationFn: () => {
      const prefs = Object.fromEntries(f.prefs.filter((p) => p.k.trim()).map((p) => [p.k.trim(), p.v]));
      const body = { name: f.name, email: f.email, phone: f.phone, company: f.company, city: f.city, source: f.source, tags: f.tags, preferences: prefs, notes: f.notes, relationshipManagerId: f.relationshipManagerId || null };
      return client ? api.put<{ id: string }>(`/admin/clients/${client.id}`, body) : api.post<{ id: string }>('/admin/clients', body);
    },
    onSuccess: (r) => {
      toast.success(client ? 'Client updated' : 'Client created');
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['client', r.id] });
      onClose();
      onSaved?.(r.id);
    },
    onError: (err) => {
      setErrs(fieldErrorsOf(err));
      toast.error('Could not save client', errorMessage(err));
    },
  });
  const addTag = () => {
    const t = tagDraft.trim().toLowerCase();
    if (t && !f.tags.includes(t) && f.tags.length < 15) setF((x) => ({ ...x, tags: [...x.tags, t.slice(0, 30)] }));
    setTagDraft('');
  };
  const bind = (k: 'name' | 'email' | 'phone' | 'company' | 'city' | 'source' | 'notes' | 'relationshipManagerId') => ({ value: f[k], invalid: !!errs[k], onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const portalLocked = !!client?.user;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? 'Edit client' : 'New client'}
      size="lg"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" type="submit" form="client-form" disabled={m.isPending}>
            {m.isPending ? 'Saving…' : client ? 'Save changes' : 'Create client'}
          </button>
        </>
      }
    >
      <form
        id="client-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Name" required error={errs.name}>
          <Input required minLength={2} maxLength={120} {...bind('name')} />
        </Field>
        <Field label="Email" required error={errs.email} hint={portalLocked ? 'Portal account holders change their own email.' : undefined}>
          <Input type="email" required disabled={portalLocked} {...bind('email')} />
        </Field>
        <Field label="Phone" error={errs.phone}>
          <Input type="tel" maxLength={30} {...bind('phone')} />
        </Field>
        <Field label="Company" error={errs.company}>
          <Input maxLength={160} {...bind('company')} />
        </Field>
        <Field label="City" error={errs.city}>
          <Input maxLength={80} {...bind('city')} />
        </Field>
        <Field label="Source" error={errs.source}>
          <Select {...bind('source')}>
            {[...new Set(['manual', ...SOURCES, f.source])].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Relationship manager" error={errs.relationshipManagerId}>
          <Select {...bind('relationshipManagerId')}>
            <option value="">None</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <KitField label="Tags" hint="Press Enter to add (max 15)." error={errs.tags}>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-adm-line bg-white px-2 py-1.5 focus-within:border-adm-gold">
            {f.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-adm-bg px-2 py-0.5 text-xs">
                {t}
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => setF((x) => ({ ...x, tags: x.tags.filter((y) => y !== t) }))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              className="min-w-[80px] flex-1 border-0 bg-transparent p-0.5 text-sm focus:outline-none"
              value={tagDraft}
              aria-label="Add tag"
              placeholder={f.tags.length ? '' : 'vip, corporate…'}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </div>
        </KitField>
        <div className="sm:col-span-2">
          <span className="adm-label">Preferences</span>
          <div className="space-y-2">
            {f.prefs.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Preference name" placeholder="e.g. Cuisine" className="w-2/5" maxLength={60} value={p.k} onChange={(e) => setF((x) => ({ ...x, prefs: x.prefs.map((y, j) => (j === i ? { ...y, k: e.target.value } : y)) }))} />
                <Input aria-label="Preference value" placeholder="e.g. Jain, no onion/garlic" maxLength={500} value={p.v} onChange={(e) => setF((x) => ({ ...x, prefs: x.prefs.map((y, j) => (j === i ? { ...y, v: e.target.value } : y)) }))} />
                <button type="button" className="adm-btn-ghost px-2" aria-label="Remove preference" onClick={() => setF((x) => ({ ...x, prefs: x.prefs.filter((_, j) => j !== i) }))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button type="button" className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => setF((x) => ({ ...x, prefs: [...x.prefs, { k: '', v: '' }] }))}>
              <Plus className="h-3.5 w-3.5" /> Add preference
            </button>
          </div>
        </div>
        <Field label="Internal notes" className="sm:col-span-2" error={errs.notes}>
          <Textarea rows={4} maxLength={5000} {...bind('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
