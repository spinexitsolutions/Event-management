import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { Notice } from '@/auth/ui';
import type { BookingDetail } from '../types';
import { Panel } from '../ui';

const WORDS = ['', 'Disappointing', 'Could be better', 'Good', 'Wonderful', 'Unforgettable'];

function Stars({ value, size = 'h-5 w-5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= value ? 'fill-primary text-primary' : 'text-line')} aria-hidden />
      ))}
    </span>
  );
}

export default function FeedbackTab({ booking: b }: { booking: BookingDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(!b.feedback);
  const [rating, setRating] = useState(b.feedback?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(b.feedback?.comment ?? '');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!rating) return setError('Please choose a rating from 1 to 5 stars.');
    setSaving(true);
    setError(null);
    try {
      await api.post(`/portal/bookings/${b.id}/feedback`, { rating, comment: comment.trim(), publishConsent: consent });
      toast.success('Thank you', 'Your feedback means a great deal to our team.');
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['portal', 'booking', b.id] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (b.status !== 'COMPLETED') return <Notice>Feedback opens once your event is complete.</Notice>;

  if (!editing && b.feedback)
    return (
      <Panel className="mx-auto max-w-2xl p-8 text-center sm:p-12">
        <p className="eyebrow">Your feedback</p>
        <div className="mt-6">
          <Stars value={b.feedback.rating} size="h-7 w-7" />
        </div>
        {b.feedback.comment ? <blockquote className="mt-6 font-heading text-2xl leading-relaxed text-ink/90">“{b.feedback.comment}”</blockquote> : <p className="mt-6 text-muted">{WORDS[b.feedback.rating]}</p>}
        <p className="mt-6 text-xs text-muted">Shared {fmtDate(b.feedback.createdAt)} · thank you for celebrating with us.</p>
        <Button variant="ghost" size="sm" className="mt-6" onClick={() => setEditing(true)}>
          Update feedback
        </Button>
      </Panel>
    );

  const shown = hover || rating;
  return (
    <Panel className="mx-auto max-w-2xl p-8 sm:p-12">
      <p className="eyebrow text-center">How was your event?</p>
      <h2 className="t-h3 mt-3 text-center">We’d love to hear from you</h2>
      <form onSubmit={submit} className="mt-10 space-y-8" noValidate>
        <fieldset className="text-center">
          <legend className="sr-only">Rating</legend>
          <div className="inline-flex gap-2" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <label key={i} className="cursor-pointer p-1" onMouseEnter={() => setHover(i)}>
                <input type="radio" name="rating" value={i} checked={rating === i} onChange={() => setRating(i)} className="peer sr-only" />
                <Star className={cn('h-9 w-9 transition-all duration-300 peer-focus-visible:scale-110', i <= shown ? 'fill-primary text-primary' : 'text-muted/50 hover:text-primary/60')} aria-hidden />
                <span className="sr-only">
                  {i} star{i > 1 ? 's' : ''} — {WORDS[i]}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 h-5 text-sm text-primary" aria-live="polite">
            {WORDS[shown]}
          </p>
        </fieldset>
        <div>
          <label htmlFor="fb-comment" className="field-label">
            Tell us more (optional)
          </label>
          <textarea id="fb-comment" rows={5} maxLength={3000} value={comment} onChange={(e) => setComment(e.target.value)} className="field-input resize-y border px-3" style={{ borderRadius: 'var(--radius)' }} placeholder="The moments you loved, and anything we could do better…" />
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--c-primary))]" />
          <span>
            You may publish my comments as a testimonial on your website.
            <span className="block text-xs text-muted">Leave this unticked to keep your feedback private to our team. You can ask us to remove a published testimonial at any time.</span>
          </span>
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {b.feedback && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={saving}>
            {b.feedback ? 'Update feedback' : 'Send feedback'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
