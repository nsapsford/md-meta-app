import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getLadderEv, type LadderEvResult, type LadderEvMatchup } from '../../api/matchups';
import { getSpread, type PersonalSpread } from '../../api/personalGames';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import TierBadge from '../common/TierBadge';
import { useIsNative } from '../../hooks/useIsNative';
import clsx from 'clsx';

interface Props {
  decks: string[];
  includePersonal?: boolean;
  onTogglePersonal?: () => void;
}

interface Comfort { n: number; rate: number }

const COMFORT_MIN_GAMES = 10;

function tierColor(tier: number | null): string {
  if (tier === 0) return '#f59e0b';
  if (tier === 1) return '#3b82f6';
  if (tier === 2) return '#8b5cf6';
  if (tier === 3) return '#6b7280';
  return '#404040';
}

function rateColor(rate: number): string {
  if (rate >= 0.55) return 'text-md-green';
  if (rate >= 0.45) return 'text-md-orange';
  return 'text-md-red';
}

type QuadKey = 'sleeper' | 'proven' | 'trap' | 'fringe';
function quadrant(ev: number, popularity: number, medPop: number): { key: QuadKey; label: string; cls: string } {
  const hiEv = ev >= 0.5;
  const hiPop = popularity >= medPop;
  if (hiEv && !hiPop) return { key: 'sleeper', label: 'Sleeper', cls: 'bg-md-green/15 text-md-green border-md-green/30' };
  if (hiEv && hiPop) return { key: 'proven', label: 'Proven', cls: 'bg-md-blue/15 text-md-blue border-md-blue/30' };
  if (!hiEv && hiPop) return { key: 'trap', label: 'Trap', cls: 'bg-md-red/15 text-md-red border-md-red/30' };
  return { key: 'fringe', label: 'Fringe', cls: 'bg-md-textMuted/10 text-md-textMuted border-md-border' };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Horizontal labelled bar, used for Power and Comfort. */
function MetricBar({ label, rate, muted }: { label: string; rate: number; muted?: boolean }) {
  const pct = Math.round(rate * 100);
  const color = rate >= 0.55 ? 'bg-md-green' : rate >= 0.45 ? 'bg-md-orange' : 'bg-md-red';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-md-textMuted w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-md-bg rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', muted ? 'bg-md-textMuted/40' : color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={clsx('text-xs font-semibold tabular-nums w-9 text-right', muted ? 'text-md-textMuted' : rateColor(rate))}>{pct}%</span>
    </div>
  );
}

// ── Strategy scatter (desktop) ──

interface ScatterTip { deck: string; x: number; y: number }

function StrategyScatter({
  results, top3Names, medPop, comfortMap, includePersonal, topPickDecks,
}: {
  results: LadderEvResult[];
  top3Names: Set<string>;
  medPop: number;
  comfortMap: Record<string, Comfort>;
  includePersonal: boolean;
  topPickDecks: Set<string>;
}) {
  const [tip, setTip] = useState<ScatterTip | null>(null);
  const W = 680, H = 440, pad = 44;
  const maxPop = Math.max(0.05, ...results.map((r) => r.popularity));
  const yMin = 0.40, yMax = 0.60;
  const clampY = (v: number) => Math.max(yMin, Math.min(yMax, v));
  const sx = (p: number) => pad + (p / maxPop) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((clampY(v) - yMin) / (yMax - yMin)) * (H - 2 * pad);
  const xMed = sx(medPop), yMid = sy(0.5);

  const tipResult = tip ? results.find((r) => r.deck === tip.deck) : null;
  const tipComfort = tip ? comfortMap[tip.deck.toLowerCase()] : undefined;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Quadrant guides */}
        <line x1={xMed} y1={pad} x2={xMed} y2={H - pad} stroke="#404040" strokeWidth={1} strokeDasharray="4 3" />
        <line x1={pad} y1={yMid} x2={W - pad} y2={yMid} stroke="#404040" strokeWidth={1} strokeDasharray="4 3" />

        {/* Quadrant labels */}
        <text x={pad + 6} y={pad + 14} fill="#22c55e" fontSize="11" fontWeight="600">◤ Sleepers / Counter-meta</text>
        <text x={W - pad - 6} y={pad + 14} fill="#3b82f6" fontSize="11" fontWeight="600" textAnchor="end">Proven ◥</text>
        <text x={W - pad - 6} y={H - pad - 6} fill="#ef4444" fontSize="11" fontWeight="600" textAnchor="end">Overrated / Traps ◢</text>
        <text x={pad + 6} y={H - pad - 6} fill="#6b7280" fontSize="11" fontWeight="600">◣ Fringe</text>

        {/* Axis labels */}
        <text x={W / 2} y={H - 8} fill="#9ca3af" fontSize="11" textAnchor="middle">Archetype Popularity →</text>
        <text x={14} y={H / 2} fill="#9ca3af" fontSize="11" textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`}>Ladder EV (Power) →</text>

        {results.map((r) => {
          const cx = sx(r.popularity), cy = sy(r.ev);
          const radius = 5 + Math.min(9, r.coverage * 9);
          const isTop = topPickDecks.has(r.deck);
          const isQueue = top3Names.has(r.deck.toLowerCase());
          const lowConf = r.low_confidence_fraction > 0.4;
          const comfort = includePersonal ? comfortMap[r.deck.toLowerCase()] : undefined;
          const showComfort = comfort && comfort.n >= COMFORT_MIN_GAMES;
          const cyComfort = showComfort ? sy(comfort!.rate) : null;
          return (
            <g key={r.deck}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const svg = (e.currentTarget.closest('svg') as SVGSVGElement)?.getBoundingClientRect();
                const rect = e.currentTarget.getBoundingClientRect();
                setTip({ deck: r.deck, x: rect.left - (svg?.left ?? 0) + rect.width / 2, y: rect.top - (svg?.top ?? 0) });
              }}
              onMouseLeave={() => setTip(null)}
            >
              {/* Comfort-vs-Power overlay */}
              {showComfort && cyComfort != null && (
                <>
                  <line x1={cx} y1={cy} x2={cx} y2={cyComfort} stroke="#f59e0b" strokeWidth={1.5} strokeOpacity={0.5} />
                  <circle cx={cx} cy={cyComfort} r={4} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
                </>
              )}
              {isTop && <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" />}
              <circle cx={cx} cy={cy} r={radius}
                fill={tierColor(r.tier)} fillOpacity={0.3}
                stroke={tierColor(r.tier)} strokeWidth={isQueue ? 2.5 : 1.5} />
              {lowConf && <text x={cx} y={cy + 3} fill="#fff" fontSize="9" textAnchor="middle" opacity={0.7}>◆</text>}
            </g>
          );
        })}
      </svg>

      {tip && tipResult && (
        <div className="absolute pointer-events-none z-10 bg-md-bg border border-md-border rounded-lg shadow-lg p-3 max-w-[240px]"
          style={{ left: `${Math.min(Math.max(tip.x, 120), 560)}px`, top: `${tip.y}px`, transform: 'translate(-50%, -100%)' }}>
          <div className="font-semibold text-sm text-md-text">{tipResult.deck}</div>
          <div className="text-xs text-md-textMuted">Tier {tipResult.tier ?? '?'} · {(tipResult.popularity * 100).toFixed(1)}% played</div>
          <div className="text-xs mt-1"><span className="text-md-textMuted">EV: </span><span className={rateColor(tipResult.ev)}>{(tipResult.ev * 100).toFixed(1)}%</span>
            {tipResult.ev_vs_top3 != null && <span className="text-md-textMuted"> · vs queue: <span className={rateColor(tipResult.ev_vs_top3)}>{(tipResult.ev_vs_top3 * 100).toFixed(1)}%</span></span>}
          </div>
          <div className="text-xs"><span className="text-md-textMuted">Pick score: </span><span className="font-semibold text-md-text">{(tipResult.pick_score * 100).toFixed(1)}%</span></div>
          {tipComfort && tipComfort.n >= COMFORT_MIN_GAMES && (
            <div className="text-xs"><span className="text-md-gold">Comfort: </span><span className={rateColor(tipComfort.rate)}>{(tipComfort.rate * 100).toFixed(0)}%</span><span className="text-md-textMuted"> ({tipComfort.n}g)</span></div>
          )}
          {tipResult.interaction?.engines.length ? (
            <div className="text-[10px] text-md-purple mt-1">{tipResult.interaction.engines.map((e) => e.name).join(' · ')} engine</div>
          ) : null}
          {tipResult.interaction?.vs_top3_rationale && (
            <div className="text-[10px] text-md-textMuted italic mt-1">{tipResult.interaction.vs_top3_rationale}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pick card (mobile-primary + desktop ranked list) ──

function lookupMatchups(r: LadderEvResult): Map<string, LadderEvMatchup> {
  return new Map([...r.top_good_matchups, ...r.top_bad_matchups].map((m) => [m.opponent.toLowerCase(), m]));
}

function PickCard({
  r, rank, top3, medPop, comfortMap, includePersonal,
}: {
  r: LadderEvResult;
  rank: number;
  top3: { name: string }[];
  medPop: number;
  comfortMap: Record<string, Comfort>;
  includePersonal: boolean;
}) {
  const q = quadrant(r.ev, r.popularity, medPop);
  const mLookup = useMemo(() => lookupMatchups(r), [r]);
  const comfort = includePersonal ? comfortMap[r.deck.toLowerCase()] : undefined;
  const showComfort = comfort && comfort.n >= COMFORT_MIN_GAMES;
  const lowConf = r.low_confidence_fraction > 0.4;

  return (
    <div className="border border-md-border/60 rounded-xl p-3 space-y-2 hover:border-md-border transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-md-textMuted tabular-nums w-5 shrink-0">#{rank}</span>
          <TierBadge tier={r.tier} size="sm" />
          <span className="text-sm font-semibold truncate">{r.deck}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold border', q.cls)}>{q.label}</span>
          <span className="text-base font-bold tabular-nums text-md-text" title="Pick score">
            {Math.round(r.pick_score * 100)}%{lowConf && <span className="text-xs ml-0.5 opacity-60">◆</span>}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <MetricBar label="Power" rate={r.ev} />
        {showComfort
          ? <MetricBar label="Comfort" rate={comfort!.rate} muted />
          : includePersonal && (
            <p className="text-[10px] text-md-textMuted pl-16">Log {COMFORT_MIN_GAMES}+ games with this deck for a comfort read.</p>
          )}
      </div>

      {/* WR vs the top-3 queue */}
      <div className="flex flex-wrap gap-1">
        <span className="text-[10px] text-md-textMuted self-center mr-0.5">vs queue:</span>
        {top3.map((t) => {
          const m = mLookup.get(t.name.toLowerCase());
          const short = t.name.split(' ')[0];
          if (!m) return <span key={t.name} className="px-1.5 py-0.5 rounded text-[10px] bg-md-surfaceAlt/50 text-md-textMuted border border-md-border">{short} —</span>;
          return (
            <span key={t.name} className={clsx('px-1.5 py-0.5 rounded text-[10px] border',
              m.win_rate >= 0.5 ? 'bg-md-green/10 text-md-green border-md-green/20' : 'bg-md-red/10 text-md-red border-md-red/20')}
              title={`${Math.round(m.win_rate * 100)}% vs ${t.name}${m.inferred ? ' (inferred)' : ''}`}>
              {short} {Math.round(m.win_rate * 100)}%
            </span>
          );
        })}
      </div>

      {/* Interaction profile */}
      {r.interaction && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5 items-center text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-md-surfaceAlt/60 text-md-textSecondary border border-md-border capitalize">{r.interaction.strategy_class}</span>
            {r.interaction.hand_traps > 0 && <span className="text-md-blue">🪤 {r.interaction.hand_traps} HT</span>}
            {r.interaction.floodgates > 0 && <span className="text-md-purple">⛔ {r.interaction.floodgates} FG</span>}
            {r.interaction.board_breakers > 0 && <span className="text-md-orange">💥 {r.interaction.board_breakers} BB</span>}
            {r.interaction.engines.map((e) => (
              <span key={e.name} className="px-1.5 py-0.5 rounded bg-md-purple/10 text-md-purple border border-md-purple/20">{e.name} engine</span>
            ))}
          </div>
          {r.interaction.vs_top3_rationale && (
            <p className="text-[11px] text-md-textMuted italic">{r.interaction.vs_top3_rationale}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Counter-Queue banner ──

function CounterQueueBanner({ top3, picks }: { top3: LadderEvResult[]; picks: LadderEvResult[] }) {
  return (
    <div className="bg-md-blue/5 border border-md-blue/20 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-md-blue">Beating the queue</span>
        <span className="text-xs text-md-textMuted">Top archetypes right now:</span>
        {top3.map((t) => (
          <span key={t.deck} className="px-2 py-0.5 rounded text-xs bg-md-surfaceAlt/60 border border-md-border text-md-textSecondary">
            {t.deck} <span className="text-md-textMuted">{(t.popularity * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        {picks.map((r, i) => {
          const mLookup = lookupMatchups(r);
          return (
            <div key={r.deck} className="text-sm">
              <span className="text-md-textMuted tabular-nums mr-1">#{i + 1}</span>
              <span className="font-semibold text-md-text">{r.deck}</span>
              {r.ev_vs_top3 != null && (
                <span className={clsx('ml-2 font-semibold', rateColor(r.ev_vs_top3))}>{(r.ev_vs_top3 * 100).toFixed(0)}% vs queue</span>
              )}
              <span className="text-xs text-md-textMuted ml-2">
                {[...mLookup.values()].length > 0 &&
                  r.top_good_matchups.slice(0, 2).map((m) => `${Math.round(m.win_rate * 100)}% vs ${m.opponent.split(' ')[0]}`).join(' · ')}
              </span>
              {r.interaction?.vs_top3_rationale && (
                <span className="block text-[11px] text-md-textMuted italic pl-5">{r.interaction.vs_top3_rationale}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──

export default function PickStrategy({ decks, includePersonal = false, onTogglePersonal }: Props) {
  const isNative = useIsNative();
  const [results, setResults] = useState<LadderEvResult[]>([]);
  const [spread, setSpread] = useState<PersonalSpread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    getLadderEv(controller.signal, includePersonal, { reinforce: true })
      .then((data) => { if (!cancelled) setResults(data); })
      .catch((e) => { if (!cancelled && !axios.isCancel(e)) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [includePersonal]);

  useEffect(() => {
    if (!includePersonal) { setSpread([]); return; }
    let cancelled = false;
    getSpread().then((data) => { if (!cancelled) setSpread(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [includePersonal]);

  const comfortMap = useMemo(() => {
    const m: Record<string, Comfort & { wins: number }> = {};
    for (const s of spread) {
      const k = s.deck_played.toLowerCase();
      const e = m[k] ?? { n: 0, wins: 0, rate: 0 };
      e.n += s.total; e.wins += s.wins;
      m[k] = e;
    }
    const out: Record<string, Comfort> = {};
    for (const k in m) out[k] = { n: m[k].n, rate: m[k].n > 0 ? m[k].wins / m[k].n : 0 };
    return out;
  }, [spread]);

  const top3 = useMemo(
    () => [...results].filter((r) => r.popularity > 0).sort((a, b) => b.popularity - a.popularity).slice(0, 3),
    [results]
  );
  const top3Names = useMemo(() => new Set(top3.map((t) => t.deck.toLowerCase())), [top3]);
  const ranked = useMemo(() => [...results].sort((a, b) => b.pick_score - a.pick_score), [results]);
  const medPop = useMemo(() => median(results.map((r) => r.popularity).filter((p) => p > 0)), [results]);
  const topPickDecks = useMemo(() => new Set(ranked.slice(0, 3).map((r) => r.deck)), [ranked]);

  if (error) return <ErrorBanner message={error} onRetry={() => setError('')} />;
  if (loading) return <LoadingSpinner />;
  if (results.length === 0) {
    return <p className="text-sm text-md-textMuted py-4 text-center">No matchup data available. Run a sync to populate.</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-md-textMuted">
          Ranked by <strong>pick score</strong> — Ladder EV blended with a bonus for beating the current top-3, reinforced by card-level interactions.
        </p>
        {onTogglePersonal && (
          <button
            onClick={onTogglePersonal}
            className={clsx('px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors', {
              'bg-md-gold/15 text-md-gold border-md-gold/30': includePersonal,
              'text-md-textMuted border-md-border hover:border-md-borderLight': !includePersonal,
            })}
            title="Overlay your personal win rate (Comfort) — needs 10+ games per deck"
          >
            My Games
          </button>
        )}
      </div>

      {top3.length > 0 && <CounterQueueBanner top3={top3} picks={ranked.slice(0, 3)} />}

      {!isNative && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="font-semibold text-md-text mb-2">Strategy Dashboard — EV vs Popularity</h3>
          <StrategyScatter
            results={results}
            top3Names={top3Names}
            medPop={medPop}
            comfortMap={comfortMap}
            includePersonal={includePersonal}
            topPickDecks={topPickDecks}
          />
          <p className="text-[10px] text-md-textMuted mt-1">
            Bubble color = tier; ring = top counter-queue pick; thicker outline = a top-3 archetype; ◆ = low-confidence.
            {includePersonal && ' Gold marker/line = your Comfort (personal WR) vs Power.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {ranked.map((r, i) => (
          <PickCard
            key={r.deck}
            r={r}
            rank={i + 1}
            top3={top3.map((t) => ({ name: t.deck }))}
            medPop={medPop}
            comfortMap={comfortMap}
            includePersonal={includePersonal}
          />
        ))}
      </div>
    </div>
  );
}
