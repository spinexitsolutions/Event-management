import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DragHandleProps {
  handle: ReactNode;
  isDragging: boolean;
}

/**
 * Accessible sortable list (pointer + keyboard: focus the handle, Space to lift, arrows to move, Space to drop).
 * `ids` must be unique and stable per item.
 */
export function SortableList({ ids, onMove, children, grid, className, disabled }: { ids: string[]; onMove: (from: number, to: number) => void; children: (id: string, index: number, drag: DragHandleProps) => ReactNode; grid?: boolean; className?: string; disabled?: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy} disabled={disabled}>
        <div className={className}>
          {ids.map((id, i) => (
            <SortableItem key={id} id={id} disabled={disabled}>
              {(drag) => children(id, i, drag)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, children, disabled }: { id: string; children: (drag: DragHandleProps) => ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder (Space to lift, arrow keys to move)"
      className="cursor-grab touch-none rounded p-1 text-adm-muted hover:bg-adm-bg hover:text-adm-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-adm-gold active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('relative', isDragging && 'z-10 opacity-80 drop-shadow-lg')}>
      {children({ handle, isDragging })}
    </div>
  );
}
