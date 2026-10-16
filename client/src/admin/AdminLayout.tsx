import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ExternalLink, LogOut, Menu, User, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fromNow } from '@/lib/format';
import { AdminSpinner } from './ui';
import { ADMIN_NAV } from './nav';

interface Notification { id: string; title: string; body: string; link: string; readAt: string | null; createdAt: string }

function NotificationsBell() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const count = useQuery({ queryKey: ['notif-count'], queryFn: () => api.get<{ count: number }>('/notifications/unread-count'), refetchInterval: 45_000 });
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<Notification[]>('/notifications', { limit: 15 }), enabled: open });
  const n = count.data?.count ?? 0;
  const markAll = async () => {
    await api.post('/notifications/read-all');
    void qc.invalidateQueries({ queryKey: ['notif-count'] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-lg p-2 text-adm-muted hover:bg-adm-bg hover:text-adm-ink" aria-label={`Notifications${n ? ` (${n} unread)` : ''}`}>
        <Bell className="h-5 w-5" />
        {n > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-adm-gold px-1 text-[10px] font-semibold text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(360px,90vw)] overflow-hidden rounded-xl border border-adm-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-adm-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <button onClick={markAll} className="text-xs text-adm-gold hover:underline">
                Mark all read
              </button>
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {list.isLoading && <li className="p-4 text-sm text-adm-muted">Loading…</li>}
              {list.data?.length === 0 && <li className="p-6 text-center text-sm text-adm-muted">You’re all caught up.</li>}
              {list.data?.map((x) => (
                <li key={x.id}>
                  <button
                    className={cn('block w-full border-b border-adm-line/60 px-4 py-3 text-left text-sm hover:bg-adm-bg', !x.readAt && 'bg-[#FBF7EE]')}
                    onClick={async () => {
                      await api.post(`/notifications/${x.id}/read`).catch(() => undefined);
                      void qc.invalidateQueries({ queryKey: ['notif-count'] });
                      setOpen(false);
                      if (x.link) nav(x.link);
                    }}
                  >
                    <p className="font-medium">{x.title}</p>
                    {x.body && <p className="mt-0.5 line-clamp-2 text-adm-muted">{x.body}</p>}
                    <p className="mt-1 text-xs text-adm-muted">{fromNow(x.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { user, canAny, logout } = useAuth();
  const { site } = useSite();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    document.body.classList.add('admin');
    document.body.classList.remove('site');
    return () => document.body.classList.remove('admin');
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.any || canAny(...i.any)) })).filter((g) => g.items.length);

  const sidebar = (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link to="/admin" className="truncate text-sm font-semibold uppercase tracking-[0.25em] text-white">
          {site?.brand.wordmark || site?.brand.name || 'Studio'}
        </Link>
        <button className="p-1 text-white/60 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {groups.map((g, i) => (
          <div key={i}>
            {g.label && <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">{g.label}</p>}
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition', isActive ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white')}
              >
                <it.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/65 hover:bg-white/5 hover:text-white">
          <ExternalLink className="h-4 w-4" /> View website
        </a>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60 print:pl-0">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 bg-adm-dark lg:block print:hidden">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-adm-dark">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-16 print:hidden items-center justify-between gap-3 border-b border-adm-line bg-white/90 px-4 backdrop-blur lg:px-8">
        <button className="rounded-lg p-2 text-adm-muted hover:bg-adm-bg lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex-1" />
        <NotificationsBell />
        <div className="flex items-center gap-2">
          <Link to="/admin/account" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-adm-bg">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-adm-gold/15 text-xs font-semibold text-adm-gold">
              {user?.name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || <User className="h-4 w-4" />}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight">{user?.name}</span>
              <span className="block text-xs text-adm-muted">{user?.roleName}</span>
            </span>
          </Link>
          <button
            onClick={async () => {
              await logout();
              nav('/login');
            }}
            className="rounded-lg p-2 text-adm-muted hover:bg-adm-bg hover:text-adm-ink"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
        <Suspense fallback={<AdminSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
