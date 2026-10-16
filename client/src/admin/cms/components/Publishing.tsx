import { useQuery } from '@tanstack/react-query';
import { History, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/admin/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, fromNow } from '@/lib/format';
import type { VersionRow } from '../lib/types';
import { Callout } from './bits';

/** Publish confirmation with an optional change note (stored with the version). */
export function PublishDialog({ open, onClose, onPublish, busy, what, issues }: { open: boolean; onClose: () => void; onPublish: (note: string) => void; busy?: boolean; what: string; issues?: { path: string; message: string }[] }) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Publish ${what}`}
      size="sm"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-gold" disabled={busy} onClick={() => onPublish(note)}>
            <Upload className="h-4 w-4" /> {busy ? 'Publishing…' : 'Publish now'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onPublish(note);
        }}
        className="space-y-4"
      >
        <p className="text-sm text-adm-muted">Your draft goes live for every visitor immediately. A version is saved, so you can restore the current live version later.</p>
        <Field label="What changed? (optional)" hint="Helps colleagues find this version in the history.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. New hero photography for the wedding season" />
        </Field>
        {issues && issues.length > 0 && (
          <Callout tone="danger" title="Fix these before publishing">
            <ul className="list-disc pl-4">
              {issues.slice(0, 8).map((i, k) => (
                <li key={k}>
                  {i.path && <span className="font-mono">{i.path}</span>} {i.message}
                </li>
              ))}
            </ul>
          </Callout>
        )}
      </form>
    </Modal>
  );
}

/** Published version history with restore actions. */
export function VersionsModal({ open, onClose, path, currentVersion, onRestore, allowPublish, onDiscard, canDiscard }: { open: boolean; onClose: () => void; path: string; currentVersion: number; onRestore: (version: number, publish: boolean) => Promise<void>; allowPublish?: boolean; onDiscard?: () => Promise<void>; canDiscard?: boolean }) {
  const q = useQuery({ queryKey: ['cms-versions', path], queryFn: () => api.get<VersionRow[]>(path), enabled: open });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ version: number; publish: boolean } | 'discard' | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      setConfirm(null);
      onClose();
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Version history" size="lg" side>
      <div className="space-y-4">
        <p className="text-sm text-adm-muted">Every publish creates a version. Restore one into your draft to review it in the preview first, or restore and publish it straight away.</p>
        {onDiscard && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-adm-line bg-adm-bg/50 p-3">
            <div>
              <p className="text-sm font-medium">Discard draft changes</p>
              <p className="text-xs text-adm-muted">Revert the draft to the live version (v{currentVersion}).</p>
            </div>
            {confirm === 'discard' ? (
              <div className="flex gap-1.5">
                <button className="adm-btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setConfirm(null)}>
                  Keep
                </button>
                <button className="adm-btn-danger px-2.5 py-1.5 text-xs" disabled={busy === 'discard'} onClick={() => run('discard', onDiscard)}>
                  {busy === 'discard' ? 'Discarding…' : 'Yes, discard'}
                </button>
              </div>
            ) : (
              <button className="adm-btn-secondary px-2.5 py-1.5 text-xs" disabled={!canDiscard} onClick={() => setConfirm('discard')}>
                <RotateCcw className="h-3.5 w-3.5" /> Discard draft
              </button>
            )}
          </div>
        )}
        {q.isLoading && <div className="h-40 animate-pulse rounded-lg bg-adm-bg" />}
        {q.isError && <Callout tone="danger">{errorMessage(q.error)}</Callout>}
        {q.data?.length === 0 && (
          <div className="rounded-lg border border-dashed border-adm-line p-8 text-center text-sm text-adm-muted">
            <History className="mx-auto mb-2 h-6 w-6" /> No published versions yet.
          </div>
        )}
        <ol className="space-y-2">
          {q.data?.map((v) => {
            const live = v.version === currentVersion;
            const pending = confirm && confirm !== 'discard' && confirm.version === v.version ? confirm : null;
            return (
              <li key={v.id} className={cn('rounded-lg border p-3', live ? 'border-[#E6D7B5] bg-[#FBF7EE]' : 'border-adm-line bg-white')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Version {v.version} {live && <span className="ml-1 rounded-full bg-adm-gold px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Live</span>}
                    </p>
                    <p className="text-xs text-adm-muted" title={fmtDateTime(v.createdAt)}>
                      {fromNow(v.createdAt)} · {fmtDateTime(v.createdAt)}
                    </p>
                    {v.note && <p className="mt-1 text-sm">{v.note}</p>}
                  </div>
                  {!pending && (
                    <div className="flex gap-1.5">
                      <button className="adm-btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setConfirm({ version: v.version, publish: false })}>
                        Restore to draft
                      </button>
                      {allowPublish && !live && (
                        <button className="adm-btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setConfirm({ version: v.version, publish: true })}>
                          Restore &amp; publish
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {pending && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 p-2 ring-1 ring-adm-line">
                    <p className="text-xs">{pending.publish ? `Version ${v.version} will go live immediately (as a new version).` : `Your current draft will be replaced by version ${v.version}.`}</p>
                    <div className="flex gap-1.5">
                      <button className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                      <button className="adm-btn-primary px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => run(`r${v.version}`, () => onRestore(v.version, pending.publish))}>
                        {busy ? 'Restoring…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Modal>
  );
}
