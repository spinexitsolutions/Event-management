import { calculateQuote, type QuotePricingInput } from '@maison/shared';
import { money, pct } from '@/lib/format';
import { cn } from '@/lib/cn';

const DUE_LABEL: Record<string, (days: number, date: string) => string> = {
  ON_ACCEPTANCE: () => 'On acceptance',
  DAYS_BEFORE_EVENT: (d) => `${d} days before event`,
  ON_EVENT_DAY: () => 'On event day',
  DAYS_AFTER_EVENT: (d) => `${d} days after event`,
  FIXED_DATE: (_d, date) => (date ? `On ${date}` : 'Fixed date'),
};
export const dueLabel = (due: string, days: number, date: string) => DUE_LABEL[due]?.(days, date) ?? due;

/** Totals summary — a display preview using the shared calculation (the server recomputes on save). */
export function QuoteTotals({ pricing, currency, compact }: { pricing: QuotePricingInput; currency: string; compact?: boolean }) {
  const t = calculateQuote(pricing);
  const optional = pricing.lines.map((l, i) => ({ l, r: t.lines[i] })).filter((x) => x.l.optional);
  const row = 'flex items-baseline justify-between gap-4 py-1.5 text-sm';
  return (
    <div>
      <div className={row}>
        <span className="text-adm-muted">Subtotal</span>
        <span className="tabular-nums">{money(t.subtotalMinor, currency)}</span>
      </div>
      {t.discountMinor > 0 && (
        <div className={row}>
          <span className="text-adm-muted">Discount{pricing.discountType === 'PERCENT' ? ` (${pct(pricing.discountValue)})` : ''}</span>
          <span className="tabular-nums text-emerald-700">−{money(t.discountMinor, currency)}</span>
        </div>
      )}
      {t.taxes.map((x, i) => (
        <div key={i} className={row}>
          <span className="text-adm-muted">
            {x.name} {pct(x.rateBps)}
          </span>
          <span className="tabular-nums">{money(x.amountMinor, currency)}</span>
        </div>
      ))}
      {pricing.fees.map((f, i) => (
        <div key={i} className={row}>
          <span className="text-adm-muted">{f.name || 'Fee'}</span>
          <span className="tabular-nums">{money(f.amountMinor, currency)}</span>
        </div>
      ))}
      <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-adm-line pt-3">
        <span className="text-sm font-semibold">Total</span>
        <span className={cn('font-semibold tabular-nums tracking-tight', compact ? 'text-lg' : 'text-2xl')}>{money(t.totalMinor, currency)}</span>
      </div>
      {t.taxableBaseMinor > 0 && t.taxes.length > 0 && <p className="mt-1 text-right text-[11px] text-adm-muted">Taxable base {money(t.taxableBaseMinor, currency)}</p>}

      {optional.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-adm-muted">Optional services</p>
          <ul className="space-y-1">
            {optional.map(({ l, r }) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {l.name || 'Untitled'} <span className="text-xs text-adm-muted">{l.selected ? '· included' : '· not included'}</span>
                </span>
                <span className="whitespace-nowrap tabular-nums text-adm-muted">+{money(r?.netMinor ?? 0, currency)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-adm-muted">Clients can toggle optional services before accepting.</p>
        </div>
      )}

      {t.milestones.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-adm-muted">Payment schedule</p>
          <ul className="space-y-1.5">
            {t.milestones.map((m, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{m.label || `Milestone ${i + 1}`}</span>
                  <span className="block text-[11px] text-adm-muted">
                    {pct(m.shareBps)} · {dueLabel(m.due, m.days, m.date)}
                  </span>
                </span>
                <span className="tabular-nums">{money(m.amountMinor, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
