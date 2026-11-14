import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LadderEvResult } from '../../api/matchups';
import type { PersonalSpread } from '../../api/personalGames';
import { ladderEvQuery, personalSpreadQuery } from '../../queries/options';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import TierBadge from '../common/TierBadge';
import { useIsNative } from '../../hooks/useIsNative';
import clsx from 'clsx';
import { tierHex } from '../../constants/tierColors';

interface Props {
  decks: string[];
  includePersonal?: boolean;
  onTogglePersonal?: () => void;
}

interface Comfort { n: number; rate: number }

const COMFORT_MIN_GAMES = 10;

function tierColor(tier: number | null): string {
  return tierHex(tier);
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
  const maxPop = Math.max(0.05, ...results.map((r) => r.play_rate));
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
        <text x={W / 2} y={H - 8} fill="#9ca3af" fontSize="11" textAnchor="middle">Play rate at Master →</text>
        <text x={14} y={H / 2} fill="#9ca3af" fontSize="11" textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`}>Master win rate (mirror-corrected) →</text>

        {results.map((r) => {
          const cx = sx(r.play_rate), cy = sy(r.ev);
          const radius = 5 + Math.min(9, Math.sqrt(r.games) / 12);
          const isTop = topPickDecks.has(r.deck);
          const isQueue = top3Names.has(r.deck.toLowerCase());
          const lowConf = r.low_sample;
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
          <div className="text-xs text-md-textMuted">Tier {tipResult.tier ?? '?'} · {(tipResult.play_rate * 100).toFixed(1)}% played · {tipResult.games.toLocaleString()} games</div>
          <div className="text-xs mt-1"><span className="text-md-textMuted">Win rate: </span><span className={rateColor(tipResult.ev)}>{(tipResult.ev * 100).toFixed(1)}%</span>
            <span className="text-md-textMuted"> (raw {(tipResult.win_rate_raw * 100).toFixed(1)}%)</span>
          </div>
          <div className="text-xs"><SplitText r={tipResult} /></div>
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

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

function SplitText({ r }: { r: LadderEvResult }) {
  return (
    <span className="text-md-textMuted">
      1st: <span className={r.win_rate_first != null ? rateColor(r.win_rate_first) : ''}>{pct(r.win_rate_first)}</span>
      {' · '}2nd: <span className={r.win_rate_second != null ? rateColor(r.win_rate_second) : ''}>{pct(r.win_rate_second)}</span>
    </span>
  );
}

// ── Pick card ──

function PickCard({
  r, rank, medPop, comfortMap, includePersonal,
}: {
  r: LadderEvResult;
  rank: number;
  medPop: number;
  comfortMap: Record<string, Comfort>;
  includePersonal: boolean;
}) {
  const q = quadrant(r.ev, r.play_rate, medPop);
  const comfort = includePersonal ? comfortMap[r.deck.toLowerCase()] : undefined;
  const showComfort = comfort && comfort.n >= COMFORT_MIN_GAMES;
  const lowConf = r.low_sample;

  return (
    <div className="border border-md-border/60 rounded-xl p-3 space-y-2 hover:border-md-border transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-md-textMuted tabular-nums w-5 shrink-0">#{rank}</span>
          <TierBadge tier={r.tier} size="sm" />
          <span className="text-sm font-semibold min-w-0 break-words">{r.deck}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold border', q.cls)}>{q.label}</span>
          <span className="text-base font-bold tabular-nums text-md-text" title={`Win rate at ${r.rank}, mirror-corrected`}>
            {(r.ev * 100).toFixed(1)}%{lowConf && <span className="text-xs ml-0.5 opacity-60" title="Small sample">◆</span>}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <MetricBar label="Win rate" rate={r.ev} />
        {showComfort
          ? <MetricBar label="Comfort" rate={comfort!.rate} muted />
          : includePersonal && (
            <p className="text-[10px] text-md-textMuted pl-16">Log {COMFORT_MIN_GAMES}+ games with this deck for a comfort read.</p>
          )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
        <SplitText r={r} />
        <span className="text-md-textMuted">{(r.play_rate * 100).toFixed(1)}% played</span>
        <span className="text-md-textMuted">{r.games.toLocaleString()} games{lowConf && ' (small sample)'}</span>
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

// ── Most-played banner ──

function QueueBanner({ top3, rank }: { top3: LadderEvResult[]; rank: string }) {
  return (
    <div className="bg-md-blue/5 border border-md-blue/20 rounded-lg p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-md-blue">Most played at {rank}</span>
        {top3.map((t) => (
          <span key={t.deck} className="px-2 py-0.5 rounded text-xs bg-md-surfaceAlt/60 border border-md-border text-md-textSecondary">
            {t.deck} <span className="text-md-textMuted">{(t.play_rate * 100).toFixed(0)}% · </span>
            <span className={rateColor(t.ev)}>{(t.ev * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main ──

const EMPTY_RESULTS: LadderEvResult[] = [];
const EMPTY_SPREAD: PersonalSpread[] = [];

export default function PickStrategy({ decks, includePersonal = false, onTogglePersonal }: Props) {
  const isNative = useIsNative();
  const resultsQ = useQuery(ladderEvQuery(true));
  const spreadQ = useQuery({ ...personalSpreadQuery(), enabled: includePersonal });
  const results: LadderEvResult[] = resultsQ.data ?? EMPTY_RESULTS;
  const spread: PersonalSpread[] = includePersonal ? spreadQ.data ?? EMPTY_SPREAD : EMPTY_SPREAD;
  const loading = resultsQ.isPending;
  const error = !resultsQ.data && resultsQ.error ? resultsQ.error.message : '';

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
    () => [...results].sort((a, b) => b.play_rate - a.play_rate).slice(0, 3),
    [results]
  );
  const top3Names = useMemo(() => new Set(top3.map((t) => t.deck.toLowerCase())), [top3]);
  // Server order: reliable samples first, by win rate.
  const ranked = results;
  const medPop = useMemo(() => median(results.map((r) => r.play_rate).filter((p) => p > 0)), [results]);
  const topPickDecks = useMemo(() => new Set(ranked.filter((r) => !r.low_sample).slice(0, 3).map((r) => r.deck)), [ranked]);

  if (error) return <ErrorBanner message={error} onRetry={() => void resultsQ.refetch()} />;
  if (loading) return <LoadingSpinner />;
  if (results.length === 0) {
    return (
      <p className="text-sm text-md-textMuted py-4 text-center">
        No per-rank data available yet. Run a sync to populate.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-md-textMuted">
          Ranked by measured <strong>Master-rank win rate</strong> (mirror-match corrected) from untapped.gg. Archetype-vs-archetype
          matchup data isn't published, so no counter-picking is modelled.
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

      {top3.length > 0 && <QueueBanner top3={top3} rank={results[0]?.rank ?? 'master'} />}

      {!isNative && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="font-semibold text-md-text mb-2">Strategy Dashboard — Master win rate vs play rate</h3>
          <StrategyScatter
            results={results}
            top3Names={top3Names}
            medPop={medPop}
            comfortMap={comfortMap}
            includePersonal={includePersonal}
            topPickDecks={topPickDecks}
          />
          <p className="text-[10px] text-md-textMuted mt-1">
            Bubble color = tier; ring = top win rate (reliable samples); thicker outline = a top-3 archetype; ◆ = small sample.
            {includePersonal && ' Gold marker/line = your Comfort (personal WR) vs Master win rate.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {ranked.map((r, i) => (
          <PickCard
            key={r.deck}
            r={r}
            rank={i + 1}
            medPop={medPop}
            comfortMap={comfortMap}
            includePersonal={includePersonal}
          />
        ))}
      </div>
    </div>
  );
}
