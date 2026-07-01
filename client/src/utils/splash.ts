/**
 * Hides the native splash screen once the app shell has actually painted.
 * capacitor.config.ts sets launchAutoHide: false, so this is the only place
 * the splash goes away — the safety timeout guards against a hung first render
 * leaving the splash up forever.
 */
const SAFETY_TIMEOUT_MS = 5000;

let hidden = false;

async function hide() {
  if (hidden) return;
  hidden = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide().catch(() => {});
  } catch {
    // Capacitor not installed (plain web build) — nothing to hide.
  }
}

export function hideSplashAfterFirstPaint() {
  // Double rAF: the first fires before the frame commits, the second after
  // the shell's first frame is actually on screen.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => void hide());
  });
  setTimeout(() => void hide(), SAFETY_TIMEOUT_MS);
}
