import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Textarea } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { Message } from '../types';
import { bookingKey } from '../shared/hooks';
import { LoadError, SectionEmpty, SkeletonRows } from '../shared/ui';

export default function MessagesTab({ booking: b }: TabProps) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['booking-messages', b.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<Message[]>(`/admin/bookings/${b.id}/messages`), refetchInterval: 30_000 });
  const [body, setBody] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Fetching marks client messages as read — refresh the unread badge.
  useEffect(() => {
    if (q.data && b.unreadMessages) qc.invalidateQueries({ queryKey: bookingKey(b.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.dataUpdatedAt]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [q.data?.length]);

  const send = useMutation({
    mutationFn: () => api.post<Message>(`/admin/bookings/${b.id}/messages`, { body: body.trim() }),
    onSuccess: (m) => {
      setBody('');
      qc.setQueryData<Message[]>(key, (old) => [...(old ?? []), m]);
    },
    onError: (err) => toast.error('Message not sent', errorMessage(err)),
  });

  if (q.isError) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const msgs = q.data ?? [];
  let lastDay = '';

  return (
    <div className="adm-card flex h-[min(70vh,680px)] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-adm-line px-5 py-3">
        <div>
          <p className="text-sm font-semibold">Conversation with {b.client.name}</p>
          <p className="text-xs text-adm-muted">{b.client.userId ? 'The client sees these messages in their portal and is notified of new ones.' : 'The client has no portal account yet — they will see these once invited.'}</p>
        </div>
      </div>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-adm-bg/40 px-4 py-5 sm:px-6" aria-live="polite" aria-label="Messages">
        {q.isLoading ? (
          <SkeletonRows rows={4} />
        ) : msgs.length === 0 ? (
          <SectionEmpty icon={<MessagesSquare className="h-5 w-5" />} title="No messages yet" body="Start the conversation — updates, questions and confirmations live here alongside the booking." />
        ) : (
          msgs.map((m) => {
            const day = fmtDate(m.createdAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && <p className="my-3 text-center text-[11px] uppercase tracking-wider text-adm-muted">{day}</p>}
                <div className={cn('flex', m.fromClient ? 'justify-start' : 'justify-end')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[70%]', m.fromClient ? 'rounded-bl-md border border-adm-line bg-white' : 'rounded-br-md bg-adm-dark text-white')}>
                    <p className={cn('mb-0.5 text-[11px]', m.fromClient ? 'text-adm-muted' : 'text-white/60')}>
                      {m.authorName} · <time title={fmtDateTime(m.createdAt)}>{new Date(m.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
                    </p>
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
      {can('bookings.manage') && (
        <form
          className="flex items-end gap-2 border-t border-adm-line bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) send.mutate();
          }}
        >
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) {
                e.preventDefault();
                send.mutate();
              }
            }}
            placeholder="Write to the client… (Ctrl/⌘ + Enter to send)"
            aria-label="Message to client"
            maxLength={5000}
            className="resize-none"
          />
          <button className="adm-btn-primary !h-10 !px-4" disabled={!body.trim() || send.isPending}>
            <Send className="h-4 w-4" /> <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      )}
    </div>
  );
}
