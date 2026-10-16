import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Permission } from '@maison/shared';
import { useAuth } from './AuthProvider';

function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
    </div>
  );
}

/** UX-only route guards — the server enforces every permission independently. */
export function RequireStaff({ children, permission }: { children: ReactNode; permission?: Permission | Permission[] }) {
  const { user, loading, canAny } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!user.isStaff) return <Navigate to="/portal" replace />;
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!canAny(...list))
      return (
        <div className="p-10 text-center">
          <h1 className="text-lg font-semibold">You don’t have access to this area</h1>
          <p className="mt-2 text-sm text-adm-muted">Ask a Super Admin to grant your role the required permission.</p>
        </div>
      );
  }
  return <>{children}</>;
}

export function RequireClient({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user.isStaff) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export { FullPageSpinner };
