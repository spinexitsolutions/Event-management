import type { RouteObject } from 'react-router-dom';

/** Operations & administration routes (children of /admin). Each page module is code-split and permission-aware. */
export const opsRoutes: RouteObject[] = [
  { path: 'calendar', lazy: () => import('./pages/CalendarPage').then((m) => ({ Component: m.default })) },
  { path: 'tasks', lazy: () => import('./pages/MyTasksPage').then((m) => ({ Component: m.default })) },
  { path: 'vendors', lazy: () => import('./pages/VendorsPage').then((m) => ({ Component: m.default })) },
  { path: 'vendors/:id', lazy: () => import('./pages/VendorDetailPage').then((m) => ({ Component: m.default })) },
  { path: 'venues', lazy: () => import('./pages/VenuesPage').then((m) => ({ Component: m.default })) },
  { path: 'venues/:id', lazy: () => import('./pages/VenueEditorPage').then((m) => ({ Component: m.default })) },
  { path: 'inventory', lazy: () => import('./pages/InventoryPage').then((m) => ({ Component: m.default })) },
  { path: 'settings/staff', lazy: () => import('./pages/StaffPage').then((m) => ({ Component: m.default })) },
  { path: 'settings/notifications', lazy: () => import('./pages/NotificationsPage').then((m) => ({ Component: m.default })) },
  { path: 'settings/audit', lazy: () => import('./pages/AuditPage').then((m) => ({ Component: m.default })) },
  { path: 'settings/business', lazy: () => import('./pages/BusinessPage').then((m) => ({ Component: m.default })) },
  { path: 'settings/integrations', lazy: () => import('./pages/IntegrationsPage').then((m) => ({ Component: m.default })) },
  { path: 'settings/task-templates', lazy: () => import('./pages/TaskTemplatesPage').then((m) => ({ Component: m.default })) },
  { path: 'account', lazy: () => import('./pages/AccountPage').then((m) => ({ Component: m.default })) },
];
