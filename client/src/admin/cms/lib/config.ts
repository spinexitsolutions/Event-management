import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAutosave } from './hooks';
import type { ConfigDoc } from './types';

export type ConfigKey = 'theme' | 'site';

/**
 * Draft → publish → versions editor state for a site configuration document ("theme" or "site").
 * Local edits autosave to the draft; publishing validates on the server and snapshots a version.
 */
export function useConfigEditor<T>(key: ConfigKey, normalize: (draft: unknown, published: unknown) => T) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cms-config', key], queryFn: () => api.get<ConfigDoc<unknown>>(`/admin/cms/site/${key}`) });
  const [value, setValue] = useState<T | null>(null);
  const normRef = useRef(normalize);
  normRef.current = normalize;
  const autosave = useAutosave(value, (v) => api.put(`/admin/cms/site/${key}/draft`, v), { delay: 800 });
  const { reset } = autosave;
  const init = useCallback(
    (doc: ConfigDoc<unknown>) => {
      const v = normRef.current(doc.draft, doc.published);
      setValue(v);
      reset(v);
    },
    [reset],
  );
  const loaded = useRef(false);
  useEffect(() => {
    if (q.data && !loaded.current) {
      loaded.current = true;
      init(q.data);
    }
  }, [q.data, init]);
  const reload = async () => {
    const r = await q.refetch();
    if (r.data) init(r.data);
  };
  const published = q.data ? normRef.current(q.data.published, q.data.published) : null;
  const hasUnpublished = !!value && !!published && JSON.stringify(value) !== JSON.stringify(published);

  const publish = async (note: string) => {
    await autosave.flush();
    const r = await api.post<{ version: number }>(`/admin/cms/site/${key}/publish`, { note });
    await reload();
    void qc.invalidateQueries({ queryKey: ['bootstrap'] });
    void qc.invalidateQueries({ queryKey: ['cms-versions'] });
    return r;
  };
  const discard = async () => {
    await api.post(`/admin/cms/site/${key}/discard`);
    await reload();
  };
  const restore = async (version: number) => {
    await autosave.flush().catch(() => undefined);
    await api.post(`/admin/cms/site/${key}/versions/${version}/restore`);
    await reload();
  };
  return { q, value, setValue, autosave, published, hasUnpublished, publish, discard, restore, publishedVersion: q.data?.publishedVersion ?? 0, lastPublishedAt: q.data?.lastPublishedAt ?? null };
}
