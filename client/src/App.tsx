import { createBrowserRouter, RouterProvider, useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { RequireClient, RequireStaff } from '@/app/guards';
import { AdminLayout } from '@/admin/AdminLayout';
import { PortalLayout } from '@/portal/PortalLayout';
import { publicRoutes, bareRoutes } from '@/public/routes';
import { authRoutes } from '@/auth/routes';
import { portalRoutes } from '@/portal/routes';
import { cmsRoutes } from '@/admin/cms/routes';
import { salesRoutes } from '@/admin/sales/routes';
import { opsRoutes } from '@/admin/ops/routes';

function RouteError() {
  const err = useRouteError();
  const chunk = err instanceof Error && /dynamically imported module|Loading chunk/i.test(err.message);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center font-admin">
      <h1 className="text-xl font-semibold">{chunk ? 'A new version is available' : isRouteErrorResponse(err) && err.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="max-w-md text-sm text-neutral-500">{chunk ? 'Please reload to get the latest version of the site.' : 'Please try again. If the problem continues, contact us.'}</p>
      <div className="flex gap-3">
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white" onClick={() => window.location.reload()}>
          Reload
        </button>
        <Link to="/" className="rounded-lg border px-4 py-2 text-sm">
          Home
        </Link>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      ...bareRoutes,
      {
        path: '/admin',
        element: (
          <RequireStaff>
            <AdminLayout />
          </RequireStaff>
        ),
        children: [...salesRoutes, ...cmsRoutes, ...opsRoutes],
      },
      {
        path: '/portal',
        element: (
          <RequireClient>
            <PortalLayout />
          </RequireClient>
        ),
        children: portalRoutes,
      },
      { element: <PublicLayout />, children: [...authRoutes, ...publicRoutes] },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
