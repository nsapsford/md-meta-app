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
    <header className="bg-md-surface border-b border-md-border sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 h-14">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-md-gold/20 rounded flex items-center justify-center">
            <span className="text-md-gold font-bold text-sm">MD</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-md-text leading-none">MD Meta</h1>
            <p className="text-xs text-md-textMuted">Master Duel Analysis</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className="text-xs text-md-green max-w-xs truncate">{syncMsg}</span>
          )}
          <button
            onClick={handleSyncUntapped}
            disabled={syncingUntapped || syncing}
            title="Sync win/play rate data from untapped.gg"
            className="px-3 py-1.5 text-xs bg-green-900/20 text-green-400 border border-green-700/30 rounded hover:bg-green-900/40 transition-colors disabled:opacity-50"
          >
            {syncingUntapped ? 'Syncing...' : 'Sync untapped.gg'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || syncingUntapped}
            className="px-3 py-1.5 text-xs bg-md-blue/20 text-md-blue border border-md-blue/30 rounded hover:bg-md-blue/30 transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync All'}
          </button>
        </div>
      </div>
    </header>
  );
}
