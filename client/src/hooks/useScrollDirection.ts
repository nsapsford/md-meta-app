import { useEffect, useState } from 'react';

export type ScrollDirection = 'up' | 'down';

export function useScrollDirection(threshold = 24): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>('up');

  useEffect(() => {
    let lastY = window.scrollY;
    let accum = 0;
    let current: ScrollDirection = 'up';
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;

      // Always expanded near the top.
      if (y <= 48) {
        accum = 0;
        if (current !== 'up') {
          current = 'up';
          setDirection('up');
        }
        ticking = false;
        return;
      }

      // Reset the run when the scroll direction reverses, then accumulate.
      if (delta > 0 !== accum > 0) accum = 0;
      accum += delta;

      // Hysteresis: only flip state once sustained movement exceeds the threshold.
      if (accum >= threshold && current !== 'down') {
        current = 'down';
        setDirection('down');
        accum = 0;
      } else if (accum <= -threshold && current !== 'up') {
        current = 'up';
        setDirection('up');
        accum = 0;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return direction;
}
