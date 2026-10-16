import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ScanLine, Undo2, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, titleCase } from '@/lib/format';
import { Card, Field, Input } from '@/admin/ui';
import type { BookingDetail } from '../types';
import { Alert } from '../shared/ui';

interface CheckInResult {
  alreadyCheckedIn: boolean;
  partySize: number;
  guest: { id: string; name: string; group: string; tableLabel: string; seatNumber: number | null; rsvpStatus: string; dietary: string; plusOnes: number; checkedInAt: string | null; checkedInCount: number };
}

/** Accepts a bare invite code or a scanned RSVP URL (…/rsvp/CODE). */
const extractCode = (raw: string) => {
  const m = raw.trim().match(/\/rsvp\/([A-Za-z0-9-]+)/);
  return (m ? m[1] : raw).trim();
};

export default function CheckInPanel({ booking, onChange }: { booking: BookingDetail; onChange: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [count, setCount] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<CheckInResult[]>([]);
  const [lastCode, setLastCode] = useState('');

  const checkIn = useMutation({
    mutationFn: (v: { code: string; count?: number }) => api.post<CheckInResult>('/admin/guests/check-in', { code: v.code, bookingId: booking.id, ...(v.count ? { count: v.count } : {}) }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      setCode('');
      setCount('');
      setRecent((x) => [r, ...x.filter((y) => y.guest.id !== r.guest.id)].slice(0, 8));
      onChange();
      input.current?.focus();
    },
    onError: (err) => {
      setResult(null);
      setError(errorMessage(err));
      input.current?.select();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api.post(`/admin/guests/${id}/undo-check-in`),
    onSuccess: (_d, id) => {
      toast.success('Check-in undone');
      setResult(null);
      setRecent((x) => x.filter((y) => y.guest.id !== id));
      onChange();
    },
    onError: (err) => toast.error('Could not undo', errorMessage(err)),
  });

  const submit = () => {
    const c = extractCode(code);
    if (c.length < 4) return setError('Enter the invite code printed under the QR code.');
    setLastCode(c);
    checkIn.mutate({ code: c, count: count ? Number(count) : undefined });
  };
  const g = result?.guest;
  const remaining = result ? result.partySize - (g?.checkedInCount ?? 0) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Door check-in">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-sm text-adm-muted">Scan the guest’s QR code with a handheld scanner (it types into the box) or enter the invite code. Repeat scans never exceed the party size.</p>
          <Field label="Invite code or scanned link">
            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-adm-gold" aria-hidden />
              <Input ref={input} autoFocus autoComplete="off" className="!py-3 !pl-11 font-mono text-lg uppercase tracking-[0.2em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD123456" />
            </div>
          </Field>
          <div className="flex items-end gap-3">
            <Field label="People arriving" hint="Leave empty for the whole party" className="w-44">
              <Input type="number" min={1} max={11} value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
            <button className="adm-btn-gold flex-1 !py-3" disabled={checkIn.isPending || !code.trim()}>
              {checkIn.isPending ? 'Checking…' : 'Check in'}
            </button>
          </div>
        </form>
        <div className="mt-4" aria-live="assertive">
          {error && <Alert tone="error" title="Not checked in">{error}</Alert>}
          {result && g && (
            <div className={`rounded-xl border p-4 ${result.alreadyCheckedIn ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-start gap-3">
                <CheckCircle2 className={`mt-0.5 h-6 w-6 shrink-0 ${result.alreadyCheckedIn ? 'text-amber-600' : 'text-emerald-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{g.name}</p>
                  <p className="text-sm">
                    {result.alreadyCheckedIn ? `Already checked in ${fmtDateTime(g.checkedInAt)}` : 'Welcome — checked in'} · {g.checkedInCount} of {result.partySize} in party
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs opacity-70">Table</dt>
                      <dd className="font-medium">{g.tableLabel ? `${g.tableLabel}${g.seatNumber ? ` · seat ${g.seatNumber}` : ''}` : 'Not seated'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs opacity-70">RSVP</dt>
                      <dd className="font-medium">{titleCase(g.rsvpStatus)}</dd>
                    </div>
                    {g.group && (
                      <div>
                        <dt className="text-xs opacity-70">Group</dt>
                        <dd>{g.group}</dd>
                      </div>
                    )}
                    {g.dietary && (
                      <div>
                        <dt className="text-xs opacity-70">Dietary</dt>
                        <dd>{g.dietary}</dd>
                      </div>
                    )}
                  </dl>
                  {g.rsvpStatus === 'DECLINED' && <p className="mt-2 text-sm font-medium text-amber-800">This guest had declined — confirm with the host.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {remaining > 0 && lastCode && (
                      <button className="adm-btn-secondary !py-1.5 text-xs" disabled={checkIn.isPending} onClick={() => checkIn.mutate({ code: lastCode, count: 1 })}>
                        <UserPlus className="h-3.5 w-3.5" /> Add late arrival ({remaining} remaining)
                      </button>
                    )}
                    <button className="adm-btn-ghost !py-1.5 text-xs" onClick={() => undo.mutate(g.id)} disabled={undo.isPending}>
                      <Undo2 className="h-3.5 w-3.5" /> Undo check-in
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card title="Checked in this session" bodyClassName="p-0">
        {recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-adm-muted">Guests you check in appear here. Headcount totals update above.</p>
        ) : (
          <ul className="divide-y divide-adm-line">
            {recent.map((r) => (
              <li key={r.guest.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.guest.name}</p>
                  <p className="text-xs text-adm-muted">
                    {r.guest.checkedInCount}/{r.partySize} · {r.guest.tableLabel || 'not seated'}
                  </p>
                </div>
                <button className="adm-btn-ghost !px-2 !py-1 text-xs" onClick={() => undo.mutate(r.guest.id)} disabled={undo.isPending} aria-label={`Undo check-in for ${r.guest.name}`}>
                  <Undo2 className="h-3.5 w-3.5" /> Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
