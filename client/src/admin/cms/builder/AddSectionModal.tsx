import { Database, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SECTION_META, SECTION_TYPES, type SectionType } from '@maison/shared';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { GROUP_ORDER, SECTION_ICONS } from './sectionMeta';

export function AddSectionModal({ open, onClose, onAdd, afterLabel }: { open: boolean; onClose: () => void; onAdd: (type: SectionType) => void; afterLabel?: string }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return GROUP_ORDER.map((g) => ({
      group: g,
      types: SECTION_TYPES.filter((t) => SECTION_META[t].group === g && (!needle || `${SECTION_META[t].label} ${SECTION_META[t].description} ${SECTION_META[t].dataSource ?? ''}`.toLowerCase().includes(needle))),
    })).filter((g) => g.types.length);
  }, [q]);
  return (
    <Modal open={open} onClose={onClose} title="Add a section" size="xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-muted" />
          <input className="adm-input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sections (e.g. gallery, testimonials)" aria-label="Search sections" autoFocus />
        </div>
        {afterLabel && <p className="text-xs text-adm-muted">Inserted after “{afterLabel}”</p>}
      </div>
      {groups.length === 0 && <p className="py-10 text-center text-sm text-adm-muted">No sections match “{q}”.</p>}
      <div className="space-y-6">
        {groups.map(({ group, types }) => (
          <section key={group}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted">{group}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {types.map((t) => {
                const m = SECTION_META[t];
                const I = SECTION_ICONS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onAdd(t);
                      onClose();
                    }}
                    className={cn('group flex gap-3 rounded-xl border border-adm-line bg-white p-3 text-left transition hover:border-adm-gold hover:shadow-md focus-visible:border-adm-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/30')}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FBF7EE] text-adm-gold transition group-hover:bg-adm-gold group-hover:text-white">
                      <I className="h-5 w-5" strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-adm-muted">{m.description}</span>
                      {m.dataSource && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                          <Database className="h-3 w-3" /> Content from {m.dataSource}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
