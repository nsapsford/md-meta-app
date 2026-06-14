import clsx from 'clsx';
import { useOfflineCache } from '../../offline/OfflineCacheContext';
import { hapticLight } from '../../utils/haptics';

// User-facing switch for the offline cache. The persistence + sync engine
// already live in OfflineCacheContext (setEnabled writes the pref and clears
// the cache on disable) — this only surfaces a tactile control for it.
export default function CacheToggle() {
  const { enabled, ready, setEnabled } = useOfflineCache();

  const toggle = () => {
    hapticLight();
    void setEnabled(!enabled);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={!ready}
      onClick={toggle}
      className="press flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-md-textSecondary active:bg-md-surfaceHover transition-colors disabled:opacity-50"
    >
      <span className="flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12a7 7 0 0114 0M5 12a7 7 0 0014 0M5 12H3m18 0h-2M12 5V3m0 18v-2" />
        </svg>
        <span>Offline caching</span>
      </span>
      <span
        className={clsx(
          'relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0',
          enabled ? 'bg-md-blue' : 'bg-md-border'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out',
            enabled && 'translate-x-5'
          )}
        />
      </span>
    </button>
  );
}
