import type { RouteObject } from 'react-router-dom';

/** Bookings (event workspace) and Finance hub — children of `/admin`. */
export const bookingRoutes: RouteObject[] = [
  { path: 'bookings', lazy: () => import('./pages/BookingsList').then((m) => ({ Component: m.default })) },
  { path: 'bookings/:id', lazy: () => import('./pages/BookingWorkspace').then((m) => ({ Component: m.default })) },
  { path: 'finance', lazy: () => import('./finance/FinanceHub').then((m) => ({ Component: m.default })) },
  { path: 'finance/:tab', lazy: () => import('./finance/FinanceHub').then((m) => ({ Component: m.default })) },
];
