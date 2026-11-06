import { useEffect, useState } from 'react';

/**
 * True once the element has come within `rootMargin` of the viewport (and
 * stays true). Used to defer heavy below-the-fold work — e.g. pulling in
 * recharts — until the user actually scrolls toward it.
 *
 * Returns a callback ref, so it also works when the element only mounts after
 * the component's first render (e.g. once data has loaded).
 */
export function useNearViewport<T extends Element>(rootMargin = '300px') {
  const [el, setEl] = useState<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [el, near, rootMargin]);

  return [setEl, near] as const;
}
