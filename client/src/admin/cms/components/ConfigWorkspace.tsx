import { AlertCircle, ChevronLeft, ChevronRight, ExternalLink, History, Upload, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/admin/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fromNow } from '@/lib/format';
import type { useConfigEditor } from '../lib/config';
import { useMedia, usePreviewFrame, useUnsavedGuard } from '../lib/hooks';
import { Callout, SaveStatusPill, Segmented, UnsavedDialog } from './bits';
import { PreviewPane } from './PreviewPane';
import { PublishDialog, VersionsModal } from './Publishing';

export interface Panel {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  errors?: number;
  render: () => ReactNode;
}

type Editor<T> = ReturnType<typeof useConfigEditor<T>>;

/**
 * Shared full-height workspace for the theme customizer and the global content editor:
 * panel navigation + editor on the left, scaled live preview on the right, draft/publish/versions in the top bar.
 */
export function ConfigWorkspace<T>({ title, subtitle, editor, panels, previewMessage, validate, configKey }: { title: string; subtitle: string; editor: Editor<T>; panels: Panel[]; previewMessage: () => { theme?: unknown; site?: unknown } | null; validate: (v: T) => { path: string; message: string }[]; configKey: 'theme' | 'site' }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const panelId = params.get('panel');
  const panel = panels.find((p) => p.id === panelId) ?? null;
  const setPanel = (id: string | null) => setParams(id ? { panel: id } : {}, { replace: true });
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ path: string; message: string }[]>([]);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const isLg = useMedia('(min-width: 1100px)');
  const isMd = useMedia('(min-width: 768px)');

  const frame = usePreviewFrame(() => {
    const m = previewMessage();
    if (m) frame.post({ type: 'preview', ...m });
  });
  const msgJson = JSON.stringify(previewMessage());
  useEffect(() => {
    const t = setTimeout(() => {
      const m = previewMessage();
      if (m) frame.post({ type: 'preview', ...m });
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgJson, frame]);

  const blocker = useUnsavedGuard(editor.autosave.dirty);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void editor.autosave.flush().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editor.autosave]);

  if (editor.q.isError) {
    return (
      <div className="adm-card mx-auto max-w-lg p-8 text-center">
        <p className="font-medium">Couldn’t load {title.toLowerCase()}</p>
        <p className="mt-1 text-sm text-adm-muted">{errorMessage(editor.q.error)}</p>
        <button className="adm-btn-primary mt-4" onClick={() => editor.q.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  const loading = !editor.value;
  const clientIssues = editor.value ? validate(editor.value) : [];

  const doPublish = async (note: string) => {
    if (clientIssues.length) {
      toast.error('Some settings need attention', clientIssues[0].message);
      return;
    }
    setPublishing(true);
    try {
      const r = await editor.publish(note);
      setServerIssues([]);
      setPublishOpen(false);
      toast.success(`Published · version ${r.version}`, 'Your changes are live for every visitor.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && Array.isArray(e.details)) setServerIssues(e.details as { path: string; message: string }[]);
      toast.error('Could not publish', errorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const nav = (
    <ul className="space-y-1 p-3">
      {panels.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => setPanel(p.id)} className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-adm-line hover:bg-white focus-visible:border-adm-gold focus-visible:outline-none">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-adm-gold ring-1 ring-adm-line group-hover:bg-[#FBF7EE]">
              <p.icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{p.label}</span>
              <span className="block truncate text-xs text-adm-muted">{p.description}</span>
            </span>
            {!!p.errors && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-4 w-4" /> {p.errors}
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-adm-muted" />
          </button>
        </li>
      ))}
    </ul>
  );

  const editorPane = (
    <div className="flex min-h-0 flex-col border-r border-adm-line bg-adm-bg/60">
      {loading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-adm-line/50" />
          ))}
        </div>
      ) : panel ? (
        <>
          <div className="flex items-center gap-2 border-b border-adm-line bg-white px-3 py-2">
            <button type="button" className="adm-btn-ghost px-1.5 py-1 text-xs" onClick={() => setPanel(null)}>
              <ChevronLeft className="h-4 w-4" /> All settings
            </button>
            <span className="text-sm font-semibold">{panel.label}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 lg:p-5">
            <p className="mb-5 text-xs text-adm-muted">{panel.description}</p>
            {panel.render()}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {serverIssues.length > 0 && (
            <Callout tone="danger" title="Publishing was blocked" className="m-3">
              <ul className="list-disc pl-4">
                {serverIssues.slice(0, 6).map((i, k) => (
                  <li key={k}>
                    <span className="font-mono">{i.path}</span>: {i.message}
                  </li>
                ))}
              </ul>
            </Callout>
          )}
          {nav}
        </div>
      )}
    </div>
  );

  const previewPane = <PreviewPane src="/preview/site" frameRef={frame.ref} onLoad={frame.onLoad} title="Site preview" className="min-h-0 bg-adm-bg" label="Live draft preview" />;
  const live = editor.publishedVersion;

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col lg:-mx-8 lg:-my-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-adm-line bg-white px-3 py-2.5 lg:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold">{title}</h1>
            {live > 0 && <Badge tone="green">Live · v{live}</Badge>}
            {editor.hasUnpublished && <Badge tone="amber">Unpublished changes</Badge>}
          </div>
          <p className="truncate text-xs text-adm-muted">
            {subtitle}
            {editor.lastPublishedAt && ` · Last published ${fromNow(editor.lastPublishedAt)}`}
          </p>
        </div>
        <SaveStatusPill status={editor.autosave.status} error={editor.autosave.error} onRetry={() => void editor.autosave.flush().catch(() => undefined)} />
        <div className="flex items-center gap-1.5">
          <button className="adm-btn-secondary px-2.5" onClick={() => setVersionsOpen(true)}>
            <History className="h-4 w-4" /> <span className="hidden sm:inline">History</span>
          </button>
          {!isMd && (
            <a className="adm-btn-secondary px-2.5" href="/preview/site" target="_blank" rel="noopener">
              <ExternalLink className="h-4 w-4" /> Preview
            </a>
          )}
          <button className="adm-btn-gold" disabled={loading} onClick={() => setPublishOpen(true)}>
            <Upload className="h-4 w-4" /> Publish
          </button>
        </div>
      </div>
      {isLg ? (
        <div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)]">
          {editorPane}
          {previewPane}
        </div>
      ) : isMd ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex justify-center border-b border-adm-line bg-white py-1.5">
            <Segmented label="Editor or preview" size="sm" value={view} onChange={setView} options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Live preview' }]} />
          </div>
          <div className={cn('flex min-h-0 flex-1 flex-col', view !== 'edit' && 'hidden')}>{editorPane}</div>
          <div className={cn('flex min-h-0 flex-1 flex-col', view !== 'preview' && 'hidden')}>{previewPane}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{editorPane}</div>
      )}
      <PublishDialog open={publishOpen} onClose={() => setPublishOpen(false)} onPublish={(n) => void doPublish(n)} busy={publishing} what={configKey === 'theme' ? 'theme' : 'global content'} issues={[...clientIssues, ...serverIssues].slice(0, 8)} />
      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        path={`/admin/cms/site/${configKey}/versions`}
        currentVersion={live}
        canDiscard={editor.hasUnpublished}
        onDiscard={async () => {
          try {
            await editor.discard();
            toast.success('Draft discarded', 'The editor now shows the live settings.');
          } catch (e) {
            toast.error('Could not discard', errorMessage(e));
            throw e;
          }
        }}
        onRestore={async (version) => {
          try {
            await editor.restore(version);
            toast.success(`Version ${version} restored to the draft`, 'Review it in the preview, then publish.');
          } catch (e) {
            toast.error('Could not restore', errorMessage(e));
            throw e;
          }
        }}
      />
      <UnsavedDialog blocker={blocker} onSave={() => editor.autosave.flush()} />
    </div>
  );
}
