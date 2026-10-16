import { Navigate, type RouteObject } from 'react-router-dom';

/** Website CMS routes (children of /admin). */
export const cmsRoutes: RouteObject[] = [
  { path: 'website', element: <Navigate to="/admin/website/pages" replace /> },
  { path: 'website/pages', lazy: () => import('./pages/PagesList').then((m) => ({ Component: m.default })) },
  { path: 'website/pages/:id', lazy: () => import('./pages/PageBuilder').then((m) => ({ Component: m.default })) },
  { path: 'website/theme', lazy: () => import('./pages/ThemeEditor').then((m) => ({ Component: m.default })) },
  { path: 'website/settings', lazy: () => import('./pages/SiteSettingsEditor').then((m) => ({ Component: m.default })) },
  { path: 'website/content', lazy: () => import('./pages/ContentHub').then((m) => ({ Component: m.default })) },
  { path: 'website/content/:collection', lazy: () => import('./pages/ContentList').then((m) => ({ Component: m.default })) },
  { path: 'website/content/:collection/:id', lazy: () => import('./pages/ContentEditor').then((m) => ({ Component: m.default })) },
  { path: 'website/media', lazy: () => import('./pages/MediaLibrary').then((m) => ({ Component: m.default })) },
  { path: 'website/subscribers', lazy: () => import('./pages/Subscribers').then((m) => ({ Component: m.default })) },
];
