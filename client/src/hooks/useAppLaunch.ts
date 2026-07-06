import { useEffect, useRef, useState } from 'react';

export type LaunchPhase = 'splash' | 'transition' | 'done';

interface UseAppLaunchOpts {
  /** Total ms the splash holds before starting the transition into the dashboard. */
  splashHoldMs?: number;
  /** Duration of the splash -> dashboard transition itself. */
  transitionMs?: number;
  /** Skip entirely (e.g. for hot reload during dev). */
  disabled?: boolean;
}

/**
 * Drives the in-app launch sequence: 'splash' (logo + wordmark visible) ->
 * 'transition' (splash resolving into the dashboard, per SplashScreen's
 * transitionStyle) -> 'done' (unmount SplashScreen, dashboard fully interactive).
 *
 * Mirrors the timing explored in the launch-animation prototype:
 * splash holds ~800ms, transition ~420ms, then the dashboard's own
 * staggered entrance (handled inside Dashboard/App's existing motion.div's)
 * takes over.
 */
export function useAppLaunch(opts: UseAppLaunchOpts = {}) {
  const { splashHoldMs = 800, transitionMs = 420, disabled = false } = opts;
  const [phase, setPhase] = useState<LaunchPhase>(disabled ? 'done' : 'splash');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (disabled) return;
    timers.current.push(
      window.setTimeout(() => setPhase('transition'), splashHoldMs)
    );
    timers.current.push(
      window.setTimeout(() => setPhase('done'), splashHoldMs + transitionMs)
    );
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { phase, done: phase === 'done' };
}
