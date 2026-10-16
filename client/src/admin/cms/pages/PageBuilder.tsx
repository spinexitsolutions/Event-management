import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ExternalLink, History, MousePointerClick, Plus, Settings2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createSection, newSectionId, SECTION_META, validateSections, type DraftSection, type SectionIssue, type SectionType } from '@maison/shared';
import { useToast } from '@/components/ui/Toast';
import { Badge, ConfirmDialog } from '@/admin/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Callout, SaveStatusPill, Segmented, UnsavedDialog } from '../components/bits';
import { PreviewPane } from '../components/PreviewPane';
import { PublishDialog, VersionsModal } from '../components/Publishing';
import { AddSectionModal } from '../builder/AddSectionModal';
import { PageSettingsDrawer, type PageMeta } from '../builder/PageSettingsDrawer';
import { SectionEditor } from '../builder/SectionEditor';
import { SectionList } from '../builder/SectionList';
import { sectionLabel } from '../builder/sectionMeta';
import { useAutosave, useDebounced, useMedia, usePreviewFrame, useUnsavedGuard } from '../lib/hooks';
import type { PageDetail } from '../lib/types';
import { moveItem, prettyIssue, publicPath } from '../lib/util';

interface Doc extends PageMeta {
  sections: DraftSection[];
}

const toDoc = (p: PageDetail): Doc => ({
  title: p.draft?.title ?? p.title,
  seo: { title: '', description: '', image: '', noIndex: false, ...(p.draft?.seo ?? {}) },
  featuredImage: p.draft?.featuredImage ?? '',
  sections: (p.draft?.sections ?? []).map((s) => ({ ...s, enabled: s.enabled !== false, props: (s.props ?? {}) as Record<string, unknown> })),
});

export default function PageBuilder() {
  const { id = '' } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cms-page', id], queryFn: () => api.get<PageDetail>(`/admin/cms/pages/${id}`) });
  const [doc, setDoc] = useState<Doc | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ section: DraftSection; index: number } | null>(null);
  const [serverIssues, setServerIssues] = useState<Record<string, SectionIssue['issues']>>({});
  const [metaErrors, setMetaErrors] = useState<Record<string, string>>({});
  const [unpublished, setUnpublished] = useState(false);
  const [pane, setPane] = useState<'edit' | 'preview' | 'sections'>('edit');
  const isXL = useMedia('(min-width: 1280px)');
  const isMd = useMedia('(min-width: 768px)');

  const docRef = useRef(doc);
  docRef.current = doc;

  const frame = usePreviewFrame(() => {
    const d = docRef.current;
    if (d) frame.post({ type: 'preview-sections', sections: d.sections.filter((s) => s.enabled) });
  });

  const autosave = useAutosave(
    doc,
    async (d) => {
      await api.put(`/admin/cms/pages/${id}/draft`, d);
      setUnpublished(true);
    },
    {
      delay: 900,
      onSaved: () => {
        frame.post({ type: 'refresh' });
        void qc.invalidateQueries({ queryKey: ['cms-pages'] });
      },
    },
  );
  const { reset } = autosave;

  const init = useCallback(
    (p: PageDetail) => {
      const d = toDoc(p);
      setDoc(d);
      reset(d);
      setUnpublished(p.hasUnpublished);
      setServerIssues({});
      setMetaErrors({});
      setSelectedId((cur) => (cur && d.sections.some((s) => s.id === cur) ? cur : (d.sections[0]?.id ?? null)));
    },
    [reset],
  );
  useEffect(() => {
    if (q.data && !docRef.current) init(q.data);
  }, [q.data, init]);
  const reload = async () => {
    const r = await q.refetch();
    if (r.data) init(r.data);
    frame.post({ type: 'refresh' });
  };

  // Live preview: push the draft sections on every change (debounced) and scroll to the selected section.
  const sectionsJson = JSON.stringify(doc?.sections ?? []);
  useEffect(() => {
    const t = setTimeout(() => {
      const d = docRef.current;
      if (d) frame.post({ type: 'preview-sections', sections: d.sections.filter((s) => s.enabled) });
    }, 150);
    return () => clearTimeout(t);
  }, [sectionsJson, frame]);
  useEffect(() => {
    if (selectedId) frame.post({ type: 'scroll-to', sectionId: selectedId });
  }, [selectedId, frame]);

  const blocker = useUnsavedGuard(autosave.dirty);

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void autosave.flush().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [autosave]);

  // Client-side validation mirrors the server's publish validation (shared schemas).
  const debouncedSections = useDebounced(doc?.sections, 250);
  const clientIssues = useMemo(() => {
    const out: Record<string, SectionIssue['issues']> = {};
    if (!debouncedSections) return out;
    const r = validateSections(debouncedSections);
    if (!r.ok) for (const e of r.errors) if (e.id) out[e.id] = e.issues.map((i) => ({ ...i, message: prettyIssue(i.message) }));
    return out;
  }, [debouncedSections]);
  const issuesFor = (sid: string) => serverIssues[sid] ?? clientIssues[sid] ?? [];
  const errorIds = useMemo(() => new Set([...Object.keys(clientIssues), ...Object.keys(serverIssues)]), [clientIssues, serverIssues]);

  const page = q.data;
  const sections = doc?.sections ?? [];
  const selected = sections.find((s) => s.id === selectedId) ?? null;

  const updateSections = (fn: (s: DraftSection[]) => DraftSection[]) => setDoc((d) => (d ? { ...d, sections: fn(d.sections) } : d));
  const updateSection = (sid: string, patch: Partial<DraftSection>) => {
    updateSections((list) => list.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
    if (serverIssues[sid]) setServerIssues(({ [sid]: _drop, ...rest }) => rest);
  };
  const select = (sid: string) => {
    setSelectedId(sid);
    if (!isMd) setPane('edit');
  };
  const addSection = (type: SectionType) => {
    const s = createSection(type);
    updateSections((list) => {
      const at = selectedId ? list.findIndex((x) => x.id === selectedId) + 1 : list.length;
      const next = list.slice();
      next.splice(at > 0 ? at : list.length, 0, s);
      return next;
    });
    setSelectedId(s.id);
    if (!isMd) setPane('edit');
    toast.success(`${SECTION_META[type].label} added`, 'Edit its content on the right — the preview updates as you type.');
  };
  const duplicate = (sid: string) => {
    const i = sections.findIndex((s) => s.id === sid);
    if (i < 0) return;
    const copy: DraftSection = { ...structuredClone(sections[i]), id: newSectionId() };
    updateSections((list) => {
      const next = list.slice();
      next.splice(i + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  };
  const remove = (sid: string) => {
    const index = sections.findIndex((s) => s.id === sid);
    if (index < 0) return;
    setUndo({ section: sections[index], index });
    updateSections((list) => list.filter((s) => s.id !== sid));
    if (selectedId === sid) setSelectedId(sections[index + 1]?.id ?? sections[index - 1]?.id ?? null);
    setToDelete(null);
  };
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(t);
  }, [undo]);

  const publish = async (note: string) => {
    setPublishing(true);
    try {
      await autosave.flush();
      const r = await api.post<{ version: number }>(`/admin/cms/pages/${id}/publish`, { note });
      setPublishOpen(false);
      setServerIssues({});
      setMetaErrors({});
      setUnpublished(false);
      toast.success(`Published · version ${r.version}`, `“${doc?.title}” is now live at ${page ? publicPath(page) : ''}`);
      void qc.invalidateQueries({ queryKey: ['cms-pages'] });
      void q.refetch();
      void qc.invalidateQueries({ queryKey: ['cms-versions'] });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SECTION_ERRORS' && Array.isArray(e.details)) {
        const map: Record<string, SectionIssue['issues']> = {};
        for (const d of e.details as SectionIssue[]) {
          const sid = d.id ?? sections[d.index]?.id;
          if (sid) map[sid] = d.issues.map((i) => ({ ...i, message: prettyIssue(i.message) }));
        }
        setServerIssues(map);
        const first = Object.keys(map)[0];
        if (first) select(first);
        setPublishOpen(false);
        toast.error('Some sections need attention', e.message);
      } else if (e instanceof ApiError && e.status === 422) {
        setMetaErrors(e.fieldErrors);
        setPublishOpen(false);
        setSettingsOpen(true);
        toast.error('Page settings need attention', e.message);
      } else toast.error('Could not publish', errorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  if (q.isLoading || (!doc && !q.isError)) {
    return (
      <div className="-mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col lg:-mx-8 lg:-my-8">
        <div className="h-14 border-b border-adm-line bg-white" />
        <div className="grid flex-1 grid-cols-[260px_1fr] gap-0">
          <div className="space-y-2 border-r border-adm-line p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-adm-line/50" />
            ))}
          </div>
          <div className="animate-pulse bg-adm-bg" />
        </div>
      </div>
    );
  }
  if (q.isError || !page || !doc) {
    return (
      <div className="adm-card mx-auto max-w-lg p-8 text-center">
        <p className="font-medium">{q.error instanceof ApiError && q.error.status === 404 ? 'This page no longer exists' : 'Couldn’t load this page'}</p>
        <p className="mt-1 text-sm text-adm-muted">{errorMessage(q.error)}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/admin/website/pages" className="adm-btn-secondary">
            Back to pages
          </Link>
          <button className="adm-btn-primary" onClick={() => q.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const previewSrc = `/preview/page/${page.id}`;
  const allIssues = sections.filter((s) => issuesFor(s.id).length);
  const live = page.status === 'PUBLISHED';

  const listPane = (
    <div className="flex min-h-0 flex-col border-r border-adm-line bg-adm-bg/60">
      <SectionList
        sections={sections}
        selectedId={selectedId}
        onSelect={select}
        onMove={(from, to) => updateSections((list) => moveItem(list, from, to))}
        onToggle={(sid) => updateSection(sid, { enabled: !sections.find((s) => s.id === sid)?.enabled })}
        onDuplicate={duplicate}
        onDelete={(sid) => setToDelete(sid)}
        onAdd={() => setAdding(true)}
        errorIds={errorIds}
      />
      {undo && (
        <div className="m-2 flex items-center justify-between gap-2 rounded-lg bg-adm-dark px-3 py-2 text-xs text-white" role="status">
          <span className="truncate">Deleted “{sectionLabel(undo.section)}”</span>
          <button
            className="font-semibold text-adm-gold hover:underline"
            onClick={() => {
              updateSections((list) => {
                const next = list.slice();
                next.splice(Math.min(undo.index, next.length), 0, undo.section);
                return next;
              });
              setSelectedId(undo.section.id);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );

  const editorPane = (
    <div className="min-h-0 overflow-y-auto bg-white">
      {selected ? (
        <div className="p-4 lg:p-5">
          <SectionEditor key={selected.id} section={selected} onChange={(props) => updateSection(selected.id, { props })} onToggle={() => updateSection(selected.id, { enabled: !selected.enabled })} issues={issuesFor(selected.id)} />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <MousePointerClick className="h-8 w-8 text-adm-muted" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">Select a section to edit it</p>
          <p className="mt-1 max-w-xs text-xs text-adm-muted">Or add a new one — choose from heroes, galleries, testimonials, packages and more.</p>
          <button className="adm-btn-secondary mt-4" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add section
          </button>
        </div>
      )}
    </div>
  );

  const previewPane = <PreviewPane src={previewSrc} frameRef={frame.ref} onLoad={frame.onLoad} title={`Preview of ${doc.title}`} className="min-h-0 bg-adm-bg" label="Live draft preview" />;

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col lg:-mx-8 lg:-my-8">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-adm-line bg-white px-3 py-2.5 lg:px-4">
        <Link to="/admin/website/pages" className="adm-btn-ghost px-2 py-1 text-xs" aria-label="Back to pages">
          <ChevronLeft className="h-4 w-4" /> Pages
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold">{doc.title || 'Untitled page'}</h1>
            {live ? <Badge tone="green">Live · v{page.publishedVersion}</Badge> : <Badge tone="gray">{page.status === 'UNPUBLISHED' ? 'Unpublished' : 'Never published'}</Badge>}
            {unpublished && live && <Badge tone="amber">Draft differs from live</Badge>}
          </div>
          <p className="truncate text-xs text-adm-muted">{publicPath(page)}</p>
        </div>
        <SaveStatusPill status={autosave.status} error={autosave.error} onRetry={() => void autosave.flush().catch(() => undefined)} />
        <div className="flex items-center gap-1.5">
          <button className="adm-btn-secondary px-2.5" onClick={() => setSettingsOpen(true)} title="Page settings (title, URL, SEO)">
            <Settings2 className="h-4 w-4" /> <span className="hidden sm:inline">Settings</span>
          </button>
          <button className="adm-btn-secondary px-2.5" onClick={() => setVersionsOpen(true)} title="Version history">
            <History className="h-4 w-4" /> <span className="hidden sm:inline">History</span>
          </button>
          {!isMd && (
            <button
              className="adm-btn-secondary px-2.5"
              onClick={async () => {
                await autosave.flush().catch(() => undefined);
                window.open(previewSrc, '_blank', 'noopener');
              }}
            >
              <ExternalLink className="h-4 w-4" /> Preview
            </button>
          )}
          {live && (
            <a href={publicPath(page)} target="_blank" rel="noopener" className="adm-btn-ghost hidden px-2.5 lg:inline-flex" title="View the live page">
              <ExternalLink className="h-4 w-4" /> View live
            </a>
          )}
          <button className="adm-btn-gold" onClick={() => setPublishOpen(true)}>
            <Upload className="h-4 w-4" /> Publish
          </button>
        </div>
      </div>
      {Object.keys(metaErrors).length > 0 && (
        <Callout tone="danger" className="m-2 rounded-lg">
          Page settings need attention: {Object.values(metaErrors)[0]}{' '}
          <button className="underline" onClick={() => setSettingsOpen(true)}>
            Open settings
          </button>
        </Callout>
      )}

      {/* Workspace */}
      {isXL ? (
        <div className="grid min-h-0 flex-1 grid-cols-[256px_384px_minmax(0,1fr)]">
          {listPane}
          <div className="flex min-h-0 flex-col border-r border-adm-line">{editorPane}</div>
          {previewPane}
        </div>
      ) : isMd ? (
        <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)]">
          {listPane}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-center border-b border-adm-line bg-white py-1.5">
              <Segmented
                label="Editor or preview"
                size="sm"
                value={pane === 'preview' ? 'preview' : 'edit'}
                onChange={(v) => setPane(v)}
                options={[
                  { value: 'edit', label: 'Edit section' },
                  { value: 'preview', label: 'Live preview' },
                ]}
              />
            </div>
            <div className={cn('flex min-h-0 flex-1 flex-col', pane === 'preview' && 'hidden')}>{editorPane}</div>
            <div className={cn('flex min-h-0 flex-1 flex-col', pane !== 'preview' && 'hidden')}>{previewPane}</div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-center border-b border-adm-line bg-white py-1.5">
            <Segmented
              label="Sections or editor"
              size="sm"
              value={pane === 'sections' ? 'sections' : 'edit'}
              onChange={(v) => setPane(v)}
              options={[
                { value: 'sections', label: `Sections (${sections.length})` },
                { value: 'edit', label: selected ? `Edit: ${sectionLabel(selected).slice(0, 18)}` : 'Edit' },
              ]}
            />
          </div>
          <div className={cn('flex min-h-0 flex-1 flex-col', pane !== 'sections' && 'hidden')}>{listPane}</div>
          <div className={cn('flex min-h-0 flex-1 flex-col', pane === 'sections' && 'hidden')}>{editorPane}</div>
        </div>
      )}

      <AddSectionModal open={adding} onClose={() => setAdding(false)} onAdd={addSection} afterLabel={selected ? sectionLabel(selected) : undefined} />
      <PageSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} page={page} meta={doc} onChange={(m) => setDoc((d) => (d ? { ...d, ...m } : d))} errors={metaErrors} />
      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        path={`/admin/cms/pages/${page.id}/versions`}
        currentVersion={page.publishedVersion}
        allowPublish
        canDiscard={page.publishedVersion > 0 && (unpublished || autosave.dirty)}
        onDiscard={async () => {
          try {
            await api.post(`/admin/cms/pages/${page.id}/discard`);
            await reload();
            toast.success('Draft discarded', 'The editor now shows the live version.');
          } catch (e) {
            toast.error('Could not discard the draft', errorMessage(e));
            throw e;
          }
        }}
        onRestore={async (version, pub) => {
          try {
            await autosave.flush().catch(() => undefined);
            await api.post(`/admin/cms/pages/${page.id}/versions/${version}/restore`, { publish: pub });
            await reload();
            void qc.invalidateQueries({ queryKey: ['cms-pages'] });
            toast.success(pub ? `Version ${version} restored and published` : `Version ${version} restored to the draft`, pub ? undefined : 'Review it in the preview, then publish.');
          } catch (e) {
            toast.error('Could not restore', errorMessage(e));
            throw e;
          }
        }}
      />
      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={(note) => void publish(note)}
        busy={publishing}
        what={`“${doc.title}”`}
        issues={allIssues.flatMap((s) => issuesFor(s.id).slice(0, 2).map((i) => ({ path: '', message: `${sectionLabel(s)} — ${i.message}` })))}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        danger
        title="Delete this section?"
        body={toDelete && sections.find((s) => s.id === toDelete) ? `“${sectionLabel(sections.find((s) => s.id === toDelete)!)}” will be removed from the draft. You can undo right after, or restore a published version later.` : undefined}
        confirmLabel="Delete section"
        onConfirm={() => toDelete && remove(toDelete)}
      />
      <UnsavedDialog blocker={blocker} onSave={() => autosave.flush()} />
    </div>
  );
}
