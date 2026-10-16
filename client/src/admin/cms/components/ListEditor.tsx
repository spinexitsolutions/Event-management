import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { moveItem } from '../lib/util';
import { SortableList } from './Sortable';

let seq = 0;
const nextId = () => `li_${++seq}`;

/** Keeps stable React/dnd ids for a plain array whose items have no ids. */
function useStableIds(length: number) {
  const ids = useRef<string[]>([]);
  while (ids.current.length < length) ids.current.push(nextId());
  if (ids.current.length > length) ids.current = ids.current.slice(0, length);
  return ids;
}

/**
 * Generic repeatable-item editor: drag (or arrow buttons) to reorder, add up to `max`, remove,
 * collapse/expand each item. `renderItem` receives an `update(patch)` helper.
 */
export function ListEditor<T>({
  items,
  onChange,
  renderItem,
  newItem,
  itemTitle,
  addLabel = 'Add item',
  max,
  min = 0,
  empty,
  error,
  compact,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  newItem: () => T;
  itemTitle: (item: T, index: number) => ReactNode;
  addLabel?: string;
  max?: number;
  min?: number;
  empty?: ReactNode;
  error?: string;
  compact?: boolean;
}) {
  const list = Array.isArray(items) ? items : [];
  const ids = useStableIds(list.length);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? list.length <= 2;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length) return;
    ids.current = moveItem(ids.current, from, to);
    onChange(moveItem(list, from, to));
  };
  const remove = (i: number) => {
    ids.current = ids.current.filter((_, j) => j !== i);
    onChange(list.filter((_, j) => j !== i));
  };
  const add = () => {
    const id = nextId();
    ids.current = [...ids.current, id];
    setOpen((o) => ({ ...o, [id]: true }));
    onChange([...list, newItem()]);
  };
  const canAdd = max === undefined || list.length < max;
  return (
    <div className={cn('rounded-lg', error && 'ring-1 ring-red-300 ring-offset-2')}>
      {list.length === 0 && <div className="rounded-lg border border-dashed border-adm-line px-4 py-5 text-center text-xs text-adm-muted">{empty ?? 'Nothing added yet.'}</div>}
      <SortableList ids={ids.current} onMove={move} className="space-y-2">
        {(id, i, { handle }) => (
          <div className="rounded-lg border border-adm-line bg-white">
            <div className={cn('flex items-center gap-1.5 pl-1.5 pr-1', compact ? 'py-1' : 'py-1.5')}>
              {handle}
              <button type="button" className="min-w-0 flex-1 truncate py-1 text-left text-sm font-medium" onClick={() => setOpen((o) => ({ ...o, [id]: !isOpen(id) }))} aria-expanded={isOpen(id)}>
                {itemTitle(list[i], i)}
              </button>
              <button type="button" className="rounded p-1 text-adm-muted hover:bg-adm-bg hover:text-adm-ink disabled:opacity-30" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" className="rounded p-1 text-adm-muted hover:bg-adm-bg hover:text-adm-ink disabled:opacity-30" onClick={() => move(i, i + 1)} disabled={i === list.length - 1} aria-label="Move down">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button type="button" className="rounded p-1 text-adm-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-30" onClick={() => remove(i)} disabled={list.length <= min} aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {isOpen(id) && (
              <div className="space-y-3 border-t border-adm-line px-3 pb-3 pt-3">
                {renderItem(list[i], (patch) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
              </div>
            )}
          </div>
        )}
      </SortableList>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" className="adm-btn-ghost -ml-2 px-2 py-1 text-xs text-adm-gold hover:text-adm-gold" onClick={add} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
        {max !== undefined && <span className="text-[11px] text-adm-muted">{list.length}/{max}</span>}
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** One-line-per-item editor for string arrays (budget ranges, inclusions, highlights …). */
export function StringListEditor({ value, onChange, placeholder, max, addLabel = 'Add', error, maxLength }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; addLabel?: string; error?: string; maxLength?: number }) {
  const list = Array.isArray(value) ? value : [];
  const ids = useStableIds(list.length);
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || (max !== undefined && list.length >= max)) return;
    ids.current = [...ids.current, nextId()];
    onChange([...list, v]);
    setDraft('');
  };
  return (
    <div>
      <SortableList
        ids={ids.current}
        onMove={(from, to) => {
          ids.current = moveItem(ids.current, from, to);
          onChange(moveItem(list, from, to));
        }}
        className="space-y-1.5"
      >
        {(_id, i, { handle }) => (
          <div className="flex items-center gap-1">
            {handle}
            <input className="adm-input py-1.5" value={list[i]} maxLength={maxLength} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Item ${i + 1}`} />
            <button
              type="button"
              className="rounded p-1.5 text-adm-muted hover:bg-red-50 hover:text-red-600"
              onClick={() => {
                ids.current = ids.current.filter((_, j) => j !== i);
                onChange(list.filter((_, j) => j !== i));
              }}
              aria-label={`Remove item ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </SortableList>
      {(max === undefined || list.length < max) && (
        <div className={cn('flex gap-1.5', list.length > 0 && 'mt-2')}>
          <input
            className="adm-input py-1.5"
            value={draft}
            maxLength={maxLength}
            placeholder={placeholder ?? 'Type and press Enter'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            aria-label={addLabel}
          />
          <button type="button" className="adm-btn-secondary px-2.5 py-1.5 text-xs" onClick={add} disabled={!draft.trim()}>
            <Plus className="h-3.5 w-3.5" /> {addLabel}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
