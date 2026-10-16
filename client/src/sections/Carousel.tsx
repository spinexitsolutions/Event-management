import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { A11y, Autoplay, Keyboard } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import { cn } from '@/lib/cn';

/**
 * Swiper carousel with theme-styled previous/next controls and a progress line.
 * `per` sets slides per view at [mobile, tablet, desktop].
 */
export function Carousel({ children, per = [1.1, 2.2, 3], gap = 28, autoplay, label, className, loop }: { children: ReactNode[]; per?: [number, number, number]; gap?: number; autoplay?: number; label: string; className?: string; loop?: boolean }) {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  const [state, setState] = useState({ begin: true, end: false, progress: 0 });
  const reduce = useReducedMotion();
  const sync = (s: SwiperType) => setState({ begin: s.isBeginning, end: s.isEnd, progress: s.progress });
  const canLoop = !!loop && children.length > Math.ceil(per[2]) + 1;
  return (
    <div className={cn('relative', className)} role="region" aria-roledescription="carousel" aria-label={label}>
      <Swiper
        modules={[A11y, Keyboard, Autoplay]}
        onSwiper={(s) => {
          setSwiper(s);
          sync(s);
        }}
        onSlideChange={sync}
        onProgress={sync}
        keyboard={{ enabled: true, onlyInViewport: true }}
        a11y={{ enabled: true }}
        loop={canLoop}
        speed={reduce ? 0 : 900}
        autoplay={autoplay && !reduce ? { delay: autoplay, disableOnInteraction: true, pauseOnMouseEnter: true } : false}
        spaceBetween={gap}
        slidesPerView={per[0]}
        breakpoints={{ 640: { slidesPerView: per[1] }, 1024: { slidesPerView: per[2] } }}
        className="!overflow-visible"
      >
        {children.map((c, i) => (
          <SwiperSlide key={i} className="!h-auto">
            {c}
          </SwiperSlide>
        ))}
      </Swiper>
      <div className="mt-10 flex items-center gap-6">
        <div className="relative h-px flex-1 bg-line" aria-hidden>
          <div className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-700 ease-lux" style={{ width: `${Math.max(8, (canLoop ? ((swiper?.realIndex ?? 0) + 1) / children.length : state.progress) * 100)}%` }} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => swiper?.slidePrev()} disabled={!canLoop && state.begin} className="flex h-12 w-12 items-center justify-center rounded-full border border-line transition hover:border-primary hover:text-primary disabled:opacity-30" aria-label="Previous slide">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button type="button" onClick={() => swiper?.slideNext()} disabled={!canLoop && state.end} className="flex h-12 w-12 items-center justify-center rounded-full border border-line transition hover:border-primary hover:text-primary disabled:opacity-30" aria-label="Next slide">
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
