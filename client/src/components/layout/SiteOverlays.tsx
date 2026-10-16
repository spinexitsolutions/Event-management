import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSite } from '@/app/SiteProvider';
import { SmartLink } from '../ui/SmartLink';

export function AnnouncementBar() {
  const { site } = useSite();
  const ref = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('announce-dismissed') === site?.announcement.text;
    } catch {
      return false;
    }
  });
  const show = !!site?.announcement.enabled && !!site.announcement.text && !dismissed;
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--announce-h', show && ref.current ? `${ref.current.offsetHeight}px` : '0px');
  }, [show, site?.announcement.text]);
  if (!show || !site) return null;
  const a = site.announcement;
  return (
    <div ref={ref} className="fixed left-0 top-0 z-[55] w-full bg-primary px-10 py-2 text-center text-[0.72rem] uppercase text-on-primary" style={{ letterSpacing: '0.18em' }}>
      <span>{a.text}</span>
      {a.href && (
        <SmartLink href={a.href} className="ml-3 underline underline-offset-4">
          {a.linkLabel || 'Learn more'}
        </SmartLink>
      )}
      <button
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-70 hover:opacity-100"
        aria-label="Dismiss announcement"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem('announce-dismissed', a.text);
          } catch {
            /* ignore */
          }
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function WhatsAppButton() {
  const { site } = useSite();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);
  if (!site?.floatingWhatsApp || !site.company.whatsapp) return null;
  const href = `https://wa.me/${site.company.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(site.company.whatsappMessage)}`;
  return (
    <AnimatePresence>
      {visible && (
        <motion.a
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_-8px_rgba(37,211,102,0.6)] transition hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
        </motion.a>
      )}
    </AnimatePresence>
  );
}

export function CookieNotice() {
  const { site } = useSite();
  const [ok, setOk] = useState(() => {
    try {
      return localStorage.getItem('cookie-ok') === '1';
    } catch {
      return true;
    }
  });
  if (!site?.cookieNotice || ok) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[65] max-w-sm border border-line bg-surface p-5 text-sm text-ink shadow-2xl" role="region" aria-label="Cookie notice">
      <p className="opacity-80">We use essential cookies to keep you signed in and secure. No advertising trackers.</p>
      <div className="mt-4 flex items-center gap-4">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setOk(true);
            try {
              localStorage.setItem('cookie-ok', '1');
            } catch {
              /* ignore */
            }
          }}
        >
          Understood
        </button>
        <SmartLink href="/privacy-policy" className="text-xs underline underline-offset-4 opacity-70">
          Privacy policy
        </SmartLink>
      </div>
    </div>
  );
}
