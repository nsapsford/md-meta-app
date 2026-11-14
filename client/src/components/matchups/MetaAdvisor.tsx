import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdvisorOpponent, LadderEvResult } from '../../api/matchups';
import { advisorQuery, ladderEvQuery } from '../../queries/options';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import DataValue from '../common/DataValue';
import TierBadge from '../common/TierBadge';
import PickStrategy from './PickStrategy';
import clsx from 'clsx';

function WinRatePill({ rate, confidence }: { rate: number; confidence?: 'high' | 'medium' | 'low' }) {
  const cls = rate >= 0.55
    ? 'bg-md-green/15 border border-md-green/20'
    : rate >= 0.45
    ? 'bg-md-orange/15 border border-md-orange/20'
    : 'bg-md-red/15 border border-md-red/20';
  return (
    <span className={`px-2 py-0.5 rounded text-sm ${cls}`}>
      <DataValue value={rate} format="percent" confidence={confidence ?? 'high'} />
    </span>
  );
}

function EvBadge({ ev, lowSample }: { ev: number; lowSample: boolean }) {
  const color = ev >= 0.54 ? 'text-md-green' : ev >= 0.48 ? 'text-md-orange' : 'text-md-red';
  return (
    <span className={clsx('font-bold tabular-nums text-base', color)} title={lowSample ? 'Small sample — treat with caution' : undefined}>
      {(ev * 100).toFixed(1)}%{lowSample && <span className="text-xs ml-0.5 opacity-60">◆</span>}
    </span>
  );
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

interface Props {
  decks: string[];
  includePersonal?: boolean;
  onTogglePersonal?: () => void;
}

const EMPTY_EV: LadderEvResult[] = [];

export default function MetaAdvisor({ decks, includePersonal = false, onTogglePersonal }: Props) {
  const [mode, setMode] = useState<'ev' | 'deck' | 'pick'>('ev');
  const [deckChoice, setSelectedDeck] = useState('');
  const selectedDeck = deckChoice || decks[0] || '';
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [dismissedError, setDismissedError] = useState<unknown>(null);

  // Cached per (mode inputs), so flipping EV ⇄ By Deck ⇄ back is instant.
  const evQ = useQuery({ ...ladderEvQuery(), enabled: mode === 'ev' });
  const advisorQ = useQuery({ ...advisorQuery(selectedDeck, includePersonal), enabled: mode === 'deck' && selectedDeck !== '' });
  const evResults: LadderEvResult[] = evQ.data ?? EMPTY_EV;
  const advisorResult = advisorQ.data ?? null;
  const loading = mode === 'ev' ? evQ.isPending : advisorQ.isPending;
  const rawError = (mode === 'ev' ? !evQ.data && evQ.error : !advisorQ.data && advisorQ.error) || null;
  const error = rawError && rawError !== dismissedError ? rawError.message : '';

  const filteredEv = tierFilter != null
    ? evResults.filter((r) => r.tier != null && r.tier <= tierFilter)
    : evResults;

  return (
    <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('ev')}
            className={clsx('px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors', {
              'bg-md-blue/15 text-md-blue border-md-blue/30': mode === 'ev',
              'text-md-textMuted border-md-border hover:border-md-borderLight': mode !== 'ev',
            })}
          >
            EV Ranking
          </button>
          <button
            onClick={() => setMode('deck')}
            className={clsx('px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors', {
              'bg-md-blue/15 text-md-blue border-md-blue/30': mode === 'deck',
              'text-md-textMuted border-md-border hover:border-md-borderLight': mode !== 'deck',
            })}
          >
            By Deck
          </button>
          <button
            onClick={() => setMode('pick')}
            className={clsx('px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors', {
              'bg-md-blue/15 text-md-blue border-md-blue/30': mode === 'pick',
              'text-md-textMuted border-md-border hover:border-md-borderLight': mode !== 'pick',
            })}
          >
            <span className="sm:hidden">Pick</span>
            <span className="hidden sm:inline">Pick Strategy</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onTogglePersonal && (
            <button
              onClick={onTogglePersonal}
              className={clsx('px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors', {
                'bg-md-gold/15 text-md-gold border-md-gold/30': includePersonal,
                'text-md-textMuted border-md-border hover:border-md-borderLight': !includePersonal,
              })}
              title="Blend your personal game results (requires 10+ games per matchup)"
            >
              My Games
            </button>
          )}
          <span className="text-xs text-md-textMuted">{mode === 'deck' ? 'Based on tournament field + your logged games' : 'Based on Master-rank results'}</span>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => { setDismissedError(rawError); void (mode === 'ev' ? evQ.refetch() : advisorQ.refetch()); }} />}

      {/* EV Ranking mode */}
      {mode === 'ev' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-md-textMuted">Filter:</span>
            {([null, 1, 2, 3] as const).map((t) => (
              <button
                key={String(t)}
                onClick={() => setTierFilter(t)}
                className={clsx('px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors', {
                  'bg-md-blue/15 text-md-blue border-md-blue/30': tierFilter === t,
                  'text-md-textMuted border-md-border hover:border-md-borderLight': tierFilter !== t,
                })}
              >
                {t == null ? 'All' : `≤T${t}`}
              </button>
            ))}
          </div>

          {loading ? <LoadingSpinner /> : filteredEv.length > 0 ? (
            <div className="space-y-2">
              {filteredEv.slice(0, 8).map((r, i) => (
                <div
                  key={r.deck}
                  className="border border-md-border/50 rounded-xl p-3 hover:border-md-border transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-md-textMuted tabular-nums w-5 shrink-0">#{i + 1}</span>
                      <TierBadge tier={r.tier} size="sm" />
                      <span className="text-sm font-semibold min-w-0 break-words">{r.deck}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <EvBadge ev={r.ev} lowSample={r.low_sample} />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-md-textMuted">
                    <span>1st: {pct(r.win_rate_first)}</span>
                    <span>2nd: {pct(r.win_rate_second)}</span>
                    <span>{(r.play_rate * 100).toFixed(1)}% played</span>
                    <span>{r.games.toLocaleString()} games</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-md-textMuted pt-1">
                Measured win rate at Master rank (untapped.gg), mirror-match corrected: (wr − share·50%) ÷ (1 − share).
                1st/2nd = raw win rate going first / second. ◆ = small sample, ranked below reliable decks.
                Archetype-vs-archetype data isn't published, so this is a whole-field number, not a matchup-weighted one.
              </p>
            </div>
          ) : (
            <p className="text-sm text-md-textMuted">No per-rank data available yet. Run a sync to populate.</p>
          )}
        </>
      )}

      {/* By Deck mode */}
      {mode === 'deck' && (
        <>
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

          {loading ? <LoadingSpinner /> : advisorResult && advisorResult.opponents.length > 0 ? (
            <>
              {(() => {
                if (advisorResult.coverage === 0) return null; // nothing measured → no verdict
                const dangerous = advisorResult.opponents.filter((o) => o.win_rate != null && o.win_rate < 0.48 && o.field_pct >= 0.05);
                const dangerPct = dangerous.reduce((s, o) => s + o.field_pct, 0);
                if (dangerous.length === 0) return (
                  <div className="bg-md-green/5 border border-md-green/20 rounded-lg p-3 text-sm">
                    <span className="font-semibold text-md-green">Safe</span>
                    <span className="text-md-textMuted ml-2">No major threats in the current tournament field.</span>
                  </div>
                );
                return (
                  <div className="bg-md-orange/5 border border-md-orange/20 rounded-lg p-3 text-sm">
                    <span className="font-semibold text-md-orange">
                      {dangerPct >= 0.2 ? 'Exposed' : 'Moderate'}
                    </span>
                    <span className="text-md-textMuted ml-2">
                      {dangerous.length} predator{dangerous.length > 1 ? 's' : ''} in the field
                      ({(dangerPct * 100).toFixed(0)}% combined):
                      {' '}{dangerous.map((o) => o.opponent).join(', ')}
                    </span>
                  </div>
                );
              })()}

              <div className="divide-y divide-md-border">
                {advisorResult.opponents.map((o: AdvisorOpponent) => (
                  <div key={o.opponent} className="flex items-center justify-between py-2.5">
                    <div>
                      <span className="text-sm font-medium">{o.opponent}</span>
                      <span className="text-xs text-md-textMuted ml-2">
                        {(o.field_pct * 100).toFixed(0)}% of field
                      </span>
                    </div>
                    {o.win_rate != null
                      ? <WinRatePill rate={o.win_rate} confidence={o.confidence ?? 'low'} />
                      : <span className="text-xs text-md-textMuted" title="No measured data for this pairing">no data</span>}
                  </div>
                ))}
              </div>

              {advisorResult.weighted_win_rate != null ? (
                <div className="bg-md-blue/5 border border-md-blue/20 rounded-lg p-3">
                  <span className="text-sm font-semibold text-md-blue">
                    Weighted win rate: {(advisorResult.weighted_win_rate * 100).toFixed(1)}%
                  </span>
                  <p className="text-xs text-md-textMuted mt-1">
                    Based on the {Math.round(advisorResult.coverage * 100)}% of the field with measured matchup data.
                    {advisorResult.opponents[0]?.win_rate != null && advisorResult.opponents[0].win_rate < 0.48 && (
                      <> Watch out for {advisorResult.opponents[0].opponent} ({(advisorResult.opponents[0].field_pct * 100).toFixed(0)}% of the field).</>
                    )}
                  </p>
                </div>
              ) : (
                <div className="bg-md-surfaceAlt/40 border border-md-border rounded-lg p-3 text-sm text-md-textMuted">
                  No measured matchup data for this deck. untapped.gg doesn't publish archetype-vs-archetype win rates;
                  log games under <strong>My Games</strong> to build your own spread.
                </div>
              )}
            </>
          ) : advisorResult?.opponents.length === 0 ? (
            <p className="text-sm text-md-textMuted">No tournament field data available yet. Run a sync to populate.</p>
          ) : null}
        </>
      )}

      {/* Pick Strategy mode */}
      {mode === 'pick' && (
        <PickStrategy decks={decks} includePersonal={includePersonal} />
      )}
    </div>
  );
}
