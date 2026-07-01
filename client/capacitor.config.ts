import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mdmeta.app',
  appName: 'MD Meta',
  webDir: 'dist',
  // Match the app's dark theme so the WebView never flashes white before CSS loads.
  backgroundColor: '#09090b',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // The app hides the splash itself at first paint (see src/utils/splash.ts),
      // so the native side must not auto-hide on a timer.
      launchAutoHide: false,
      backgroundColor: '#09090b',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
    },
  },
};

export default config;
