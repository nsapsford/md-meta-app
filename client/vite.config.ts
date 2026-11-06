import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Libraries that change rarely and are needed at boot. Keeping them in their
// own chunk lets the web build (Vercel) keep them cached across deploys; in the
// APK it is just one more local file preloaded in parallel with the entry.
const BOOT_VENDOR = /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router|@tanstack[\\/](query-core|react-query))[\\/]/;

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Capacitor 8's minimum Android WebView is far newer than Vite's default
    // target, so modern syntax ships as-is instead of being down-levelled.
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (BOOT_VENDOR.test(id)) return 'vendor-react';
          // recharts and its d3 helpers stay in their own lazily-loaded chunk.
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
