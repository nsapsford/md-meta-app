import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import clsx from 'clsx';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import MobileBottomNav from './components/layout/MobileBottomNav';
import ErrorBoundary from './components/common/ErrorBoundary';
import RequireAuth from './components/auth/RequireAuth';
import { Skeleton, MatchupMatrixSkeleton, TrendsSkeleton } from './components/common/Skeleton';
import { AuthProvider } from './auth/AuthContext';
import { OfflineCacheProvider } from './offline/OfflineCacheContext';
import { SyncUpdateProvider } from './cache/SyncUpdateContext';
import { useIsNative } from './hooks/useIsNative';
import { hideSplashAfterFirstPaint } from './utils/splash';
import MotionProvider from './motion/MotionProvider';
import SplashScreen from './components/launch/SplashScreen';
import { useAppLaunch } from './hooks/useAppLaunch';
import { queryClient } from './queries/queryClient';
import { pruneStorage } from './queries/persister';

// Dashboard is the cold-start route on Android, so it is bundled into the
// entry: no second chunk request after the entry has run, and no Suspense
// fallback flash before the first real content. (Its recharts chart is split
// out separately and only loads when scrolled near.) Every other page is lazy
// and gets preloaded at idle once the app is up — see App() below.
import Dashboard from './pages/Dashboard';
const pageImports = {
  deckProfile: () => import('./pages/DeckProfile'),
  cardSearch: () => import('./pages/CardSearch'),
  matchups: () => import('./pages/Matchups'),
  banList: () => import('./pages/BanList'),
  metaTrends: () => import('./pages/MetaTrends'),
  deckBuilder: () => import('./pages/DeckBuilder'),
  myDecks: () => import('./pages/MyDecks'),
  myGames: () => import('./pages/MyGames'),
  duelMode: () => import('./pages/DuelMode'),
  lineTrainer: () => import('./pages/LineTrainer'),
};
const DeckProfile = lazy(pageImports.deckProfile);
const CardSearch = lazy(pageImports.cardSearch);
const Matchups = lazy(pageImports.matchups);
const BanList = lazy(pageImports.banList);
const MetaTrends = lazy(pageImports.metaTrends);
const DeckBuilder = lazy(pageImports.deckBuilder);
const MyDecks = lazy(pageImports.myDecks);
const MyGames = lazy(pageImports.myGames);
const DuelMode = lazy(pageImports.duelMode);
const LineTrainer = lazy(pageImports.lineTrainer);
const Admin = lazy(() => import('./pages/Admin'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const MyAccount = lazy(() => import('./pages/MyAccount'));

// Shown while a page chunk downloads. Mirrors the skeletons pages themselves
// use while data loads, so a chunk load is indistinguishable from a data load.
function RouteFallback() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/matchups')) return <MatchupMatrixSkeleton />;
  if (pathname.startsWith('/trends')) return <TrendsSkeleton />;
  return (
    <div className="space-y-4">
      <Skeleton className="w-48 h-8" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

// Detail pages reached by tapping into an item get a deeper slide to convey
// hierarchy; top-level tab switches stay quick and subtle.
function isDrillIn(pathname: string) {
  return pathname.startsWith('/decks/');
}

function AnimatedRoutes() {
  const location = useLocation();
  const deep = isDrillIn(location.pathname);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={location.pathname}
        initial={{ opacity: 0, y: deep ? 16 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: deep ? -8 : -4 }}
        transition={{ duration: deep ? 0.22 : 0.15, ease: 'easeOut' }}
      >
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/decks/:name" element={<DeckProfile />} />
              <Route path="/cards" element={<CardSearch />} />
              <Route path="/matchups" element={<Matchups />} />
              <Route path="/ban-list" element={<BanList />} />
              <Route path="/trends" element={<MetaTrends />} />
              {/* Deck area lands on My Decks; the builder lives at /build-deck */}
              <Route path="/deck-builder" element={<Navigate to="/my-decks" replace />} />
              <Route path="/build-deck" element={<DeckBuilder />} />
              <Route path="/my-decks" element={<MyDecks />} />
              <Route path="/my-games" element={<MyGames />} />
              <Route path="/duel-mode" element={<DuelMode />} />
              <Route path="/trainer" element={<LineTrainer />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/account"
                element={
                  <RequireAuth>
                    <MyAccount />
                  </RequireAuth>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </m.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isNative = useIsNative();
  const { phase, done } = useAppLaunch();

  useEffect(() => {
    hideSplashAfterFirstPaint();
    // Once the first screen is up and the main thread is quiet: parse the
    // other page chunks so a tab switch never waits on download + compile,
    // and tidy the IndexedDB cache. One page per idle slot keeps each task short.
    const queue: Array<() => Promise<unknown>> = [...Object.values(pageImports), pruneStorage];
    const idle = (cb: () => void) =>
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(cb, { timeout: 4000 })
        : window.setTimeout(cb, 300);
    let cancelled = false;
    const next = () => {
      const task = queue.shift();
      if (!task || cancelled) return;
      void task().catch(() => {}).finally(() => idle(next));
    };
    const startTimer = window.setTimeout(() => idle(next), 2000);
    return () => { cancelled = true; window.clearTimeout(startTimer); };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
    <MotionProvider>
    <AuthProvider>
      <OfflineCacheProvider>
        <BrowserRouter>
          <SyncUpdateProvider>
          <div className="min-h-screen bg-md-bg">
            {!done && <SplashScreen phase={phase} transitionStyle="morph" />}
            {/* Launch reveal: header fades, then content rises — a staged
                handoff from the native splash instead of a hard cut.
                Opacity-only on the header and bottom nav so their fixed/sticky
                positioning is never inside a transformed ancestor. */}
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
              <Header onToggleSidebar={() => setSidebarOpen(v => !v)} />
            </m.div>
            <div className="flex">
              {!isNative && sidebarOpen && (
                <div
                  className="fixed inset-0 bg-black/50 z-40 md:hidden"
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              {!isNative && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
              <main
                className={clsx(
                  'flex-1 p-3 md:p-6 overflow-x-hidden bg-hero-glow',
                  isNative && 'pb-20'
                )}
              >
                <m.div
                  className="max-w-[1400px] mx-auto"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: 0.08, ease: 'easeOut' }}
                >
                  <AnimatedRoutes />
                </m.div>
              </main>
            </div>
            {isNative && (
              <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.15 }}>
                <MobileBottomNav />
              </m.div>
            )}
          </div>
          </SyncUpdateProvider>
        </BrowserRouter>
      </OfflineCacheProvider>
    </AuthProvider>
    </MotionProvider>
    </QueryClientProvider>
  );
}
