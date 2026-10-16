import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@maison/shared';
import { api, setUnauthorizedHandler } from '@/lib/api';
import type { Me } from '@/lib/types';

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  can: (p: Permission) => boolean;
  canAny: (...p: Permission[]) => boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, can: () => false, canAny: () => false, refresh: async () => undefined, logout: async () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me | null>('/auth/me'), staleTime: 5 * 60_000, retry: false });
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (qc.getQueryData(['me'])) qc.setQueryData(['me'], null);
    });
  }, [qc]);
  const user = q.data ?? null;
  const can = useCallback((p: Permission) => !!user?.permissions.includes(p), [user]);
  const canAny = useCallback((...p: Permission[]) => p.some((x) => user?.permissions.includes(x)), [user]);
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
  }, [qc]);
  const value = useMemo(() => ({ user, loading: q.isLoading, can, canAny, refresh: q.refetch, logout }), [user, q.isLoading, can, canAny, q.refetch, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
