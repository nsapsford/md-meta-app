import { useState, useEffect } from 'react';
import { getSpread, deleteGame, getGames, type PersonalSpread, type PersonalGame } from '../../api/personalGames';
import ErrorBanner from '../common/ErrorBanner';
import LoadingSpinner from '../common/LoadingSpinner';
import clsx from 'clsx';

function WinRateBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color = rate >= 0.55 ? 'bg-md-green' : rate >= 0.45 ? 'bg-md-orange' : 'bg-md-red';
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('text-sm font-semibold tabular-nums w-10 text-right', {
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
}

export default function MyMatchupSpread({ deckNames }: Props) {
  const [spread, setSpread] = useState<PersonalSpread[]>([]);
  const [recentGames, setRecentGames] = useState<PersonalGame[]>([]);
  const [selectedDeck, setSelectedDeck] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(90);

  useEffect(() => {
    if (deckNames.length > 0 && !selectedDeck) setSelectedDeck(deckNames[0]);
  }, [deckNames, selectedDeck]);

  useEffect(() => {
    if (!selectedDeck) return;
    setLoading(true);
    Promise.all([
      getSpread({ deck: selectedDeck, days }),
      getGames({ deck: selectedDeck, limit: 10 }),
    ])
      .then(([s, g]) => { setSpread(s); setRecentGames(g); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDeck, days]);

  const handleDelete = async (id: number) => {
    await deleteGame(id);
    setRecentGames((prev) => prev.filter((g) => g.id !== id));
    // Refresh spread
    getSpread({ deck: selectedDeck, days }).then(setSpread).catch(() => {});
  };

  const totalGames = spread.filter((s) => s.deck_played.toLowerCase() === selectedDeck.toLowerCase())
    .reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="space-y-4">
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-md-text">My Spread</h3>
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
            onChange={(e) => setSelectedDeck(e.target.value)}
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
                    <span className="text-sm font-medium truncate">{s.opponent_deck}</span>
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
        <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-md-text">Recent Games</h4>
          <div className="divide-y divide-md-border">
            {recentGames.map((g) => (
              <div key={g.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className={clsx('font-semibold w-8', {
                    'text-md-green': g.result === 'win',
                    'text-md-red': g.result === 'loss',
                    'text-md-textMuted': g.result === 'draw',
                  })}>
                    {g.result.toUpperCase()}
                  </span>
                  <span className="text-md-textMuted">vs</span>
                  <span className="font-medium">{g.opponent_deck}</span>
                  {g.went_first != null && (
                    <span className="text-xs text-md-textMuted">({g.went_first ? '1st' : '2nd'})</span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(g.id)}
                  className="text-xs text-md-textMuted hover:text-md-red transition-colors px-1"
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
