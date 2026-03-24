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
    <header className="sticky top-0 z-50 border-b border-md-border/60 bg-md-bg/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-5 h-14">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-md-gold/25 to-md-gold/10 border border-md-gold/20 flex items-center justify-center shadow-glow-gold group-hover:from-md-gold/35 group-hover:to-md-gold/15 transition-all duration-300">
            <span className="text-md-gold font-bold text-sm tracking-tight">MD</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-md-text leading-none tracking-tight">MD Meta</h1>
            <p className="text-[10px] text-md-textMuted mt-0.5 tracking-wide uppercase">Master Duel Analysis</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className="text-xs text-md-green/90 max-w-[280px] truncate animate-fade-in font-medium">{syncMsg}</span>
          )}
          <button
            onClick={handleSyncUntapped}
            disabled={syncingUntapped || syncing}
            title="Sync win/play rate data from untapped.gg"
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 disabled:opacity-40
              bg-md-green/8 text-md-green/90 border border-md-green/15 hover:bg-md-green/15 hover:border-md-green/25"
          >
            {syncingUntapped ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-md-green/30 border-t-md-green rounded-full animate-spin" />
                Syncing...
              </span>
            ) : 'Sync untapped.gg'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || syncingUntapped}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 disabled:opacity-40
              bg-md-blue/8 text-md-blue border border-md-blue/15 hover:bg-md-blue/15 hover:border-md-blue/25"
          >
            {syncing ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-md-blue/30 border-t-md-blue rounded-full animate-spin" />
                Syncing...
              </span>
            ) : 'Sync All'}
          </button>
        </div>
      </div>
    </header>
  );
}
