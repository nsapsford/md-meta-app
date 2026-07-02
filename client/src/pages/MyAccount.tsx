import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../auth/AuthContext';
import { useOfflineCache } from '../offline/OfflineCacheContext';
import { syncResources } from '../offline/resources';
import ErrorBanner from '../components/common/ErrorBanner';

function formatSyncTime(ms: number | null): string {
  if (ms == null) return 'never';
  const ageMin = Math.floor((Date.now() - ms) / 60_000);
  if (ageMin < 1) return 'just now';
  if (ageMin < 60) return `${ageMin}m ago`;
  return new Date(ms).toLocaleString();
}

export default function MyAccount() {
  const { user, logout } = useAuth();
  const { enabled, ready, syncStatus, lastSyncAt, setEnabled, syncNow, clearCache } = useOfflineCache();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const guard = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const handleLogout = () => guard(async () => {
    await logout();
    navigate('/', { replace: true });
  });

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h2 className="text-2xl font-bold text-md-gold">My Account</h2>
      {error && <ErrorBanner message={error} />}

      <section className="bg-md-surface border border-md-border rounded-lg p-4 space-y-1">
        <p className="font-semibold text-md-text">{user?.display_name}</p>
        <p className="text-sm text-md-textMuted">{user?.email}</p>
        {user && (
          <p className="text-xs text-md-textMuted">
            Member since {new Date(user.created_at * 1000).toLocaleDateString()}
          </p>
        )}
      </section>

      <section className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-md-text">Enable Local Caching</p>
            <p className="text-xs text-md-textMuted">
              Store the card database, tier list and your deck lists on this
              device for instant app loads and offline use.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            disabled={!ready || busy}
            onClick={() => guard(() => setEnabled(!enabled))}
            className={clsx(
              'relative shrink-0 w-11 h-6 rounded-full border transition-colors disabled:opacity-40',
              enabled ? 'bg-md-gold/30 border-md-gold/60' : 'bg-md-bg border-md-border'
            )}
          >
            <span
              className={clsx(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform',
                enabled ? 'translate-x-5 bg-md-gold' : 'translate-x-0 bg-md-textMuted'
              )}
            />
          </button>
        </div>

        {enabled && (
          <div className="border-t border-md-border/60 pt-3 space-y-2">
            <p className="text-xs text-md-textMuted">
              {syncStatus === 'syncing'
                ? 'Syncing in background…'
                : `Last synced: ${formatSyncTime(lastSyncAt)}`}
              {syncStatus === 'error' && ' · some sources failed, will retry'}
            </p>
            <ul className="text-xs text-md-textMuted list-disc list-inside">
              {syncResources.map((r) => <li key={r.key}>{r.label}</li>)}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => guard(syncNow)}
                disabled={busy || syncStatus === 'syncing'}
                className="text-xs font-bold bg-md-blue/15 text-md-blue border border-md-blue/30 rounded-lg px-3 py-1.5 disabled:opacity-40"
              >
                Sync now
              </button>
              <button
                onClick={() => guard(clearCache)}
                disabled={busy}
                className="text-xs font-bold bg-md-surfaceHover text-md-textSecondary border border-md-border rounded-lg px-3 py-1.5 disabled:opacity-40"
              >
                Clear cached data
              </button>
            </div>
          </div>
        )}
      </section>

      <button
        onClick={handleLogout}
        disabled={busy}
        className="w-full text-sm font-bold text-md-red bg-md-red/10 border border-md-red/30 hover:bg-md-red/20 rounded-lg px-3 py-2 disabled:opacity-40"
      >
        Sign Out
      </button>
    </div>
  );
}
