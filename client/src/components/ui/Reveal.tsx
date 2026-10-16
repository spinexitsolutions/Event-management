import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const variants: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: (delay: number) => ({ opacity: 1, y: 0, transition: { duration: 1, ease: [0.22, 1, 0.36, 1], delay } }),
};

/** Scroll-triggered reveal. Disabled automatically for users who prefer reduced motion. */
export function Reveal({ children, delay = 0, className, as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'section' | 'article' }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const M = motion[as];
  return (
    <M className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -12% 0px' }} variants={variants} custom={delay}>
      {children}
    </M>
  );
}

/** Staggered children reveal. */
export function Stagger({ children, className, stagger = 0.08 }: { children: ReactNode; className?: string; stagger?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -10% 0px' }} variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}>
      {children}
    </motion.div>
  );
}
export const staggerItem: Variants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } };
