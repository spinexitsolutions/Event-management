import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { errorMessage } from '@/lib/api';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

/**
 * Debounced autosave. Compares the JSON of `value` with the last saved snapshot and calls `save` after `delay` ms
 * of inactivity. Saves are serialised so an older request can never overwrite a newer one.
 * Call `reset(value)` after loading (or restoring) to set the saved baseline without saving.
 */
export function useAutosave<T>(value: T | null | undefined, save: (v: T) => Promise<unknown>, { delay = 900, onSaved }: { delay?: number; onSaved?: () => void } = {}) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const baseline = useRef<string | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const chain = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((): Promise<void> => {
    const run = async () => {
      const v = latest.current;
      if (v === null || v === undefined || baseline.current === null) return;
      const json = JSON.stringify(v);
      if (json === baseline.current) {
        setStatus('saved');
        return;
      }
      setStatus('saving');
      try {
        await saveRef.current(v);
        baseline.current = json;
        setError(null);
        setStatus(JSON.stringify(latest.current) === json ? 'saved' : 'unsaved');
        onSavedRef.current?.();
      } catch (e) {
        setError(errorMessage(e));
        setStatus('error');
        throw e;
      }
    };
    const p = chain.current.then(run, run);
    chain.current = p.catch(() => undefined);
    return p;
  }, []);

  const json = value === null || value === undefined ? null : JSON.stringify(value);
  useEffect(() => {
    if (json === null || baseline.current === null || json === baseline.current) return;
    setStatus((s) => (s === 'saving' ? s : 'unsaved'));
    const t = setTimeout(() => void flush().catch(() => undefined), delay);
    return () => clearTimeout(t);
  }, [json, delay, flush]);

  const reset = useCallback((v: T) => {
    baseline.current = JSON.stringify(v);
    setStatus('saved');
    setError(null);
  }, []);

  return { status, error, flush, reset, dirty: status !== 'saved' };
}

/** Warns before leaving (in-app navigation and tab close) while `when` is true. Returns the blocker for a confirm dialog. */
export function useUnsavedGuard(when: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!when) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [when]);
  return blocker;
}

export type PreviewMessage =
  | { type: 'preview'; theme?: unknown; site?: unknown }
  | { type: 'preview-sections'; sections: unknown[] }
  | { type: 'scroll-to'; sectionId: string }
  | { type: 'refresh' };

/**
 * Same-origin live-preview channel to the site iframe. `onReady` fires when the site reports it is ready
 * (and again shortly after each load, in case a lazily loaded preview route mounts its listener later).
 */
export function usePreviewFrame(onReady: () => void) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return;
      if (e.data?.source === 'maison-site' && e.data.type === 'ready') {
        setReady(true);
        readyRef.current();
      }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  const post = useCallback((msg: PreviewMessage) => {
    ref.current?.contentWindow?.postMessage({ source: 'maison-admin', ...msg }, window.location.origin);
  }, []);
  const onLoad = useCallback(() => {
    setReady(true);
    for (const ms of [50, 400, 1200, 2500]) setTimeout(() => readyRef.current(), ms);
  }, []);
  return { ref, ready, post, onLoad };
}

/** Debounces a value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Tracks a media query. */
export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return m;
}
