import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import clsx from 'clsx';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import MobileBottomNav from './components/layout/MobileBottomNav';
import ErrorBoundary from './components/common/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import DeckProfile from './pages/DeckProfile';
import CardSearch from './pages/CardSearch';
import Matchups from './pages/Matchups';
import BanList from './pages/BanList';
import MetaTrends from './pages/MetaTrends';
import DeckBuilder from './pages/DeckBuilder';
import MyDecks from './pages/MyDecks';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Register from './pages/Register';
import MyAccount from './pages/MyAccount';
import RequireAuth from './components/auth/RequireAuth';
import { AuthProvider } from './auth/AuthContext';
import { OfflineCacheProvider } from './offline/OfflineCacheContext';
import { SyncUpdateProvider } from './cache/SyncUpdateContext';
import { useIsNative } from './hooks/useIsNative';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isNative = useIsNative();

  return (
    <AuthProvider>
      <OfflineCacheProvider>
        <BrowserRouter>
          <SyncUpdateProvider>
          <div className="min-h-screen bg-md-bg">
            <Header onToggleSidebar={() => setSidebarOpen(v => !v)} />
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
                <div className="max-w-[1400px] mx-auto animate-fade-in">
                  <ErrorBoundary>
                    <Routes>
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
                  </ErrorBoundary>
                </div>
              </main>
            </div>
            {isNative && <MobileBottomNav />}
          </div>
          </SyncUpdateProvider>
        </BrowserRouter>
      </OfflineCacheProvider>
    </AuthProvider>
  );
}
