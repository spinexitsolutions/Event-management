import type { RouteObject } from 'react-router-dom';

/** Authentication pages — rendered inside PublicLayout so they share the site header, theme and footer. */
export const authRoutes: RouteObject[] = [
  { path: '/login', lazy: () => import('./pages/Login').then((m) => ({ Component: m.default })) },
  { path: '/register', lazy: () => import('./pages/Register').then((m) => ({ Component: m.default })) },
  { path: '/verify-email', lazy: () => import('./pages/VerifyEmail').then((m) => ({ Component: m.default })) },
  { path: '/forgot-password', lazy: () => import('./pages/ForgotPassword').then((m) => ({ Component: m.default })) },
  { path: '/reset-password', lazy: () => import('./pages/ResetPassword').then((m) => ({ Component: m.default })) },
];
