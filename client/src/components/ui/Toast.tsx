import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: Kind; title: string; body?: string }
const Ctx = createContext<(kind: Kind, title: string, body?: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: Kind, title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, kind, title, body }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className="pointer-events-auto flex gap-3 rounded-xl border border-black/10 bg-white p-4 font-admin text-sm text-neutral-900 shadow-2xl" role={t.kind === 'error' ? 'alert' : 'status'}>
              {t.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : t.kind === 'error' ? <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" /> : <Info className="h-5 w-5 shrink-0 text-sky-600" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                {t.body && <p className="mt-0.5 text-neutral-600">{t.body}</p>}
              </div>
              <button onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} aria-label="Dismiss" className="text-neutral-400 hover:text-neutral-700">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return {
    success: (title: string, body?: string) => push('success', title, body),
    error: (title: string, body?: string) => push('error', title, body),
    info: (title: string, body?: string) => push('info', title, body),
  };
}
