import { useState, useEffect, useCallback } from 'react';
import { getSyncStatus, triggerSync, SYNC_TTL, SOURCE_LABEL, type SyncRecord, type SyncSource } from '../api/sync';

const SOURCES: SyncSource[] = ['mdm_deck_types', 'mdm_tournaments', 'untapped', 'ygoprodeck'];
const TOKEN_KEY = 'admin_token';

function ageString(synced_at: number): string {
  const secs = Math.floor(Date.now() / 1000) - synced_at;
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function isStale(record: SyncRecord): boolean {
  return Math.floor(Date.now() / 1000) - record.synced_at > SYNC_TTL[record.source] * 2;
}

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [tokenInput, setTokenInput] = useState('');
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [running, setRunning] = useState<SyncSource | null>(null);
  const [flash, setFlash] = useState<{ source: SyncSource; ok: boolean } | null>(null);

  const authenticated = Boolean(token);

  const refresh = useCallback(async () => {
    try {
      setRecords(await getSyncStatus());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authenticated) {
      refresh();
      const id = setInterval(refresh, 30_000);
      return () => clearInterval(id);
    }
  }, [authenticated, refresh]);

  function saveToken() {
    localStorage.setItem(TOKEN_KEY, tokenInput);
    setToken(tokenInput);
  }

  async function runSync(source: SyncSource) {
    setRunning(source);
    try {
      await triggerSync(source, token);
      setFlash({ source, ok: true });
      await refresh();
    } catch {
      setFlash({ source, ok: false });
    } finally {
      setRunning(null);
      setTimeout(() => setFlash(null), 3000);
    }
  }

  if (!authenticated) {
    return (
      <div className="max-w-sm mx-auto mt-20 p-6 bg-md-surface border border-md-border rounded-2xl">
        <h1 className="text-lg font-bold text-md-text mb-4">Admin Access</h1>
        <input
          type="password"
          value={tokenInput}
          onChange={e => setTokenInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveToken()}
          placeholder="Admin token"
          className="w-full px-3 py-2 rounded-lg bg-md-bg border border-md-border text-md-text text-sm mb-3 focus:outline-none focus:border-md-blue"
        />
        <button
          onClick={saveToken}
          className="w-full py-2 rounded-lg bg-md-blue text-white text-sm font-semibold"
        >
          Unlock
        </button>
      </div>
    );
  }

  const recordMap = Object.fromEntries(records.map(r => [r.source, r]));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-md-text">Admin</h1>
        <button
          onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(''); }}
          className="text-xs text-md-textMuted hover:text-md-red"
        >
          Sign out
        </button>
      </div>

      <div className="bg-md-surface border border-md-border rounded-2xl divide-y divide-md-border">
        {SOURCES.map(source => {
          const r = recordMap[source];
          const stale = r ? isStale(r) : false;
          const failed = r?.status === 'failed';
          const busy = running === source;
          const result = flash?.source === source;

          return (
            <div key={source} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-md-text">{SOURCE_LABEL[source]}</p>
                {r ? (
                  <p className={`text-xs mt-0.5 ${failed ? 'text-md-red' : stale ? 'text-md-orange' : 'text-md-textMuted'}`}>
                    {failed ? `Failed: ${r.detail ?? 'unknown error'}` : stale ? `Stale — last sync ${ageString(r.synced_at)}` : `OK — ${ageString(r.synced_at)}`}
                  </p>
                ) : (
                  <p className="text-xs text-md-textMuted mt-0.5">Never synced</p>
                )}
              </div>

              {result && (
                <span className={`text-xs font-bold ${flash!.ok ? 'text-md-green' : 'text-md-red'}`}>
                  {flash!.ok ? 'Done' : 'Failed'}
                </span>
              )}

              <button
                onClick={() => runSync(source)}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-md-blue/15 text-md-blue border border-md-blue/30 hover:bg-md-blue/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {busy ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
