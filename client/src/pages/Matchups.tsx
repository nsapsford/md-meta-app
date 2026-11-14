import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../components/common/ErrorBanner';
import { MatchupMatrixSkeleton } from '../components/common/Skeleton';
import CountUp from '../components/common/CountUp';
import SyncFreshnessBadge from '../components/common/SyncFreshnessBadge';
import PullToRefresh from '../components/common/PullToRefresh';
import { useSyncUpdate } from '../cache/SyncUpdateContext';
import { decksQuery, matchupMatrixQuery } from '../queries/options';
import { useFirstContent } from '../launch/firstContent';
import MetaAdvisor from '../components/matchups/MetaAdvisor';
import EcosystemView from '../components/matchups/EcosystemView';
import MobileMatchupFocus from '../components/matchups/MobileMatchupFocus';
import { useIsNative } from '../hooks/useIsNative';
import clsx from 'clsx';

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
  const isNative = useIsNative();
  const { applying, applyUpdate, syncRecords } = useSyncUpdate();
  const [tab, setTab] = useState<'matrix' | 'advisor' | 'ecosystem'>('matrix');
  const [inferGaps, setInferGaps] = useState(false);
  const [includePersonal, setIncludePersonal] = useState(true);
  const [dismissedError, setDismissedError] = useState<unknown>(null);

  const decksQ = useQuery(decksQuery());
  const decks = useMemo(
    () => (decksQ.data ?? []).filter((dk) => dk.tier != null && dk.tier <= 3),
    [decksQ.data]
  );
  const deckNames = useMemo(() => decks.map((d) => d.name), [decks]);
  const advisorDecks = useMemo(() => [...deckNames, 'Rogue'], [deckNames]);

  // Each source/toggle combination is its own cache entry, so flipping back to
  // one you've already viewed is instant; switching tabs no longer refetches.
  const matrixQ = useQuery({
    ...matchupMatrixQuery('blended', inferGaps, includePersonal),
    enabled: tab === 'matrix',
  });
  const matrix = matrixQ.data ?? null;
  const loading = matrixQ.isPending;
  const measuredCells = useMemo(
    () => matrix ? Object.values(matrix.matrix).reduce((n, row) => n + Object.values(row).filter((c) => !c.inferred).length, 0) : 0,
    [matrix]
  );

  // Surface an error only when there's nothing (cached or fresh) to show.
  const rawError = (!decksQ.data && decksQ.error) || (!matrix && matrixQ.error) || null;
  const error = rawError && rawError !== dismissedError ? rawError.message : '';
  useFirstContent(matrix != null || error !== '');

  const tabClass = (t: string) => clsx(
    'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
    tab === t
      ? 'bg-md-blue/15 text-md-blue border border-md-blue/20'
      : 'text-md-textMuted hover:text-md-textSecondary hover:bg-md-surfaceHover/40'
  );

  return (
    <PullToRefresh onRefresh={applyUpdate}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-md-gold">Matchup Analysis</h2>
        <SyncFreshnessBadge records={syncRecords} sources={['mdm_deck_types', 'mdm_tournaments']} updating={applying} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={tabClass('matrix')} onClick={() => setTab('matrix')}>Matrix</button>
        <button className={tabClass('ecosystem')} onClick={() => setTab('ecosystem')}>Ecosystem</button>
        <button className={tabClass('advisor')} onClick={() => setTab('advisor')}>Meta Advisor</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => { setDismissedError(rawError); void decksQ.refetch(); void matrixQ.refetch(); }} />}

      {tab === 'matrix' && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setInferGaps(!inferGaps)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                  inferGaps
                    ? 'bg-md-purple/15 text-md-purple border-md-purple/30'
                    : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                )}
                title="Fill missing cells with model estimates (inverse matchups, win-rate model). These are NOT measured results."
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

          {!loading && matrix && measuredCells === 0 && (
            <div className="bg-md-surfaceAlt/40 border border-md-border rounded-lg p-3 text-sm text-md-textMuted">
              <span className="font-semibold text-md-textSecondary">No measured matchup data.</span>{' '}
              untapped.gg doesn't publish archetype-vs-archetype win rates, so the matrix only fills in from games you log
              under <strong>My Games</strong>.
              {inferGaps && ' Every cell shown below is a model estimate, not a result.'}
              {' '}For how decks perform overall at Master rank, see <strong>Meta Advisor → EV Ranking</strong>.
            </div>
          )}

          {loading || !matrix ? <MatchupMatrixSkeleton /> : matrix.decks.length > 0 && (measuredCells > 0 || inferGaps) ? (
            isNative ? (
              <MobileMatchupFocus matrix={matrix} inferGaps={inferGaps} />
            ) : (
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
                        const inferLabel = cell.inferred
                          ? ` [${cell.inference_method ?? 'inferred'}]`
                          : '';
                        return (
                          <td
                            key={colDeck}
                            title={`${getRelationshipLabel(cell.rate)}${inferLabel}${cell.n_untapped || cell.n_tournament || cell.n_personal ? ` | n=${cell.n_untapped + cell.n_tournament + (cell.n_personal ?? 0)}` : ''} (${cell.confidence} confidence)`}
                            className={clsx(
                              'px-2 py-1 text-center rounded cursor-default',
                              cell.inferred
                                ? `${getWinRateColor(cell.rate)} opacity-60 italic border border-dashed border-md-border`
                                : `${getWinRateColor(cell.rate)} font-semibold`
                            )}
                          >
                            <CountUp value={cell.rate * 100} decimals={0} suffix="%" />
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
            )
          ) : (
            matrix.decks.length === 0 && (
              <p className="text-sm text-md-textMuted py-4 text-center">No matchup data available.</p>
            )
          )}
        </div>
      )}

      {tab === 'ecosystem' && (
        <EcosystemView deckNames={deckNames} />
      )}

      {tab === 'advisor' && (
        <MetaAdvisor decks={advisorDecks} includePersonal={includePersonal} onTogglePersonal={() => setIncludePersonal(!includePersonal)} />
      )}
    </div>
    </PullToRefresh>
  );
}
