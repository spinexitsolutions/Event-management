import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Notice } from '@/auth/ui';
import type { BookingDetail, MessageRow } from '../types';
import { Panel } from '../ui';

export default function MessagesTab({ booking: b }: { booking: BookingDetail }) {
  const qc = useQueryClient();
  const key = ['portal', 'messages', b.id];
  // Polls every 20 s while this tab is open (the component unmounts when another tab is selected).
  const q = useQuery({ queryKey: key, queryFn: () => api.get<MessageRow[]>(`/portal/bookings/${b.id}/messages`), refetchInterval: 20_000, refetchIntervalInBackground: false });
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = q.data?.length ?? 0;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = useMutation({
    mutationFn: (text: string) => api.post<MessageRow>(`/portal/bookings/${b.id}/messages`, { body: text }),
    onSuccess: (m) => {
      qc.setQueryData<MessageRow[]>(key, (old) => [...(old ?? []), m]);
      setBody('');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  };

  let lastDay = '';
  return (
    <Panel className="mx-auto flex max-w-3xl flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <p className="text-ink">{b.manager ? b.manager.name : 'Your planning team'}</p>
          <p className="text-xs text-muted">{b.manager?.title || 'Replies usually within one working day'}</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Live
        </span>
      </div>
      <div ref={scroller} className="h-[min(58vh,560px)] overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite" aria-label="Conversation" role="log">
        {q.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="ml-auto h-14 w-1/2" />
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-heading text-2xl">Start the conversation</p>
            <p className="mt-2 max-w-sm text-sm text-muted">Ask a question, share an idea or confirm a detail — your event manager will reply here and by email.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {q.data.map((m) => {
              const day = fmtDate(m.createdAt, { weekday: 'long', day: 'numeric', month: 'long' });
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <li key={m.id}>
                  {showDay && (
                    <p className="my-5 text-center text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
                      {day}
                    </p>
                  )}
                  <div className={cn('flex', m.fromClient ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[85%] px-4 py-3 sm:max-w-[75%]', m.fromClient ? 'bg-primary/15 text-ink' : 'border border-line bg-surface-2/60')} style={{ borderRadius: 'calc(var(--radius) + 10px)' }}>
                      {!m.fromClient && <p className="mb-1 text-xs text-primary">{m.authorName}</p>}
                      <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed">{m.body}</p>
                      <p className="mt-1.5 text-right text-[0.68rem] text-muted">
                        <time dateTime={m.createdAt} title={fmtDateTime(m.createdAt)}>
                          {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form onSubmit={submit} className="border-t border-line p-4 sm:p-5">
        {error && <Notice tone="error" className="mb-3">{error}</Notice>}
        <div className="flex items-end gap-3">
          <label htmlFor="msg-body" className="sr-only">
            Your message
          </label>
          <textarea
            id="msg-body"
            rows={2}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKey}
            placeholder="Write a message…"
            className="field-input max-h-48 min-h-[3rem] flex-1 resize-y border px-3 py-2.5"
            style={{ borderRadius: 'var(--radius)' }}
          />
          <Button type="submit" size="sm" loading={send.isPending} disabled={!body.trim()} icon={<Send className="h-4 w-4" aria-hidden />} aria-label="Send message">
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
        <p className="mt-2 hidden text-xs text-muted sm:block">Press Ctrl/⌘ + Enter to send.</p>
      </form>
    </Panel>
  );
}
