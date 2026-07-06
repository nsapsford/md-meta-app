import { Link } from 'react-router-dom';
import { syncAll } from '../../api/meta';
import { useState } from 'react';
import clsx from 'clsx';
import { useIsNative } from '../../hooks/useIsNative';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { useAuth } from '../../auth/AuthContext';
import { useSyncUpdate } from '../../cache/SyncUpdateContext';

export default function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const { updateAvailable, applying, applyUpdate } = useSyncUpdate();
  const { status } = useAuth();
  const isNative = useIsNative();
  const scrollDir = useScrollDirection();
  const collapsed = isNative && scrollDir === 'down';

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

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-md-border/60 bg-gradient-to-r from-md-bg/80 via-md-bg/90 to-md-bg/80 backdrop-blur-xl shadow-lg shadow-black/10">
      <div
        className={clsx(
          'flex items-center justify-between px-4 md:px-6 h-full origin-left will-change-transform transition-transform duration-300',
          collapsed && 'scale-[0.9]'
        )}
      >
        <button
          onClick={onToggleSidebar}
          className={clsx(
            'p-2 -ml-2 mr-1 text-md-textSecondary hover:text-md-text rounded-lg',
            isNative ? 'hidden' : 'md:hidden'
          )}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link to="/" className="flex items-center gap-3 group">
          <div
            id="app-header-logo"
            role="img"
            aria-label="MD Meta"
            className="w-10 h-10 rounded-xl shadow-glow-gold shrink-0 bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/icon.svg')", backgroundSize: '155%' }}
          />

          <div className="flex flex-col">
            <h1 className="font-extrabold text-md-text leading-none tracking-tight bg-gradient-to-r from-md-text to-md-textSecondary bg-clip-text text-transparent text-xl">
              MD Meta
            </h1>
            <p
              className={clsx(
                'hidden sm:block text-[11px] text-md-textMuted mt-0.5 tracking-wider uppercase font-semibold transition-opacity duration-300',
                collapsed ? 'opacity-0' : 'opacity-100'
              )}
            >
              Master Duel Analysis
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className="hidden sm:block text-xs text-md-green/90 max-w-[200px] truncate animate-fade-in font-semibold px-3 py-1.5 rounded-lg bg-md-green/10 border border-md-green/20">
              {syncMsg}
            </span>
          )}
          <button
            onClick={updateAvailable ? () => void applyUpdate() : handleSync}
            disabled={syncing || applying}
            title={updateAvailable
              ? 'New data available — pull the latest and refresh'
              : 'Sync all data sources including untapped.gg'}
            className={clsx(
              // w-auto + whitespace-nowrap let the pill grow with its label; the
              // transition makes the Sync → Sync Update resize smooth.
              'flex items-center gap-2 font-bold rounded-xl px-3 py-2 text-xs w-auto whitespace-nowrap',
              'disabled:opacity-40 transition-all duration-300 ease-out',
              updateAvailable
                ? 'bg-gradient-to-br from-md-gold/20 to-md-gold/5 text-md-gold border border-md-gold/40 hover:from-md-gold/30 hover:to-md-gold/10 hover:border-md-gold/60 hover:shadow-glow-gold animate-pulse'
                : 'bg-gradient-to-br from-md-blue/15 to-md-blue/5 text-md-blue border border-md-blue/30 hover:from-md-blue/25 hover:to-md-blue/10 hover:border-md-blue/50 hover:shadow-glow-blue'
            )}
          >
            {syncing || applying ? (
              <span className={clsx(
                'w-3.5 h-3.5 border-2 rounded-full animate-spin',
                updateAvailable ? 'border-md-gold/30 border-t-md-gold' : 'border-md-blue/30 border-t-md-blue'
              )} />
            ) : (
              <svg className="shrink-0 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.586 9m0 0H9m11 11v-5m-6.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="transition-all duration-300">
              {applying ? 'Updating…' : syncing ? 'Syncing...' : updateAvailable ? 'Sync Update' : 'Sync'}
            </span>
          </button>
          <Link
            to={status === 'authenticated' ? '/account' : '/login'}
            title={status === 'authenticated' ? 'My Account' : 'Sign In'}
            className={clsx(
              'p-2 rounded-xl border',
              status === 'authenticated'
                ? 'text-md-gold border-md-gold/30 bg-md-gold/10 hover:bg-md-gold/20'
                : 'text-md-textSecondary border-md-border hover:text-md-text hover:bg-md-surfaceHover'
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}