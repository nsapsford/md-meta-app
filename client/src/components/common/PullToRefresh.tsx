import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { useIsNative } from '../../hooks/useIsNative';
import { hapticLight, hapticSuccess } from '../../utils/haptics';

// Drag distance (after damping) that arms the refresh.
const THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * Native-style pull-to-refresh. Only active in the Capacitor app — on the web
 * it renders children untouched. Pulling down from the top of the page drags
 * the content with resistance; releasing past the threshold fires onRefresh
 * (with haptic feedback) and holds a spinner until it resolves.
 */
export default function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
}) {
  const isNative = useIsNative();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  if (!isNative) return <>{children}</>;

  const atTop = () => (document.scrollingElement?.scrollTop ?? 0) <= 0;

  const onTouchStart = (e: TouchEvent) => {
    if (atTop() && !refreshing) startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (startY.current == null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0 || !atTop()) {
      setPull(0);
      armed.current = false;
      return;
    }
    const damped = Math.min(MAX_PULL, dy / 2.2);
    setPull(damped);
    if (damped >= THRESHOLD && !armed.current) {
      armed.current = true;
      hapticLight();
    } else if (damped < THRESHOLD) {
      armed.current = false;
    }
  };

  const onTouchEnd = async () => {
    if (startY.current == null) return;
    startY.current = null;
    if (armed.current && !refreshing) {
      armed.current = false;
      setRefreshing(true);
      setPull(48);
      try {
        await onRefresh();
        hapticSuccess();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      armed.current = false;
      setPull(0);
    }
  };

  const progress = Math.min(1, pull / THRESHOLD);
  const releasing = startY.current == null;

  return (
    <div
      className="relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Indicator sits in the space revealed as the content is dragged down. */}
      <div
        className="absolute inset-x-0 top-0 flex justify-center pointer-events-none"
        style={{ height: pull, opacity: progress }}
        aria-hidden
      >
        <div className="flex items-center justify-center">
          <div
            className={
              refreshing
                ? 'w-6 h-6 border-2 border-md-blue/30 border-t-md-blue rounded-full animate-spin'
                : 'w-6 h-6 flex items-center justify-center text-md-blue'
            }
            style={refreshing ? undefined : { transform: `rotate(${pull * 2.5}deg)` }}
          >
            {!refreshing && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
      <div
        style={{
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
          transition: releasing ? 'transform 0.25s ease-out' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
