import { useState, useEffect } from 'react';
import axios from 'axios';
import { getMatchups, getMatchupMatrix, type MatchupMatrix } from '../api/matchups';
import { getDecks } from '../api/meta';
import { getSyncStatus, type SyncRecord } from '../api/sync';
import type { Matchup } from '../types/meta';
import type { DeckType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import SyncFreshnessBadge from '../components/common/SyncFreshnessBadge';
import MetaAdvisor from '../components/matchups/MetaAdvisor';
import EcosystemView from '../components/matchups/EcosystemView';
import clsx from 'clsx';

type MatrixSource = 'blended' | 'untapped' | 'tournament';

function getWinRateColor(rate: number): string {
  if (rate >= 0.60) return 'bg-md-green/30 text-md-green';
  if (rate >= 0.55) return 'bg-md-green/15 text-md-green';
  if (rate >= 0.45) return 'bg-md-textMuted/10 text-md-textMuted';
  if (rate >= 0.40) return 'bg-md-red/15 text-md-red';
  return 'bg-md-red/30 text-md-red';
}

function getRelationshipLabel(rate: number): string {
  if (rate >= 0.60) return 'Hard Counter';
  if (rate >= 0.55) return 'Soft Counter';
  if (rate >= 0.48) return 'Neutral';
  if (rate >= 0.40) return 'Unfavoured';
  return 'Hard Countered';
}

function getRelationshipIcon(rate: number): string {
  if (rate >= 0.60) return '\u{1F480}'; // skull
  if (rate >= 0.55) return '\u{1F6E1}'; // shield
  if (rate >= 0.48) return '\u2014';    // dash
  if (rate >= 0.40) return '\u26A0';    // warning
  return '\u{1F480}';                   // skull (you're the prey)
}

export default function Matchups() {
  const [tab, setTab] = useState<'list' | 'matrix' | 'advisor' | 'ecosystem'>('matrix');
  const [decks, setDecks] = useState<DeckType[]>([]);
  const [selectedDeck, setSelectedDeck] = useState('');
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [matrix, setMatrix] = useState<MatchupMatrix | null>(null);
  const [matrixSource, setMatrixSource] = useState<MatrixSource>('blended');
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getSyncStatus().then(setSyncRecords).catch(() => {});
    getDecks()
      .then((d) => {
        const filtered = d.filter((dk) => dk.tier != null && dk.tier <= 3);
        setDecks(filtered);
        if (filtered.length > 0) setSelectedDeck(filtered[0].name);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'matrix') return;
    const controller = new AbortController();
    setLoading(true);
    getMatchupMatrix(matrixSource, controller.signal)
      .then(setMatrix)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [tab, matrixSource]);

  useEffect(() => {
    if (tab !== 'list' || !selectedDeck) return;
    const controller = new AbortController();
    setLoading(true);
    getMatchups(selectedDeck, controller.signal)
      .then(setMatchups)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [tab, selectedDeck]);

  const tabClass = (t: string) => clsx(
    'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
    tab === t
      ? 'bg-md-blue/15 text-md-blue border border-md-blue/20'
      : 'text-md-textMuted hover:text-md-textSecondary hover:bg-md-surfaceHover/40'
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-md-gold">Matchup Analysis</h2>
        <SyncFreshnessBadge records={syncRecords} sources={['mdm_deck_types', 'mdm_tournaments']} />
      </div>

      <div className="flex gap-2">
        <button className={tabClass('matrix')} onClick={() => setTab('matrix')}>Matrix</button>
        <button className={tabClass('ecosystem')} onClick={() => setTab('ecosystem')}>Ecosystem</button>
        <button className={tabClass('advisor')} onClick={() => setTab('advisor')}>Meta Advisor</button>
        <button className={tabClass('list')} onClick={() => setTab('list')}>By Deck</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

      {tab === 'matrix' && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
          <div className="flex gap-2">
            {(['blended', 'untapped', 'tournament'] as MatrixSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setMatrixSource(s)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                  matrixSource === s
                    ? 'bg-md-blue/15 text-md-blue border-md-blue/30'
                    : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {loading ? <LoadingSpinner /> : matrix && matrix.decks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="text-xs border-separate border-spacing-0.5">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1 text-md-textMuted font-medium min-w-[120px]">vs →</th>
                    {matrix.decks.map((d) => (
                      <th key={d} className="px-1 py-1 text-md-textMuted font-medium text-center max-w-[80px] truncate" title={d}>
                        {d.split(' ').slice(0, 2).join(' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.decks.map((rowDeck) => (
                    <tr key={rowDeck}>
                      <td className="px-2 py-1 text-sm font-medium text-md-textSecondary whitespace-nowrap">{rowDeck}</td>
                      {matrix.decks.map((colDeck) => {
                        if (rowDeck === colDeck) {
                          return <td key={colDeck} className="px-2 py-1 text-center bg-md-surfaceAlt rounded text-md-textMuted">—</td>;
                        }
                        const cell = matrix.matrix[rowDeck]?.[colDeck];
                        if (!cell) {
                          return <td key={colDeck} className="px-2 py-1 text-center bg-md-surfaceAlt/50 rounded text-md-textMuted text-xs">?</td>;
                        }
                        const pct = (cell.rate * 100).toFixed(0);
                        return (
                          <td
                            key={colDeck}
                            title={`${getRelationshipLabel(cell.rate)} | Untapped n=${cell.n_untapped} Tournament n=${cell.n_tournament} (${cell.confidence} confidence)`}
                            className={`px-2 py-1 text-center rounded font-semibold cursor-default ${getWinRateColor(cell.rate)}`}
                          >
                            {pct}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-md-textMuted mt-2">Hover a cell to see sample sizes. ? = insufficient data.</p>
            </div>
          ) : (
            <p className="text-sm text-md-textMuted py-4 text-center">
              No matchup data in matrix yet. Use the <em>By Deck</em> tab to load individual matchups, or run a full sync.
            </p>
          )}
        </div>
      )}

      {tab === 'ecosystem' && (
        <EcosystemView deckNames={decks.map((d) => d.name)} />
      )}

      {tab === 'advisor' && (
        <MetaAdvisor decks={decks.map((d) => d.name)} />
      )}

      {tab === 'list' && (
        <>
          <div className="bg-md-surface border border-md-border rounded-lg p-4">
            <label className="text-sm text-md-textMuted block mb-2">Select Deck</label>
            <select
              value={selectedDeck}
              onChange={(e) => setSelectedDeck(e.target.value)}
              className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue w-full max-w-sm"
            >
              {decks.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>

          {loading ? <LoadingSpinner /> : matchups.length > 0 ? (
            <div className="bg-md-surface border border-md-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-md-border">
                    <th className="text-center px-2 py-3 text-sm font-medium text-md-textMuted w-8"></th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-md-textMuted">Opponent</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Win Rate</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Matchup</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Sample Size</th>
                    <th className="px-4 py-3 text-sm font-medium text-md-textMuted">Visual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-border">
                  {[...matchups]
                    .sort((a, b) => b.win_rate_a - a.win_rate_a)
                    .map((m) => (
                      <tr key={m.deck_b} className="hover:bg-md-surfaceHover transition-colors">
                        <td className="px-2 py-3 text-center" title={getRelationshipLabel(m.win_rate_a / 100)}>
                          {getRelationshipIcon(m.win_rate_a / 100)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{m.deck_b}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-sm font-semibold ${getWinRateColor(m.win_rate_a / 100)}`}>
                            {m.win_rate_a.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-md-textMuted">{getRelationshipLabel(m.win_rate_a / 100)}</span>
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
              No matchup data available for this deck.
            </div>
          )}
        </>
      )}
    </div>
  );
}
