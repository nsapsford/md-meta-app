import { QueryClient, focusManager } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { queryPersister } from './persister';

const MINUTE = 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server re-syncs twice a day and the Sync Update badge prompts for
      // anything newer, so data stays fresh for 5 minutes: switching tabs or
      // pages inside that window reuses the cache instead of refetching.
      staleTime: 5 * MINUTE,
      // Long enough that navigating back to a page within a session is instant.
      gcTime: 30 * MINUTE,
      // Render's free tier can take a while to wake; one retry covers a cold
      // host without stacking several 30s timeouts.
      retry: 1,
      // Try the network even when navigator.onLine is wrong (it often is in
      // Android WebViews); persisted data is already on screen meanwhile.
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: true,
      persister: queryPersister,
    },
  },
});

// The WebView doesn't reliably fire visibilitychange when the Android app is
// backgrounded, so tell TanStack Query about app resume/pause directly. This
// replaces the old hand-rolled "resync on appStateChange" listener.
focusManager.setEventListener((setFocused) => {
  const onVisibility = () => setFocused(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onVisibility, false);

  let removeNative: (() => void) | undefined;
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => setFocused(isActive)).then((handle) => {
        removeNative = () => void handle.remove();
      })
    ).catch(() => {});
  }

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    removeNative?.();
  };
});
