import { useState, useEffect } from 'react';
import { getMatchups, getDecks } from '../api/meta';
import type { Matchup } from '../types/meta';
import type { DeckType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';

function getWinRateColor(rate: number): string {
  if (rate >= 60) return 'bg-md-green/30 text-md-green';
  if (rate >= 55) return 'bg-md-green/15 text-md-green';
  if (rate >= 45) return 'bg-md-textMuted/10 text-md-textMuted';
  if (rate >= 40) return 'bg-md-red/15 text-md-red';
  return 'bg-md-red/30 text-md-red';
}

export default function Matchups() {
  const [decks, setDecks] = useState<DeckType[]>([]);
  const [selectedDeck, setSelectedDeck] = useState('');
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getDecks()
      .then((d) => {
        const filtered = d.filter(dk => dk.tier != null && dk.tier <= 3);
        setDecks(filtered);
        if (filtered.length > 0) setSelectedDeck(filtered[0].name);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDeck) return;
    setLoading(true);
    getMatchups(selectedDeck)
      .then(setMatchups)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDeck]);

  if (loading && decks.length === 0) return <LoadingSpinner size="lg" />;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-md-gold">Matchup Analysis</h2>

      <div className="bg-md-surface border border-md-border rounded-lg p-4">
        <label className="text-sm text-md-textMuted block mb-2">Select Deck</label>
        <select
          value={selectedDeck}
          onChange={(e) => setSelectedDeck(e.target.value)}
          className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue w-full max-w-sm"
        >
          {decks.map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <LoadingSpinner />
      ) : matchups.length > 0 ? (
        <div className="bg-md-surface border border-md-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-md-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-md-textMuted">Opponent</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Win Rate</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Sample Size</th>
                <th className="px-4 py-3 text-sm font-medium text-md-textMuted">Visual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-md-border">
              {matchups
                .sort((a, b) => b.win_rate_a - a.win_rate_a)
                .map((m) => (
                  <tr key={m.deck_b} className="hover:bg-md-surfaceHover transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{m.deck_b}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-sm font-semibold ${getWinRateColor(m.win_rate_a)}`}>
                        {m.win_rate_a.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-md-textMuted">{m.sample_size}</td>
                    <td className="px-4 py-3">
                      <div className="w-full h-2 bg-md-bg rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${m.win_rate_a >= 50 ? 'bg-md-green' : 'bg-md-red'}`}
                          style={{ width: `${m.win_rate_a}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
          No matchup data available for this deck. Data is scraped from masterduelmeta.com and may not be available for all decks.
        </div>
      )}
    </div>
  );
}
