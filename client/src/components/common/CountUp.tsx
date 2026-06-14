import { useCountUp } from '../../hooks/useCountUp';

interface CountUpProps {
  value: number;
  /** Decimal places to render (default 1). */
  decimals?: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
}

// Presentational wrapper around useCountUp so a number can be animated inline in
// JSX (a hook can't be called per-cell otherwise). Mount this fresh per value —
// it animates 0 → value on mount and whenever value changes.
export default function CountUp({ value, decimals = 1, suffix = '', prefix = '', durationMs }: CountUpProps) {
  const current = useCountUp(value, durationMs);
  return (
    <>
      {prefix}
      {current.toFixed(decimals)}
      {suffix}
    </>
  );
}
