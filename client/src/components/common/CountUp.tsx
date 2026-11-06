import { useLayoutEffect, useRef } from 'react';

interface CountUpProps {
  value: number;
  /** Decimal places to render (default 1). */
  decimals?: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Every running count-up shares one requestAnimationFrame loop and writes
// straight to its <span>'s textContent. The previous version kept the live
// value in React state, so a 25×25 matchup matrix meant ~625 component
// re-renders per frame for the whole 400ms tween. This version causes none.
type Tween = { el: HTMLElement; start: number; target: number; duration: number; format: (n: number) => string };
const tweens = new Set<Tween>();
let frame = 0;

function tick(now: number) {
  for (const t of tweens) {
    const p = Math.min((now - t.start) / t.duration, 1);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    t.el.textContent = t.format(t.target * eased);
    if (p >= 1) tweens.delete(t);
  }
  frame = tweens.size > 0 ? requestAnimationFrame(tick) : 0;
}

// Animates 0 → value on mount and whenever value changes.
export default function CountUp({ value, decimals = 1, suffix = '', prefix = '', durationMs = 400 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const format = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`;
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      el.textContent = format(value);
      return;
    }
    el.textContent = format(0);
    const tween: Tween = { el, start: performance.now(), target: value, duration: durationMs, format };
    tweens.add(tween);
    if (!frame) frame = requestAnimationFrame(tick);
    return () => {
      tweens.delete(tween);
      el.textContent = format(value);
    };
  }, [value, decimals, suffix, prefix, durationMs]);

  // React never renders children here, so the imperative textContent writes
  // can't fight reconciliation.
  return <span ref={ref} className="tabular-nums" />;
}
