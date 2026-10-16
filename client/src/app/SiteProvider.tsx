import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_THEME, type SiteSettings, type ThemeTokens } from '@maison/shared';
import { api } from '@/lib/api';
import { applyTheme } from '@/lib/theme';
import type { Bootstrap } from '@/lib/types';

interface SiteCtx {
  bootstrap: Bootstrap | null;
  site: SiteSettings | null;
  theme: ThemeTokens;
  loading: boolean;
  /** Draft preview: the admin theme editor / page builder pushes unpublished tokens and settings here. */
  setPreview: (p: { theme?: ThemeTokens; site?: SiteSettings } | null) => void;
  isPreview: boolean;
}

const Ctx = createContext<SiteCtx>({ bootstrap: null, site: null, theme: DEFAULT_THEME, loading: true, setPreview: () => undefined, isPreview: false });

/**
 * Loads the published theme + global settings and applies them as CSS variables.
 * Polls the content version so publishes appear without a reload or redeploy.
 * In preview mode (iframe inside the admin), listens for postMessage drafts from the editor.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<{ theme?: ThemeTokens; site?: SiteSettings } | null>(null);
  const q = useQuery({ queryKey: ['bootstrap'], queryFn: () => api.get<Bootstrap>('/public/bootstrap'), staleTime: 60_000 });
  const version = useQuery({ queryKey: ['site-version'], queryFn: () => api.get<{ version: string }>('/public/version'), refetchInterval: 60_000, refetchOnWindowFocus: true, enabled: !!q.data });

  useEffect(() => {
    if (version.data && q.data && version.data.version !== q.data.version) void q.refetch();
  }, [version.data, q]);

  // Live preview channel (only accepted from the same origin).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || e.data.source !== 'maison-admin') return;
      if (e.data.type === 'preview') setPreview({ theme: e.data.theme, site: e.data.site });
    };
    window.addEventListener('message', onMsg);
    if (window.parent !== window) window.parent.postMessage({ source: 'maison-site', type: 'ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const theme = preview?.theme ?? q.data?.theme ?? DEFAULT_THEME;
  const site = preview?.site ?? q.data?.site ?? null;
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (!site) return;
    const fav = site.brand.faviconUrl || '/favicon.svg';
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = fav;
  }, [site]);

  const value = useMemo<SiteCtx>(() => ({ bootstrap: q.data ?? null, site, theme, loading: q.isLoading, setPreview, isPreview: !!preview }), [q.data, q.isLoading, site, theme, preview]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSite = () => useContext(Ctx);
