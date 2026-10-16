import { useEffect, useState } from 'react';
import { Input } from '@/admin/ui';

/** Decimal text input that emits an integer scaled by 100 (quantity ×100, percent → basis points). */
export function Scaled100Input({ value, onChange, min = 0, max, invalid, suffix, ...rest }: { value: number; onChange: (v: number) => void; min?: number; max?: number; invalid?: boolean; suffix?: string; 'aria-label'?: string; id?: string; disabled?: boolean; className?: string }) {
  const fmt = (n: number) => String(n / 100);
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    const cur = Math.round(Number(text) * 100);
    if (!Number.isFinite(cur) || cur !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        className={suffix ? '!pr-7 tabular-nums' : 'tabular-nums'}
        value={text}
        invalid={invalid}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '');
          setText(v);
          if (/^\d+(\.\d{0,2})?$/.test(v)) {
            let n = Math.round(Number(v) * 100);
            if (max !== undefined) n = Math.min(n, max);
            if (n >= min) onChange(n);
          }
        }}
        onBlur={() => setText(fmt(value))}
        {...rest}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-adm-muted">{suffix}</span>}
    </div>
  );
}

let seq = 0;
export const newLineId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
