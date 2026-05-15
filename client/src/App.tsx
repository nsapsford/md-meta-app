import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import clsx from 'clsx';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import MobileBottomNav from './components/layout/MobileBottomNav';
import SyncStatusBanner from './components/common/SyncStatusBanner';
import ErrorBoundary from './components/common/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import DeckProfile from './pages/DeckProfile';
import CardSearch from './pages/CardSearch';
import Matchups from './pages/Matchups';
import BanList from './pages/BanList';
import MetaTrends from './pages/MetaTrends';
import Tournaments from './pages/Tournaments';
import DeckBuilder from './pages/DeckBuilder';
import Admin from './pages/Admin';
import { useIsNative } from './hooks/useIsNative';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isNative = useIsNative();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-md-bg">
        <Header onToggleSidebar={() => setSidebarOpen(v => !v)} />
        <SyncStatusBanner />
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
                  <Route path="/tournaments" element={<Tournaments />} />
                  <Route path="/deck-builder" element={<DeckBuilder />} />
                  <Route path="/admin" element={<Admin />} />
                </Routes>
              </ErrorBoundary>
            </div>
          </main>
        </div>
        {isNative && <MobileBottomNav />}
      </div>
    </BrowserRouter>
  );
}
