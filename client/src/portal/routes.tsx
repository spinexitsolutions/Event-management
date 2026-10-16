import type { RouteObject } from 'react-router-dom';

/** Client portal — children of `/portal` (wrapped by RequireClient + PortalLayout in App.tsx). */
export const portalRoutes: RouteObject[] = [
  { index: true, lazy: () => import('./pages/Overview').then((m) => ({ Component: m.default })) },
  { path: 'quotations/:id', lazy: () => import('./pages/Proposal').then((m) => ({ Component: m.default })) },
  { path: 'bookings/:id', lazy: () => import('./pages/Booking').then((m) => ({ Component: m.default })) },
  { path: 'account', lazy: () => import('./pages/Account').then((m) => ({ Component: m.default })) },
];
