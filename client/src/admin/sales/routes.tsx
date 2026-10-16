import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { Permission } from '@maison/shared';
import { RequireStaff } from '@/app/guards';

/** Wraps a lazily loaded page in a permission guard (UX only — the server enforces every permission). */
const page = (load: () => Promise<{ default: ComponentType }>, permission: Permission | Permission[]) => async () => {
  const { default: Page } = await load();
  return {
    Component: function Guarded() {
      return (
        <RequireStaff permission={permission}>
          <Page />
        </RequireStaff>
      );
    },
  };
};

export const salesRoutes: RouteObject[] = [
  { index: true, lazy: page(() => import('./pages/Dashboard'), 'dashboard.view') },
  { path: 'inquiries', lazy: page(() => import('./pages/InquiriesList'), 'inquiries.view') },
  { path: 'inquiries/:id', lazy: page(() => import('./pages/InquiryDetail'), 'inquiries.view') },
  { path: 'clients', lazy: page(() => import('./pages/ClientsList'), 'clients.view') },
  { path: 'clients/:id', lazy: page(() => import('./pages/ClientDetail'), 'clients.view') },
  { path: 'quotations', lazy: page(() => import('./pages/QuotationsList'), 'quotations.manage') },
  { path: 'quotations/new', lazy: page(() => import('./pages/QuotationEditor'), 'quotations.manage') },
  { path: 'quotations/:id', lazy: page(() => import('./pages/QuotationEditor'), 'quotations.manage') },
  { path: 'reports', lazy: page(() => import('./pages/Reports'), 'reports.view') },
];
