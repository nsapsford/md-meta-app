import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'framer-motion';

const loadFeatures = () => import('./features').then(mod => mod.default);

// strict forbids the full-size <motion.*> components anywhere in the tree —
// everything must use <m.*>, which keeps framer-motion's entry cost tiny.
// reducedMotion="user" disables transform/layout animation when the OS asks.
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
