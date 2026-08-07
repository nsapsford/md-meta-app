import { useState, useEffect } from 'react';
import { getSpread, deleteGame, getGames, type PersonalSpread, type PersonalGame } from '../../api/personalGames';
import { readLocal, writeLocal } from '../../cache/cacheStore';
import ErrorBanner from '../common/ErrorBanner';
import LoadingSpinner from '../common/LoadingSpinner';
import clsx from 'clsx';

// Cache keys are parameterized by the filters that shape the server response.
const spreadKey = (deck: string, days: number) => `personal-spread:${deck}:${days}`;
const gamesKey = (deck: string) => `personal-games:${deck}`;

function WinRateBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color = rate >= 0.55 ? 'bg-md-green' : rate >= 0.45 ? 'bg-md-orange' : 'bg-md-red';
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('text-sm font-semibold tabular-nums w-11 shrink-0 text-right', {
        'text-md-green': rate >= 0.55,
        'text-md-orange': rate >= 0.45 && rate < 0.55,
        'text-md-red': rate < 0.45,
      })}>
        {pct}%
      </span>
      <div className="flex-1 h-1.5 bg-md-bg rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface Props {
  deckNames: string[];
  /** Bump to force a refetch, e.g. after logging a new game elsewhere on the page. */
  refreshToken?: number;
  /** Deck to preselect once deckNames arrive, e.g. the last deck from a previous session. */
  initialDeck?: string;
  /** Notifies the parent when the user picks a different "Playing as" deck. */
  onDeckChange?: (deck: string) => void;
}

export default function MyMatchupSpread({ deckNames, refreshToken, initialDeck, onDeckChange }: Props) {
  const [spread, setSpread] = useState<PersonalSpread[]>([]);
  const [recentGames, setRecentGames] = useState<PersonalGame[]>([]);
  const [selectedDeck, setSelectedDeck] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(90);

  useEffect(() => {
    if (deckNames.length > 0 && !selectedDeck) {
      setSelectedDeck(initialDeck && deckNames.includes(initialDeck) ? initialDeck : deckNames[0]);
    }
  }, [deckNames, selectedDeck, initialDeck]);

  useEffect(() => {
    if (!selectedDeck) return;
    let cancelled = false;
    (async () => {
      // Local-first: paint from the device cache, then revalidate.
      const [cachedSpread, cachedGames] = await Promise.all([
        readLocal<PersonalSpread[]>(spreadKey(selectedDeck, days)),
        readLocal<PersonalGame[]>(gamesKey(selectedDeck)),
      ]);
      if (cancelled) return;
      if (cachedSpread) setSpread(cachedSpread);
      if (cachedGames) setRecentGames(cachedGames);
      setLoading(!cachedSpread);
      try {
        const [s, g] = await Promise.all([
          getSpread({ deck: selectedDeck, days }),
          getGames({ deck: selectedDeck, limit: 10 }),
        ]);
        if (cancelled) return;
        setSpread(s);
        setRecentGames(g);
        setError('');
        void writeLocal(spreadKey(selectedDeck, days), s);
        void writeLocal(gamesKey(selectedDeck), g);
      } catch (e) {
        // With cached data on screen, a failed refresh stays silent.
        if (!cancelled && !cachedSpread && !cachedGames) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDeck, days, refreshToken]);

  const handleDelete = async (id: number) => {
    await deleteGame(id);
    setRecentGames((prev) => {
      const next = prev.filter((g) => g.id !== id);
      void writeLocal(gamesKey(selectedDeck), next);
      return next;
    });
    // Refresh spread
    getSpread({ deck: selectedDeck, days })
      .then((s) => {
        setSpread(s);
        void writeLocal(spreadKey(selectedDeck, days), s);
      })
      .catch(() => {});
  };

  const totalGames = spread.filter((s) => s.deck_played.toLowerCase() === selectedDeck.toLowerCase())
    .reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 border border-md-border/40 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-md-purple to-md-blue shrink-0"></div>
            <h3 className="text-sm font-bold text-md-text">My Spread</h3>
          </div>
          <div className="flex items-center gap-2">
            {[30, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={clsx('px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors', {
                  'bg-md-blue/15 text-md-blue border-md-blue/30': days === d,
                  'text-md-textMuted border-md-border hover:border-md-borderLight': days !== d,
                })}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-md-textMuted block mb-2">Playing as:</label>
          <select
            value={selectedDeck}
            onChange={(e) => { setSelectedDeck(e.target.value); onDeckChange?.(e.target.value); }}
            className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue w-full max-w-sm"
          >
            {deckNames.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

        {loading ? <LoadingSpinner /> : spread.length > 0 ? (
          <>
            <p className="text-xs text-md-textMuted">{totalGames} games logged</p>
            <div className="divide-y divide-md-border">
              {spread
                .filter((s) => s.deck_played.toLowerCase() === selectedDeck.toLowerCase())
                .map((s) => (
                  <div key={s.opponent_deck} className="py-2.5 grid grid-cols-[1fr_auto_auto] items-center gap-3">
                    <span className="text-sm font-medium truncate min-w-0" title={s.opponent_deck}>{s.opponent_deck}</span>
                    <span className="text-xs text-md-textMuted whitespace-nowrap">{s.total}g</span>
                    <WinRateBar rate={s.win_rate} />
                  </div>
                ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-md-textMuted">No games logged for this deck in the last {days} days.</p>
        )}
      </div>

      {recentGames.length > 0 && (
        <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 border border-md-border/40 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-md-blue to-md-green shrink-0"></div>
            <h4 className="text-sm font-bold text-md-text">Recent Games</h4>
          </div>
          <div className="divide-y divide-md-border">
            {recentGames.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className={clsx('font-semibold w-12 shrink-0', {
                    'text-md-green': g.result === 'win',
                    'text-md-red': g.result === 'loss',
                    'text-md-textMuted': g.result === 'draw',
                  })}>
                    {g.result.toUpperCase()}
                  </span>
                  <span className="text-md-textMuted shrink-0">vs</span>
                  <span className="font-medium truncate min-w-0" title={g.opponent_deck}>{g.opponent_deck}</span>
                  {g.went_first != null && (
                    <span className="text-xs text-md-textMuted shrink-0 whitespace-nowrap">({g.went_first ? '1st' : '2nd'})</span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(g.id)}
                  className="text-xs text-md-textMuted hover:text-md-red transition-colors px-1 shrink-0"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
