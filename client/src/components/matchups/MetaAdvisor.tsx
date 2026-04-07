import { useState, useEffect } from 'react';
import { getMatchupAdvisor, type AdvisorResult, type AdvisorOpponent } from '../../api/matchups';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import axios from 'axios';

function WinRatePill({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1);
  const cls = rate >= 0.55
    ? 'bg-md-green/15 text-md-green border border-md-green/20'
    : rate >= 0.45
    ? 'bg-md-orange/15 text-md-orange border border-md-orange/20'
    : 'bg-md-red/15 text-md-red border border-md-red/20';
  return <span className={`px-2 py-0.5 rounded text-sm font-semibold ${cls}`}>{pct}%</span>;
}

interface Props {
  decks: string[];
}

export default function MetaAdvisor({ decks }: Props) {
  const [selectedDeck, setSelectedDeck] = useState('');
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (decks.length > 0 && !selectedDeck) setSelectedDeck(decks[0]);
  }, [decks, selectedDeck]);

  useEffect(() => {
    if (!selectedDeck) return;
    const controller = new AbortController();
    setLoading(true);
    getMatchupAdvisor(selectedDeck, controller.signal)
      .then(setResult)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedDeck]);

  return (
    <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-md-text">Meta Advisor</h3>
        <span className="text-xs text-md-textMuted">Based on last 3 tournaments</span>
      </div>

      <div>
        <label className="text-sm text-md-textMuted block mb-2">I'm playing:</label>
        <select
          value={selectedDeck}
          onChange={(e) => setSelectedDeck(e.target.value)}
          className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue w-full max-w-sm"
        >
          {decks.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => { setError(''); }} />}

      {loading ? <LoadingSpinner /> : result && result.opponents.length > 0 ? (
        <>
          {/* Vulnerability banner */}
          {(() => {
            const dangerousOpponents = result.opponents.filter((o) => o.win_rate < 0.48 && o.field_pct >= 0.05);
            const totalDangerPct = dangerousOpponents.reduce((s, o) => s + o.field_pct, 0);
            if (dangerousOpponents.length === 0) return (
              <div className="bg-md-green/5 border border-md-green/20 rounded-lg p-3 text-sm">
                <span className="font-semibold text-md-green">Safe</span>
                <span className="text-md-textMuted ml-2">No major threats in the current tournament field.</span>
              </div>
            );
            return (
              <div className="bg-md-orange/5 border border-md-orange/20 rounded-lg p-3 text-sm">
                <span className="font-semibold text-md-orange">
                  {totalDangerPct >= 0.2 ? 'Exposed' : 'Moderate'}
                </span>
                <span className="text-md-textMuted ml-2">
                  {dangerousOpponents.length} predator{dangerousOpponents.length > 1 ? 's' : ''} in the field
                  ({(totalDangerPct * 100).toFixed(0)}% combined):
                  {' '}{dangerousOpponents.map((o) => o.opponent).join(', ')}
                </span>
              </div>
            );
          })()}

          <div className="divide-y divide-md-border">
            {result.opponents.map((o: AdvisorOpponent) => (
              <div key={o.opponent} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="text-sm font-medium">{o.opponent}</span>
                  <span className="text-xs text-md-textMuted ml-2">
                    {(o.field_pct * 100).toFixed(0)}% of field
                  </span>
                </div>
                <WinRatePill rate={o.win_rate} />
              </div>
            ))}
          </div>

          <div className="bg-md-blue/5 border border-md-blue/20 rounded-lg p-3">
            <span className="text-sm font-semibold text-md-blue">
              Expected weighted win rate: {(result.weighted_win_rate * 100).toFixed(1)}%
            </span>
            {result.opponents[0] && result.opponents[0].win_rate < 0.48 && (
              <p className="text-xs text-md-textMuted mt-1">
                Watch out for {result.opponents[0].opponent} ({(result.opponents[0].field_pct * 100).toFixed(0)}% of the field).
              </p>
            )}
          </div>
        </>
      ) : result?.opponents.length === 0 ? (
        <p className="text-sm text-md-textMuted">No tournament field data available yet. Run a sync to populate.</p>
      ) : null}
    </div>
  );
}
