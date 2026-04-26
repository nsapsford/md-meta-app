import { useState, useEffect } from 'react';
import {
  getMatchupAdvisor, getLadderEv,
  type AdvisorResult, type AdvisorOpponent, type LadderEvResult,
} from '../../api/matchups';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import DataValue from '../common/DataValue';
import TierBadge from '../common/TierBadge';
import axios from 'axios';
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

function EvBadge({ ev, lowConf }: { ev: number; lowConf: number }) {
  const pct = Math.round(ev * 100);
  const color = ev >= 0.54 ? 'text-md-green' : ev >= 0.48 ? 'text-md-orange' : 'text-md-red';
  return (
    <span className={clsx('font-bold tabular-nums text-base', color)} title={lowConf > 0.4 ? 'Low-confidence estimate' : undefined}>
      {pct}%{lowConf > 0.4 && <span className="text-xs ml-0.5 opacity-60">◆</span>}
    </span>
  );
}

interface Props {
  decks: string[];
  includePersonal?: boolean;
  onTogglePersonal?: () => void;
}

export default function MetaAdvisor({ decks, includePersonal = false, onTogglePersonal }: Props) {
  const [mode, setMode] = useState<'ev' | 'deck'>('ev');
  const [selectedDeck, setSelectedDeck] = useState('');
  const [advisorResult, setAdvisorResult] = useState<AdvisorResult | null>(null);
  const [evResults, setEvResults] = useState<LadderEvResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tierFilter, setTierFilter] = useState<number | null>(null);

  useEffect(() => {
    if (decks.length > 0 && !selectedDeck) setSelectedDeck(decks[0]);
  }, [decks, selectedDeck]);

  // Load EV ranking
  useEffect(() => {
    if (mode !== 'ev') return;
    const controller = new AbortController();
    setLoading(true);
    getLadderEv(controller.signal, includePersonal)
      .then(setEvResults)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [mode, includePersonal]);

  // Load per-deck advisor
  useEffect(() => {
    if (mode !== 'deck' || !selectedDeck) return;
    const controller = new AbortController();
    setLoading(true);
    getMatchupAdvisor(selectedDeck, controller.signal, includePersonal)
      .then(setAdvisorResult)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [mode, selectedDeck, includePersonal]);

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
          <span className="text-xs text-md-textMuted">Based on meta + blended rates</span>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

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
                      <span className="text-sm font-semibold truncate">{r.deck}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-md-textMuted">{Math.round(r.coverage * 100)}% cov.</span>
                      <EvBadge ev={r.ev} lowConf={r.low_confidence_fraction} />
                    </div>
                  </div>

                  {(r.top_good_matchups.length > 0 || r.top_bad_matchups.length > 0) && (
                    <div className="mt-2 flex gap-4 text-xs">
                      {r.top_good_matchups.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {r.top_good_matchups.map((m) => (
                            <span key={m.opponent}
                              className="px-1.5 py-0.5 rounded bg-md-green/10 text-md-green border border-md-green/15"
                              title={`${Math.round(m.win_rate * 100)}% vs ${m.opponent}${m.inferred ? ' (inferred)' : ''}`}
                            >
                              {m.opponent.split(' ')[0]} {Math.round(m.win_rate * 100)}%
                            </span>
                          ))}
                        </div>
                      )}
                      {r.top_bad_matchups.length > 0 && (
                        <div className="flex gap-1 flex-wrap ml-auto">
                          {r.top_bad_matchups.map((m) => (
                            <span key={m.opponent}
                              className="px-1.5 py-0.5 rounded bg-md-red/10 text-md-red border border-md-red/15"
                              title={`${Math.round(m.win_rate * 100)}% vs ${m.opponent}${m.inferred ? ' (inferred)' : ''}`}
                            >
                              {m.opponent.split(' ')[0]} {Math.round(m.win_rate * 100)}%
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-md-textMuted pt-1">
                EV = weighted win rate across the tier 1–3 field by play rate. ◆ = low-confidence estimate.
              </p>
            </div>
          ) : (
            <p className="text-sm text-md-textMuted">No matchup data available. Run a sync to populate.</p>
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
                const dangerous = advisorResult.opponents.filter((o) => o.win_rate < 0.48 && o.field_pct >= 0.05);
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
                    <WinRatePill rate={o.win_rate} confidence={o.confidence} />
                  </div>
                ))}
              </div>

              <div className="bg-md-blue/5 border border-md-blue/20 rounded-lg p-3">
                <span className="text-sm font-semibold text-md-blue">
                  Expected weighted win rate: {(advisorResult.weighted_win_rate * 100).toFixed(1)}%
                </span>
                {advisorResult.opponents[0] && advisorResult.opponents[0].win_rate < 0.48 && (
                  <p className="text-xs text-md-textMuted mt-1">
                    Watch out for {advisorResult.opponents[0].opponent} ({(advisorResult.opponents[0].field_pct * 100).toFixed(0)}% of the field).
                  </p>
                )}
              </div>
            </>
          ) : advisorResult?.opponents.length === 0 ? (
            <p className="text-sm text-md-textMuted">No tournament field data available yet. Run a sync to populate.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
