import { Link } from 'react-router-dom';
import { syncAll, syncUntapped } from '../../api/meta';
import { useState } from 'react';

export default function Header() {
  const [syncing, setSyncing] = useState(false);
  const [syncingUntapped, setSyncingUntapped] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await syncAll();
      setSyncMsg(res.message || 'Done');
      setTimeout(() => setSyncMsg(''), 4000);
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncUntapped = async () => {
    setSyncingUntapped(true);
    setSyncMsg('');
    try {
      const res = await syncUntapped();
      setSyncMsg(res.message || 'Done');
      setTimeout(() => setSyncMsg(''), 4000);
    } catch (e) {
      console.error('Untapped sync failed:', e);
    } finally {
      setSyncingUntapped(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-md-border/60 bg-gradient-to-r from-md-bg/80 via-md-bg/90 to-md-bg/80 backdrop-blur-xl shadow-lg shadow-black/10">
      <div className="flex items-center justify-between px-6 h-16">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-md-gold/30 via-md-gold/20 to-md-gold/10 border border-md-gold/30 flex items-center justify-center shadow-glow-gold group-hover:from-md-gold/40 group-hover:to-md-gold/20 group-hover:shadow-glow-gold transition-all duration-300 transform group-hover:scale-105">
            <span className="text-md-gold font-extrabold text-lg tracking-tighter">MD</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-md-text leading-none tracking-tight bg-gradient-to-r from-md-text to-md-textSecondary bg-clip-text text-transparent">
              MD Meta
            </h1>
            <p className="text-[11px] text-md-textMuted mt-0.5 tracking-wider uppercase font-semibold">
              Master Duel Analysis
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-md-green/90 max-w-[280px] truncate animate-fade-in font-semibold px-3 py-1.5 rounded-lg bg-md-green/10 border border-md-green/20">
              {syncMsg}
            </span>
          )}
          <button
            onClick={handleSyncUntapped}
            disabled={syncingUntapped || syncing}
            title="Sync win/play rate data from untapped.gg"
            className="px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 disabled:opacity-40
              bg-gradient-to-br from-md-green/15 to-md-green/5 text-md-green border border-md-green/30 hover:from-md-green/25 hover:to-md-green/10 hover:border-md-green/50 hover:shadow-glow-gold group"
          >
            {syncingUntapped ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-md-green/30 border-t-md-green rounded-full animate-spin" />
                Syncing...
              </span>
            ) : (
              <span className="flex items-center gap-2 group-hover:gap-3 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.586 9m0 0H9m11 11v-5m-6.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Sync untapped.gg
              </span>
            )}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || syncingUntapped}
            className="px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 disabled:opacity-40
              bg-gradient-to-br from-md-blue/15 to-md-blue/5 text-md-blue border border-md-blue/30 hover:from-md-blue/25 hover:to-md-blue/10 hover:border-md-blue/50 hover:shadow-glow-blue group"
          >
            {syncing ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-md-blue/30 border-t-md-blue rounded-full animate-spin" />
                Syncing...
              </span>
            ) : (
              <span className="flex items-center gap-2 group-hover:gap-3 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.586 9m0 0H9m11 11v-5m-6.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Sync All
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}