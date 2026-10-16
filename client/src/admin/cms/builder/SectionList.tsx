import { AlertCircle, Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { SECTION_META, type DraftSection } from '@maison/shared';
import { cn } from '@/lib/cn';
import { SortableList } from '../components/Sortable';
import { SECTION_ICONS, sectionLabel } from './sectionMeta';

export function SectionList({
  sections,
  selectedId,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onDelete,
  onAdd,
  errorIds,
}: {
  sections: DraftSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onToggle: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  errorIds: Set<string>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted">Sections · {sections.length}</h2>
        <button type="button" className="adm-btn-secondary px-2 py-1 text-xs" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sections.length === 0 && (
          <div className="mx-1 rounded-xl border border-dashed border-adm-line px-4 py-8 text-center">
            <p className="text-sm font-medium">This page is empty</p>
            <p className="mt-1 text-xs text-adm-muted">Add a hero, story, gallery or any other section.</p>
            <button type="button" className="adm-btn-primary mt-3 text-xs" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" /> Add first section
            </button>
          </div>
        )}
        <SortableList ids={sections.map((s) => s.id)} onMove={onMove} className="space-y-1">
          {(id, i, { handle, isDragging }) => {
            const s = sections[i];
            const I = SECTION_ICONS[s.type] ?? AlertCircle;
            const selected = s.id === selectedId;
            const hasError = errorIds.has(s.id);
            return (
              <div
                className={cn(
                  'group flex items-center gap-1 rounded-lg border pr-1 transition',
                  selected ? 'border-adm-gold bg-[#FBF7EE] shadow-sm' : 'border-transparent hover:border-adm-line hover:bg-white',
                  hasError && !selected && 'border-red-200 bg-red-50/60',
                  isDragging && 'bg-white shadow-lg',
                )}
              >
                <span className="pl-0.5">{handle}</span>
                <button type="button" onClick={() => onSelect(id)} aria-current={selected || undefined} className={cn('flex min-w-0 flex-1 items-center gap-2 py-2 text-left focus-visible:outline-none', !s.enabled && 'opacity-50')}>
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', selected ? 'bg-adm-gold text-white' : 'bg-adm-bg text-adm-muted')}>
                    <I className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight">{sectionLabel(s)}</span>
                    <span className="block truncate text-[11px] text-adm-muted">
                      {SECTION_META[s.type]?.label ?? s.type}
                      {!s.enabled && ' · hidden'}
                    </span>
                  </span>
                  {hasError && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" aria-label="Needs attention before publishing" />}
                </button>
                <div className={cn('items-center', selected ? 'flex' : 'hidden group-focus-within:flex group-hover:flex')}>
                  <button type="button" className="rounded p-1 text-adm-muted hover:bg-white hover:text-adm-ink" onClick={() => onToggle(id)} aria-label={s.enabled ? `Hide “${sectionLabel(s)}”` : `Show “${sectionLabel(s)}”`} title={s.enabled ? 'Hide section' : 'Show section'}>
                    {s.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" className="rounded p-1 text-adm-muted hover:bg-white hover:text-adm-ink" onClick={() => onDuplicate(id)} aria-label={`Duplicate “${sectionLabel(s)}”`} title="Duplicate">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded p-1 text-adm-muted hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(id)} aria-label={`Delete “${sectionLabel(s)}”`} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          }}
        </SortableList>
      </div>
    </div>
  );
}
