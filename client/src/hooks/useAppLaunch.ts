import { useEffect, useState } from 'react';
import { onFirstContent } from '../launch/firstContent';

export type LaunchPhase = 'splash' | 'transition' | 'done';

interface UseAppLaunchOpts {
  /** Never start the exit sooner than this, so the splash can't flash. */
  minHoldMs?: number;
  /** Start the exit by this point even if no page has content yet (cold cache, slow host). */
  maxHoldMs?: number;
  /** Duration of the splash -> dashboard transition itself. */
  transitionMs?: number;
  /** Skip entirely (e.g. for hot reload during dev). */
  disabled?: boolean;
}

/**
 * Drives the in-app launch sequence: 'splash' (logo + wordmark visible) ->
 * 'transition' (splash resolving into the app, per SplashScreen's
 * transitionStyle) -> 'done' (SplashScreen unmounted).
 *
 * The exit starts when the first page reports content (see
 * launch/firstContent.ts), clamped to [minHoldMs, maxHoldMs]. With a warm
 * cache that is ~minHoldMs; with nothing cached it is maxHoldMs, which matches
 * the old fixed 800ms hold, so no launch is slower than before.
 */
export function useAppLaunch(opts: UseAppLaunchOpts = {}) {
  const { minHoldMs = 250, maxHoldMs = 800, transitionMs = 420, disabled = false } = opts;
  const [phase, setPhase] = useState<LaunchPhase>(disabled ? 'done' : 'splash');

  useEffect(() => {
    if (disabled) return;
    const start = performance.now();
    const timers: number[] = [];
    let started = false;

    const beginExit = () => {
      if (started) return;
      started = true;
      setPhase('transition');
      timers.push(window.setTimeout(() => setPhase('done'), transitionMs));
    };

    const unsubscribe = onFirstContent(() => {
      const wait = Math.max(0, minHoldMs - (performance.now() - start));
      timers.push(window.setTimeout(beginExit, wait));
    });
    timers.push(window.setTimeout(beginExit, maxHoldMs));

    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { phase, done: phase === 'done' };
}
