import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSite } from '@/app/SiteProvider';
import { Footer } from './Footer';
import { Header } from './Header';
import { AnnouncementBar, CookieNotice, WhatsAppButton } from './SiteOverlays';
import { SmoothScroll } from './SmoothScroll';

/** Pages that start with a full-bleed dark hero call `useHeroHeader()` so the header can sit transparently over it. */
const HeroCtx = createContext<(v: boolean) => void>(() => undefined);
export const useHeroHeader = () => useContext(HeroCtx);
/** Call in a page that renders a full-bleed hero first: the header stays transparent until scroll. */
export function useTransparentHeader(enabled = true) {
  const set = useContext(HeroCtx);
  useEffect(() => {
    set(enabled);
    return () => set(false);
  }, [enabled, set]);
}

export function PageFallback() {
  return <div className="min-h-[70vh]" aria-busy="true" />;
}

export function PublicLayout({ children }: { children?: ReactNode }) {
  const [overHero, setOverHero] = useState(false);
  const loc = useLocation();
  const reduce = useReducedMotion();
  const { theme } = useSite();
  return (
    <HeroCtx.Provider value={setOverHero}>
      <a href="#main" className="sr-only z-[100] bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <SmoothScroll />
      <AnnouncementBar />
      <Header overHero={overHero} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="main"
          key={loc.pathname}
          initial={reduce || theme.motion.intensity === 'subtle' ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-[70vh]"
        >
          <Suspense fallback={<PageFallback />}>{children ?? <Outlet />}</Suspense>
        </motion.main>
      </AnimatePresence>
      <Footer />
      <WhatsAppButton />
      <CookieNotice />
    </HeroCtx.Provider>
  );
}

/** Spacer for pages without a hero (keeps content below the fixed header). */
export const HeaderSpacer = () => <div style={{ height: 'calc(var(--header-h) + var(--announce-h, 0px))' }} aria-hidden />;
