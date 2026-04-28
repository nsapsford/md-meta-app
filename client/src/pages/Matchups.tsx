import { useState, useEffect } from 'react';
import axios from 'axios';
import { getMatchupMatrix, type MatchupMatrix } from '../api/matchups';
import { getDecks } from '../api/meta';
import { getSyncStatus, type SyncRecord } from '../api/sync';
import type { DeckType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import SyncFreshnessBadge from '../components/common/SyncFreshnessBadge';
import MetaAdvisor from '../components/matchups/MetaAdvisor';
import EcosystemView from '../components/matchups/EcosystemView';
import MyMatchupSpread from '../components/matchups/MyMatchupSpread';
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

function _getRelationshipIcon(rate: number): string {
  if (rate >= 0.60) return '\u{1F480}'; // skull
  if (rate >= 0.55) return '\u{1F6E1}'; // shield
  if (rate >= 0.48) return '\u2014';    // dash
  if (rate >= 0.40) return '\u26A0';    // warning
  return '\u{1F480}';                   // skull (you're the prey)
}

export default function Matchups() {
  const [tab, setTab] = useState<'matrix' | 'advisor' | 'ecosystem' | 'my-spread'>('matrix');
  const [decks, setDecks] = useState<DeckType[]>([]);
  const [matrix, setMatrix] = useState<MatchupMatrix | null>(null);
  const [matrixSource, setMatrixSource] = useState<MatrixSource>('blended');
  const [inferGaps, setInferGaps] = useState(true);
  const [includePersonal, setIncludePersonal] = useState(true);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getSyncStatus().then(setSyncRecords).catch(() => {});
    getDecks()
      .then((d) => {
        const filtered = d.filter((dk) => dk.tier != null && dk.tier <= 3);
        setDecks(filtered);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'matrix') return;
    const controller = new AbortController();
    setLoading(true);
    getMatchupMatrix(matrixSource, inferGaps, controller.signal, includePersonal)
      .then(setMatrix)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [tab, matrixSource, inferGaps, includePersonal]);

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

      <div className="flex flex-wrap gap-2">
        <button className={tabClass('matrix')} onClick={() => setTab('matrix')}>Matrix</button>
        <button className={tabClass('ecosystem')} onClick={() => setTab('ecosystem')}>Ecosystem</button>
        <button className={tabClass('advisor')} onClick={() => setTab('advisor')}>Meta Advisor</button>
        <button className={tabClass('my-spread')} onClick={() => setTab('my-spread')}>My Spread</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

      {tab === 'matrix' && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
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
            <div className="sm:ml-3 sm:border-l sm:border-md-border sm:pl-3 flex gap-2">
              <button
                onClick={() => setInferGaps(!inferGaps)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                  inferGaps
                    ? 'bg-md-purple/15 text-md-purple border-md-purple/30'
                    : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                )}
                title="Fill missing cells using ecosystem inference (inverse matchups, predator/prey, win-rate model)"
              >
                Infer Gaps
              </button>
              <button
                onClick={() => setIncludePersonal(!includePersonal)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                  includePersonal
                    ? 'bg-md-gold/15 text-md-gold border-md-gold/30'
                    : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                )}
                title="Blend your personal game results into matchup rates. Influence scales with how many games you've logged for each pairing (capped at 40% weight at 10+ games)."
              >
                My Games
              </button>
            </div>
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
                        const inferLabel = cell.inferred
                          ? ` [${cell.inference_method ?? 'inferred'}]`
                          : '';
                        return (
                          <td
                            key={colDeck}
                            title={`${getRelationshipLabel(cell.rate)}${inferLabel} | Untapped n=${cell.n_untapped} Tournament n=${cell.n_tournament}${cell.n_personal ? ` Personal n=${cell.n_personal}` : ''} (${cell.confidence} confidence)`}
                            className={clsx(
                              'px-2 py-1 text-center rounded cursor-default',
                              cell.inferred
                                ? `${getWinRateColor(cell.rate)} opacity-60 italic border border-dashed border-md-border`
                                : `${getWinRateColor(cell.rate)} font-semibold`
                            )}
                          >
                            {pct}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-md-textMuted mt-2">
                Hover a cell to see sample sizes.{' '}
                {inferGaps
                  ? <><span className="italic opacity-60">Italic/dashed</span> = inferred (inverse, ecosystem, or win-rate model).</>
                  : <>? = insufficient data. Enable <strong>Infer Gaps</strong> to estimate.</>
                }
              </p>
            </div>
          ) : (
            <p className="text-sm text-md-textMuted py-4 text-center">
              No matchup data in matrix yet. Run a full sync to populate.
            </p>
          )}
        </div>
      )}

      {tab === 'ecosystem' && (
        <EcosystemView deckNames={decks.map((d) => d.name)} />
      )}

      {tab === 'advisor' && (
        <MetaAdvisor decks={decks.map((d) => d.name)} includePersonal={includePersonal} onTogglePersonal={() => setIncludePersonal(!includePersonal)} />
      )}

      {tab === 'my-spread' && (
        <MyMatchupSpread deckNames={decks.map((d) => d.name)} />
      )}
    </div>
  );
}
