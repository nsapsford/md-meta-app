import { Link } from 'react-router-dom';
import { syncAllStream } from '../../api/meta';
import { useState } from 'react';
import clsx from 'clsx';
import { useIsNative } from '../../hooks/useIsNative';
import { useScrollDirection } from '../../hooks/useScrollDirection';

/** Determinate circular progress indicator sized to match a 16px icon. */
function ProgressRing({ value }: { value: number }) {
  const r = 6.5;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <svg className="shrink-0 w-4 h-4 -rotate-90" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
      <circle
        cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped)}
        style={{ transition: 'stroke-dashoffset 300ms ease' }}
      />
    </svg>
  );
}

export default function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const isNative = useIsNative();
  const scrollDir = useScrollDirection();
  const collapsed = isNative && scrollDir === 'down';

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    setProgress(0);
    try {
      const res = await syncAllStream((p) => setProgress(p.total ? p.index / p.total : 0));
      setProgress(1);
      setSyncMsg(res.message || 'Done');
      setTimeout(() => setSyncMsg(''), 4000);
    } catch (e) {
      console.error('Sync failed:', e);
      setSyncMsg('Sync failed');
      setTimeout(() => setSyncMsg(''), 4000);
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-md-gold/30 via-md-gold/20 to-md-gold/10 border border-md-gold/30 flex items-center justify-center shadow-glow-gold">
            <span className="text-md-gold font-extrabold tracking-tighter text-lg">MD</span>
          </div>
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
            onClick={handleSync}
            disabled={syncing}
            title="Sync all data sources including untapped.gg"
            className={clsx(
              'flex items-center gap-2 font-bold rounded-xl px-3 py-2 text-xs disabled:opacity-40',
              'bg-gradient-to-br from-md-blue/15 to-md-blue/5 text-md-blue border border-md-blue/30 hover:from-md-blue/25 hover:to-md-blue/10 hover:border-md-blue/50 hover:shadow-glow-blue'
            )}
          >
            {syncing ? (
              <ProgressRing value={progress} />
            ) : (
              <svg className="shrink-0 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.586 9m0 0H9m11 11v-5m-6.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="tabular-nums">{syncing ? `${Math.round(progress * 100)}%` : 'Sync'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}