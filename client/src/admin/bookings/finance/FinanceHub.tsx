import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { RequireStaff } from '@/app/guards';
import { useAuth } from '@/app/AuthProvider';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { PageHeader, Stat, Tabs } from '@/admin/ui';
import type { Payment, Refund } from '../types';
import { monthStartIso, todayIso } from '../shared/hooks';
import { InvoicesPanel } from './InvoicesPanel';
import { PaymentsPanel } from './PaymentsPanel';
import { RefundsPanel } from './RefundsPanel';
import { ExpensesPanel } from './ExpensesPanel';

const TABS = [
  { value: 'invoices', label: 'Invoices' },
  { value: 'payments', label: 'Payments' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'expenses', label: 'Expenses' },
] as const;
type TabKey = (typeof TABS)[number]['value'];

interface DashboardMoney {
  money: { receivedMinor: number; outstandingMinor: number } | null;
}

function Summary() {
  const { can } = useAuth();
  const range = { from: monthStartIso(), to: todayIso() };
  const dash = useQuery({ queryKey: ['finance', 'dashboard-money', range], queryFn: () => api.get<DashboardMoney>('/admin/dashboard', range), enabled: can('dashboard.view') });
  // Fallback when the dashboard is not available to this role: sum this month's received payments directly.
  const pays = useQuery({
    queryKey: ['finance', 'month-payments', range],
    queryFn: () => api.getPaged<Payment[]>('/admin/finance/payments', { ...range, limit: 100 }),
    enabled: !can('dashboard.view'),
  });
  const refunds = useQuery({ queryKey: ['finance', 'refunds'], queryFn: () => api.get<Refund[]>('/admin/finance/refunds') });
  const expenses = useQuery({ queryKey: ['finance', 'month-expenses', range], queryFn: () => api.getPaged<unknown[]>('/admin/finance/expenses', { ...range, limit: 1 }) });

  const received = dash.data?.money?.receivedMinor ?? (pays.data ? pays.data.data.filter((p) => p.status !== 'CREATED' && p.status !== 'FAILED').reduce((s, p) => s + p.amountMinor - p.refundedMinor, 0) : undefined);
  const pending = refunds.data?.filter((r) => r.status === 'REQUESTED') ?? [];
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });
  const v = (x: number | undefined, loading: boolean) => (loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-adm-line/70" /> : x === undefined ? '—' : money(x));
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label={`Received in ${monthName}`} value={v(received, dash.isLoading || pays.isLoading)} tone="good" hint="Net of processed refunds" />
      <Stat label="Outstanding" value={v(dash.data?.money?.outstandingMinor, dash.isLoading)} tone="gold" hint="Unpaid balances on active bookings" />
      <Stat label="Refunds pending" value={refunds.isLoading ? v(undefined, true) : pending.length} tone={pending.length ? 'warn' : 'default'} hint={pending.length ? `${money(pending.reduce((s, r) => s + r.amountMinor, 0))} awaiting approval` : 'None awaiting approval'} />
      <Stat label={`Expenses in ${monthName}`} value={v(expenses.data?.meta?.totalMinor as number | undefined, expenses.isLoading)} hint={expenses.data?.meta ? `${expenses.data.meta.total} entries` : undefined} />
    </div>
  );
}

function Hub() {
  const { tab } = useParams();
  const nav = useNavigate();
  const current: TabKey = TABS.some((t) => t.value === tab) ? (tab as TabKey) : 'invoices';
  return (
    <div>
      <PageHeader title="Finance" subtitle="Invoices, payments, refunds and event expenses across every booking." />
      <Summary />
      <Tabs tabs={TABS.map((t) => ({ ...t }))} value={current} onChange={(t) => nav(`/admin/finance/${t}`, { replace: true })} className="mb-5" />
      {current === 'invoices' && <InvoicesPanel />}
      {current === 'payments' && <PaymentsPanel />}
      {current === 'refunds' && <RefundsPanel />}
      {current === 'expenses' && <ExpensesPanel />}
    </div>
  );
}

export default function FinanceHub() {
  return (
    <RequireStaff permission="finance.view">
      <Hub />
    </RequireStaff>
  );
}
