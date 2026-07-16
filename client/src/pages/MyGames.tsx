import { useState, useEffect } from 'react';
import { getDecks } from '../api/meta';
import { logGame } from '../api/personalGames';
import ErrorBanner from '../components/common/ErrorBanner';
import ErrorBoundary from '../components/common/ErrorBoundary';
import PullToRefresh from '../components/common/PullToRefresh';
import { useSyncUpdate } from '../cache/SyncUpdateContext';
import { readLocal, writeLocal } from '../cache/cacheStore';
import MyMatchupSpread from '../components/matchups/MyMatchupSpread';

// Remembers the deck the user last picked (log form or spread) so the page
// reopens on it instead of resetting to the top deck.
const LAST_DECK_KEY = 'my_games_last_deck';
// Local-first mirror of the deck-name list so the page paints without waiting
// on the network.
const DECK_NAMES_KEY = 'my-games-deck-names';

function rememberDeck(name: string) {
  localStorage.setItem(LAST_DECK_KEY, name);
}

export default function MyGames() {
  const { dataGeneration, applyUpdate } = useSyncUpdate();
  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Quick-entry form state
  const [logDeck, setLogDeck] = useState(() => localStorage.getItem(LAST_DECK_KEY) || '');
  const [logOpponent, setLogOpponent] = useState('');
  const [logResult, setLogResult] = useState<'win' | 'loss' | 'draw'>('win');
  const [logFirst, setLogFirst] = useState<boolean | null>(null);
  const [logSaving, setLogSaving] = useState(false);
  const [logFlash, setLogFlash] = useState('');
  // Bumped after a successful log so the spread + recent games refetch.
  const [refreshToken, setRefreshToken] = useState(0);

  // Re-runs on a Sync Update (dataGeneration bump) to refetch the deck list.
  // Local-first: paints from the device cache, then revalidates.
  useEffect(() => {
    setError('');
    let cancelled = false;
    const applyNames = (names: string[]) => {
      setDeckNames(names);
      // Keep the restored last-selected deck while it still exists in the
      // meta list; otherwise fall back to the top deck.
      setLogDeck((cur) => (cur && names.includes(cur) ? cur : names[0] || ''));
      setLogOpponent((cur) => cur || names[0] || '');
    };
    (async () => {
      const cached = await readLocal<string[]>(DECK_NAMES_KEY);
      if (cancelled) return;
      const hasCache = !!cached && cached.length > 0;
      if (hasCache) {
        applyNames(cached);
        setLoading(false);
      }
      try {
        const decks = await getDecks();
        if (cancelled) return;
        const names = [...decks.map((d) => d.name), 'Rogue'];
        applyNames(names);
        void writeLocal(DECK_NAMES_KEY, names);
      } catch (e) {
        // With a cached list on screen, a failed refresh stays silent.
        if (!cancelled && !hasCache) setError((e as Error)?.message || 'Failed to load decks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dataGeneration]);

  const handleLogGame = async () => {
    if (!logDeck || !logOpponent) return;
    setLogSaving(true);
    try {
      await logGame({ deck_played: logDeck, opponent_deck: logOpponent, result: logResult, went_first: logFirst, notes: null });
      setLogFlash(`✓ ${logResult.toUpperCase()} vs ${logOpponent} logged`);
      setTimeout(() => setLogFlash(''), 3000);
      setRefreshToken((t) => t + 1);
    } catch (e: any) {
      console.error('logGame failed:', e?.response?.status, e?.response?.data, e);
      const msg = e?.response?.data?.error || e?.message || 'unknown error';
      setLogFlash(`Failed: ${msg}`);
      setTimeout(() => setLogFlash(''), 5000);
    } finally {
      setLogSaving(false);
    }
  };

  return (
    <PullToRefresh onRefresh={applyUpdate}>
    <div className="space-y-8 pb-8">
      {/* Hero header with gradient */}
      <div className="relative py-6 px-6 rounded-2xl bg-gradient-to-r from-md-surface/60 to-md-surface/40 border border-md-border/40 backdrop-blur-sm">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-md-gold to-md-text bg-clip-text text-transparent">
          My Games
        </h1>
        <p className="text-md-textSecondary text-sm sm:text-base mt-2 max-w-2xl">
          Log your matches and track your personal win rates across the meta
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <>
          <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-4 border border-md-border/40 skeleton-pulse" style={{ minHeight: '104px' }} aria-hidden />
          <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-4 border border-md-border/40 skeleton-pulse" style={{ minHeight: '240px' }} aria-hidden />
        </>
      ) : deckNames.length > 0 ? (
        <>
          <ErrorBoundary fallback={null}>
            <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-4 border border-md-border/40">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-md-purple to-md-blue shrink-0"></div>
                <h3 className="text-sm font-bold text-md-text shrink-0">Log a Game</h3>
                {logFlash && <span className="text-xs text-md-green ml-2 min-w-0 truncate">{logFlash}</span>}
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-md-textMuted">I played</label>
                  <select value={logDeck} onChange={(e) => { setLogDeck(e.target.value); rememberDeck(e.target.value); }}
                    className="bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue min-w-[140px] max-w-[220px]">
                    {deckNames.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-md-textMuted">vs</label>
                  <select value={logOpponent} onChange={(e) => setLogOpponent(e.target.value)}
                    className="bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue min-w-[140px] max-w-[220px]">
                    {deckNames.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex gap-1">
                  {(['win', 'loss', 'draw'] as const).map((r) => (
                    <button key={r} onClick={() => setLogResult(r)}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                        logResult === r
                          ? r === 'win' ? 'bg-md-green/20 text-md-green border-md-green/30'
                            : r === 'loss' ? 'bg-md-red/20 text-md-red border-md-red/30'
                            : 'bg-md-textMuted/20 text-md-textMuted border-md-border'
                          : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                      }`}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {([true, false, null] as const).map((v) => (
                    <button key={String(v)} onClick={() => setLogFirst(logFirst === v ? null : v)}
                      className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        logFirst === v && v !== null
                          ? 'bg-md-blue/15 text-md-blue border-md-blue/30'
                          : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                      }`}>
                      {v === true ? '1st' : v === false ? '2nd' : '?'}
                    </button>
                  ))}
                </div>
                <button onClick={handleLogGame} disabled={logSaving}
                  className="px-4 py-2 text-sm font-bold rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 hover:bg-md-blue/25 transition-colors disabled:opacity-50">
                  {logSaving ? '...' : 'Log'}
                </button>
              </div>
            </div>
          </ErrorBoundary>

          <MyMatchupSpread deckNames={deckNames} refreshToken={refreshToken} initialDeck={logDeck} onDeckChange={rememberDeck} />
        </>
      ) : (
        <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-6 border border-md-border/40">
          <p className="text-sm text-md-textMuted">
            No decks available yet. Run a sync to load the deck list, then come back to log your games.
          </p>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
