import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Thin, fire-and-forget wrapper around @capacitor/haptics. Mirrors the
// defensive style of utils/deckShare.ts: it never throws and stays silent on
// the web (the plugin only produces a real vibration on a physical device), so
// callers can sprinkle these into onClick handlers without guarding each site.
const native = () => Capacitor.isNativePlatform();

/** Standard tap acknowledgement — tab switches, card taps, toggles. */
export function hapticLight(): void {
  if (native()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Heavier feedback for destructive actions — deleting a deck. */
export function hapticMedium(): void {
  if (native()) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}

/** Completion buzz for successful events — importing or saving a deck. */
export function hapticSuccess(): void {
  if (native()) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}
