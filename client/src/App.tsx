import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import DeckProfile from './pages/DeckProfile';
import CardSearch from './pages/CardSearch';
import Matchups from './pages/Matchups';
import BanList from './pages/BanList';
import MetaTrends from './pages/MetaTrends';
import Tournaments from './pages/Tournaments';
import DeckBuilder from './pages/DeckBuilder';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-md-bg">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 overflow-x-hidden bg-hero-glow">
            <div className="max-w-[1400px] mx-auto animate-fade-in">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/decks/:name" element={<DeckProfile />} />
                <Route path="/cards" element={<CardSearch />} />
                <Route path="/matchups" element={<Matchups />} />
                <Route path="/ban-list" element={<BanList />} />
                <Route path="/trends" element={<MetaTrends />} />
                <Route path="/tournaments" element={<Tournaments />} />
                <Route path="/deck-builder" element={<DeckBuilder />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
