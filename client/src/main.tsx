import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
// Inter ships inside the bundle (and so inside the APK) instead of coming from
// fonts.googleapis.com: that stylesheet was render-blocking, so every cold
// start waited on a DNS + TLS round trip to Google before first paint — and
// offline it stalled until the request failed.
import '@fontsource-variable/inter/wght.css';
import './index.css';

async function initNative() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    // The splash screen is hidden separately, at the app shell's first paint —
    // see hideSplashAfterFirstPaint() in App.tsx.
  } catch {
    // Capacitor not installed in this environment (e.g. plain web build) — ignore.
  }
}
void initNative();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
