import { useState } from 'react';
import { Icon, ICON_NAMES } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/** Icon chooser with visual previews of every CMS icon name. */
export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="adm-input flex items-center gap-2 text-left">
        <Icon name={value} className="h-5 w-5 text-adm-gold" strokeWidth={1.5} />
        <span className="flex-1">{value || 'sparkles'}</span>
        <span className="text-xs text-adm-muted">{open ? 'Close' : 'Change'}</span>
      </button>
      {open && (
        <div className="mt-1.5 grid grid-cols-6 gap-1 rounded-lg border border-adm-line bg-white p-1.5 sm:grid-cols-8" role="listbox" aria-label="Icons">
          {ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={n === value}
              title={n}
              onClick={() => {
                onChange(n);
                setOpen(false);
              }}
              className={cn('flex aspect-square items-center justify-center rounded-md transition hover:bg-adm-bg', n === value && 'bg-[#FBF7EE] ring-1 ring-adm-gold')}
            >
              <Icon name={n} className="h-5 w-5" strokeWidth={1.5} />
              <span className="sr-only">{n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
