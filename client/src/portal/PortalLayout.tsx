import { LogOut } from 'lucide-react';
import { Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Brand } from '@/components/layout/Brand';
import { cn } from '@/lib/cn';

/** Client portal shell — follows the public theme for a seamless brand experience. */
export function PortalLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    document.body.classList.add('site');
    return () => undefined;
  }, []);
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="container-site flex h-20 items-center justify-between gap-6">
          <Brand />
          <nav className="flex items-center gap-6 text-[0.72rem] uppercase" style={{ letterSpacing: '0.2em' }} aria-label="Portal">
            <NavLink to="/portal" end className={({ isActive }) => cn('opacity-70 hover:opacity-100', isActive && 'text-primary opacity-100')}>
              My events
            </NavLink>
            <NavLink to="/portal/account" className={({ isActive }) => cn('opacity-70 hover:opacity-100', isActive && 'text-primary opacity-100')}>
              Account
            </NavLink>
            <span className="hidden normal-case tracking-normal text-muted md:inline">{user?.name}</span>
            <button
              onClick={async () => {
                await logout();
                nav('/');
              }}
              className="opacity-70 hover:opacity-100"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="container-site py-10 sm:py-14">
        <Suspense fallback={<div className="min-h-[50vh]" aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        <Link to="/" className="hover:text-primary">
          Back to the website
        </Link>
      </footer>
    </div>
  );
}
