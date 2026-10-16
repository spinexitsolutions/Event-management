import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { cn } from '@/lib/cn';
import { ButtonLink } from '../ui/Button';
import { SmartLink } from '../ui/SmartLink';
import { Brand } from './Brand';

/**
 * Header styles (theme → header.style):
 *  transparent — over the hero, turning solid on scroll;  solid — always solid;  centered — logo centred above the menu.
 * Pages without a dark hero pass `forceSolid`.
 */
export function Header({ overHero }: { overHero: boolean }) {
  const { site, theme } = useSite();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const loc = useLocation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    setOpen(false);
    setMenu(null);
  }, [loc.pathname]);
  if (!site) return <div style={{ height: 'var(--header-h)' }} />;
  const style = theme.header.style;
  const transparent = style !== 'solid' && overHero && !scrolled && !open;
  const nav = site.navigation;
  const portalHref = user ? (user.isStaff ? '/admin' : '/portal') : '/login';

  return (
    <header
      className={cn(
        'z-50 w-full transition-[background,color,box-shadow,backdrop-filter] duration-500 ease-lux',
        theme.header.sticky ? 'fixed left-0 top-[var(--announce-h,0px)]' : 'absolute left-0 top-[var(--announce-h,0px)]',
        transparent ? 'on-image bg-transparent text-white' : 'border-b border-line/60 bg-bg/85 text-ink backdrop-blur-xl',
      )}
    >
      <div className={cn('container-site flex items-center gap-6', style === 'centered' ? 'flex-col py-4 lg:gap-3' : 'h-[var(--header-h)] justify-between')}>
        <div className={cn('flex items-center', style === 'centered' && 'w-full justify-between lg:justify-center')}>
          <Brand light={transparent} />
          <button className="p-2 lg:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="h-6 w-6" strokeWidth={1.25} /> : <Menu className="h-6 w-6" strokeWidth={1.25} />}
          </button>
        </div>

        <nav aria-label="Primary" className={cn('hidden items-center lg:flex', style === 'centered' ? 'gap-9' : 'gap-8')}>
          {nav.map((item, i) =>
            item.children.length ? (
              <div key={i} className="relative" onMouseEnter={() => setMenu(i)} onMouseLeave={() => setMenu(null)}>
                <button className="flex items-center gap-1 py-6 text-[0.74rem] uppercase opacity-90 transition hover:opacity-100" style={{ letterSpacing: '0.22em' }} aria-expanded={menu === i} onClick={() => setMenu(menu === i ? null : i)}>
                  {item.label}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', menu === i && 'rotate-180')} />
                </button>
                <AnimatePresence>
                  {menu === i && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.25 }} className="absolute left-1/2 top-full w-72 -translate-x-1/2 border border-line bg-surface p-3 text-ink shadow-2xl">
                      {item.children.map((c, j) => (
                        <SmartLink key={j} href={c.href} newTab={c.newTab} className="block px-4 py-2.5 text-sm text-ink/80 transition hover:bg-surface-2 hover:text-primary">
                          {c.label}
                        </SmartLink>
                      ))}
                      {item.href && (
                        <SmartLink href={item.href} className="mt-1 block border-t border-line px-4 pb-1 pt-3 text-[0.7rem] uppercase text-primary" style={{ letterSpacing: '0.2em' }}>
                          View all
                        </SmartLink>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : item.href.startsWith('/') ? (
              <NavLink key={i} to={item.href} className={({ isActive }) => cn('relative py-6 text-[0.74rem] uppercase opacity-90 transition hover:opacity-100', isActive && 'opacity-100 after:absolute after:bottom-5 after:left-0 after:h-px after:w-full after:bg-primary')} style={{ letterSpacing: '0.22em' }}>
                {item.label}
              </NavLink>
            ) : (
              <SmartLink key={i} href={item.href} newTab={item.newTab} className="py-6 text-[0.74rem] uppercase opacity-90 hover:opacity-100" style={{ letterSpacing: '0.22em' }}>
                {item.label}
              </SmartLink>
            ),
          )}
        </nav>

        <div className={cn('hidden items-center gap-5 lg:flex', style === 'centered' && 'absolute right-12 top-6')}>
          {theme.header.showClientLogin && (
            <Link to={portalHref} className="text-[0.72rem] uppercase opacity-80 hover:opacity-100" style={{ letterSpacing: '0.22em' }}>
              {user ? (user.isStaff ? 'Admin' : 'My portal') : 'Client login'}
            </Link>
          )}
          {theme.header.ctaLabel && (
            <ButtonLink href={theme.header.ctaHref || '/inquire'} size="sm" variant={transparent ? 'secondary' : 'primary'}>
              {theme.header.ctaLabel}
            </ButtonLink>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav id="mobile-nav" aria-label="Mobile" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-line bg-bg lg:hidden">
            <div className="container-site max-h-[calc(100vh-var(--header-h))] overflow-y-auto py-6">
              {nav.map((item, i) => (
                <div key={i} className="border-b border-line/60 py-3">
                  <SmartLink href={item.href} className="font-heading text-2xl">
                    {item.label}
                  </SmartLink>
                  {item.children.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      {item.children.map((c, j) => (
                        <SmartLink key={j} href={c.href} className="py-1 text-sm text-muted">
                          {c.label}
                        </SmartLink>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="mt-6 flex flex-col gap-3">
                <ButtonLink href={theme.header.ctaHref || '/inquire'}>{theme.header.ctaLabel || 'Book your event'}</ButtonLink>
                <ButtonLink href={portalHref} variant="secondary">
                  {user ? (user.isStaff ? 'Admin' : 'My portal') : 'Client login'}
                </ButtonLink>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
