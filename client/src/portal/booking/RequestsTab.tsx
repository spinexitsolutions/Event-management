import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CHANGE_REQUEST_TYPES } from '@maison/shared';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Notice } from '@/auth/ui';
import type { BookingDetail, ChangeRequestRow } from '../types';
import { Panel, SectionHead, Tag, type Tone } from '../ui';

const TYPES: Record<ChangeRequestRow['type'], { label: string; help: string }> = {
  CHANGE: { label: 'Change', help: 'Adjust guest numbers, services, timings or anything else.' },
  SPECIAL_REQUEST: { label: 'Special request', help: 'Dietary needs, accessibility, surprises or personal touches.' },
  RESCHEDULE: { label: 'Reschedule', help: 'Ask to move your event to a new date.' },
  CANCELLATION: { label: 'Cancellation', help: 'Request to cancel. Your agreement’s cancellation terms apply.' },
};
const STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Under review', tone: 'gold' },
  APPROVED: { label: 'Approved', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'muted' },
};

const today = () => new Date().toISOString().slice(0, 10);
const schema = z
  .object({
    type: z.enum(CHANGE_REQUEST_TYPES),
    message: z.string().trim().min(5, 'Please describe your request (at least 5 characters)').max(3000),
    requestedDate: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'RESCHEDULE' && !v.requestedDate) ctx.addIssue({ code: 'custom', path: ['requestedDate'], message: 'Choose the new date you would like' });
    if (v.type === 'RESCHEDULE' && v.requestedDate && v.requestedDate < today()) ctx.addIssue({ code: 'custom', path: ['requestedDate'], message: 'Choose a date in the future' });
  });
type Values = z.infer<typeof schema>;

export default function RequestsTab({ booking: b }: { booking: BookingDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const closed = b.status === 'COMPLETED' || b.status === 'CANCELLED';
  const { register, handleSubmit, watch, reset, setError, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { type: 'CHANGE', message: '', requestedDate: '' } });
  const type = watch('type');

  const onSubmit = handleSubmit(async (v) => {
    try {
      await api.post(`/portal/bookings/${b.id}/change-requests`, { type: v.type, message: v.message, requestedDate: v.type === 'RESCHEDULE' ? v.requestedDate : null });
      toast.success('Request sent', 'Your event manager will review it and respond here.');
      reset({ type: 'CHANGE', message: '', requestedDate: '' });
      await qc.invalidateQueries({ queryKey: ['portal', 'booking', b.id] });
    } catch (err) {
      const fe = err instanceof ApiError ? err.fieldErrors : {};
      if (fe.message) setError('message', { message: fe.message });
      else if (fe.requestedDate) setError('requestedDate', { message: fe.requestedDate });
      else setError('root', { message: errorMessage(err) });
    }
  });

  return (
    <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
      <section aria-labelledby="req-list-h" className="min-w-0">
        <SectionHead eyebrow="Requests" title="Your requests" id="req-list-h" />
        {b.changeRequests.length ? (
          <ul className="space-y-4">
            {b.changeRequests.map((c) => {
              const st = STATUS[c.status] ?? { label: c.status, tone: 'muted' as Tone };
              return (
                <Panel as="li" key={c.id} className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-ink">
                      {TYPES[c.type]?.label ?? c.type}
                      <span className="ml-2 text-xs text-muted">{fmtDate(c.createdAt)}</span>
                    </p>
                    <Tag tone={st.tone}>{st.label}</Tag>
                  </div>
                  {c.requestedDate && <p className="mt-2 text-sm text-primary">Requested date: {fmtDate(c.requestedDate, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/90">{c.message}</p>
                  {c.resolutionNote && (
                    <div className="mt-4 border-l-2 border-primary/60 pl-4">
                      <p className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
                        Response from your team
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{c.resolutionNote}</p>
                    </div>
                  )}
                </Panel>
              );
            })}
          </ul>
        ) : (
          <Panel className="p-8 text-center text-sm text-muted">No requests yet. Anything you’d like to change or add? Let us know.</Panel>
        )}
      </section>

      <aside>
        <Panel className="p-6 sm:p-8 lg:sticky lg:top-8">
          <p className="eyebrow">New request</p>
          <h2 className="t-h4 mt-2 font-heading">How can we help?</h2>
          {closed ? (
            <p className="mt-4 text-sm text-muted">This booking is {b.status === 'COMPLETED' ? 'complete' : 'cancelled'}, so new requests are closed. Message your planner if you need anything.</p>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
              <fieldset>
                <legend className="field-label">Type of request</legend>
                <div className="grid grid-cols-2 gap-2">
                  {CHANGE_REQUEST_TYPES.map((t) => (
                    <label key={t} className="chip cursor-pointer justify-center text-center text-xs has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
                      <input type="radio" value={t} className="sr-only" {...register('type')} />
                      {TYPES[t].label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">{TYPES[type].help}</p>
              </fieldset>
              {type === 'RESCHEDULE' && (
                <div>
                  <label htmlFor="cr-date" className="field-label">
                    Preferred new date
                  </label>
                  <input id="cr-date" type="date" min={today()} className="field-input [color-scheme:dark_light]" aria-invalid={formState.errors.requestedDate ? true : undefined} aria-describedby="cr-date-err" {...register('requestedDate')} />
                  {formState.errors.requestedDate && (
                    <p id="cr-date-err" className="field-error" role="alert">
                      {formState.errors.requestedDate.message}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label htmlFor="cr-msg" className="field-label">
                  Details
                </label>
                <textarea
                  id="cr-msg"
                  rows={5}
                  maxLength={3000}
                  className="field-input resize-y border px-3"
                  style={{ borderRadius: 'var(--radius)' }}
                  aria-invalid={formState.errors.message ? true : undefined}
                  aria-describedby="cr-msg-err"
                  {...register('message')}
                />
                {formState.errors.message && (
                  <p id="cr-msg-err" className="field-error" role="alert">
                    {formState.errors.message.message}
                  </p>
                )}
              </div>
              {type === 'CANCELLATION' && <Notice>Cancellation requests are reviewed by your event manager under the terms of your agreement. Nothing changes until we confirm with you.</Notice>}
              {formState.errors.root && <Notice tone="error">{formState.errors.root.message}</Notice>}
              <Button type="submit" className="w-full" loading={formState.isSubmitting}>
                Send request
              </Button>
            </form>
          )}
        </Panel>
      </aside>
    </div>
  );
}
