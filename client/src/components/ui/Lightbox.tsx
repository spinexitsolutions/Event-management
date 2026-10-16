import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { sized } from '@/lib/image';
import type { GalleryImage } from '@/lib/types';

/** Full-screen image viewer with keyboard (←/→/Esc) and swipe-friendly controls. */
export function Lightbox({ images, index, onClose, onIndex }: { images: GalleryImage[]; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  const open = index !== null;
  const go = useCallback((d: number) => index !== null && onIndex((index + d + images.length) % images.length), [index, images.length, onIndex]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', k);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', k);
      document.body.style.overflow = o;
    };
  }, [open, go, onClose]);
  const img = index !== null ? images[index] : null;
  return createPortal(
    <AnimatePresence>
      {img && (
        <motion.div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/95" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Image viewer">
          <button className="absolute right-4 top-4 z-10 p-2 text-white/70 hover:text-white" onClick={onClose} aria-label="Close">
            <X className="h-7 w-7" strokeWidth={1.25} />
          </button>
          {images.length > 1 && (
            <>
              <button className="absolute left-2 z-10 p-3 text-white/70 hover:text-white sm:left-6" onClick={() => go(-1)} aria-label="Previous image">
                <ChevronLeft className="h-9 w-9" strokeWidth={1} />
              </button>
              <button className="absolute right-2 z-10 p-3 text-white/70 hover:text-white sm:right-6" onClick={() => go(1)} aria-label="Next image">
                <ChevronRight className="h-9 w-9" strokeWidth={1} />
              </button>
            </>
          )}
          <motion.figure key={index} className="flex max-h-full max-w-[92vw] flex-col items-center" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
            <img src={sized(img.url, 2200)} alt={img.alt} className="max-h-[82vh] w-auto object-contain" />
            <figcaption className="mt-4 text-center text-sm tracking-wide text-white/70">
              {img.caption || img.alt} <span className="ml-3 text-white/40">{(index ?? 0) + 1} / {images.length}</span>
            </figcaption>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
