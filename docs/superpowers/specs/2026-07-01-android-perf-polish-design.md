# Android Perf + Visual Polish Design

**Date:** 2026-07-01
**Status:** Approved

## Context

The MD Meta Android app (React 18 + Vite + Capacitor 8, client in `client/`) feels slow to cold-start and sluggish on chart-heavy screens, even on an S23 Ultra. Exploration showed the causes are structural: no explicit Capacitor splash config (native default holds the splash too long), `SplashScreen.hide()` called from an async pre-render init rather than at first paint, zero code-splitting (all pages + recharts in one eager bundle), and an unmemoized Dashboard that fully re-renders on background-sync state changes. This round also adds a further layer of visual polish (transitions, launch reveal, chart styling, micro-interactions) extending the v1.1.2 native-feel work.

**Approach:** one branch (`feat/perf-polish`), two phases — perf foundation first, polish layered on top. framer-motion is an approved new dependency, loaded via `LazyMotion` to protect the cold-start win.

## Phase 1 — Performance foundation

### 1. Splash & launch handoff
- `client/capacitor.config.ts`: add `SplashScreen` plugin config — `launchAutoHide: false`, `backgroundColor: '#09090b'`.
- `client/src/main.tsx`: remove `SplashScreen.hide()` from the async `initNative()` IIFE; hide it from a `useEffect` (rAF after mount) in the app shell so the splash hands off at first real paint. Keep StatusBar setup in init.
- Android `windowBackground` set to `#09090b` (in `client/android/app/src/main/res` styles) to kill white flash; the change must survive `cap sync`.

### 2. Code splitting
- `client/src/App.tsx`: convert all page imports to `React.lazy()` + `<Suspense>`. Fallbacks reuse existing skeletons (`client/src/components/common/Skeleton.tsx`) so lazy loads look like normal loading states.
- This pulls recharts (only used by Dashboard and MetaTrends) out of the startup bundle automatically. Verify via `vite build` output; add `manualChunks` in `client/vite.config.ts` only if the automatic split is poor.
- Lazy-route load failures fall back to the existing `ErrorBoundary`/`ErrorBanner`.

### 3. Dashboard render hygiene
- `client/src/pages/Dashboard.tsx`: `useMemo` the chart data derivation, extract the bar chart into a `React.memo` component, `useCallback` handlers — so `bgLoading`/sync-banner state changes stop re-rendering the page and chart.

### 4. Measurement
- Record before/after: `vite build` bundle sizes and a simple `performance.mark` first-paint timing (dev-logged). Verify launch feel on the S23 Ultra.

## Phase 2 — Visual polish

### 1. framer-motion via LazyMotion
- Add `framer-motion` to `client/package.json`. Use `LazyMotion` + `m.` components with `domAnimation` features loaded async (~5 KB in shell). Regenerate the lockfile carefully (platform-specific esbuild deps must survive; LF endings) per the Windows→CI release pitfalls.

### 2. Launch reveal
- After splash hides, the first screen staggers in (header, then sections, ~250 ms total) using framer-motion stagger.

### 3. Screen transitions
- `AnimatePresence` around `<Routes>`: cross-fade + 8px slide matching the existing `slideUp` idiom. Tab switches ~150 ms; drill-ins (deck → DeckProfile) slightly deeper slide. Respect `prefers-reduced-motion` (same check as `useCountUp`).

### 4. Chart styling (Dashboard + MetaTrends)
- Gradients + tier-colored series using the centralized tier colors. Custom dark tooltip component (rounded card, tier badge). Draw-in animation on first view only, reusing the `hasAnimatedRef` pattern already in MetaTrends.

### 5. Micro-interactions
- Extend `client/src/utils/haptics.ts` usage to tab switches and pull-to-refresh; add pull-to-refresh on Dashboard and Matchups wired to the existing sync refresh; subtle value-flash when `SyncUpdateContext` bumps `dataGeneration` and displayed numbers change.

## Verification

- `npm test` (vitest) green; `npm run build` clean in `client/`.
- Compare `vite build` chunk sizes before/after Phase 1 (expect recharts out of the entry chunk).
- On-device via `npm run android:dev`: no white flash, splash hides at first paint, cold start visibly faster, transitions smooth, charts styled and non-janky, reduced-motion honored.
- CI on push: lockfile must pass `npm ci` on Linux/Node 22.
