import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getEcosystemAnalysis } from '../../api/matchups';
import type {
  EcosystemAnalysis,
  DeckEcosystemProfile,
  PredatorPreyRelationship,
  RockPaperScissorsCycle,
} from '../../types/meta';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import clsx from 'clsx';

// ── Helpers ──

function strengthLabel(s: PredatorPreyRelationship['strength']): string {
  if (s === 'hard_counter') return 'Hard Counter';
  if (s === 'soft_counter') return 'Soft Counter';
  return 'Slight Edge';
}

function strengthColor(s: PredatorPreyRelationship['strength']): string {
  if (s === 'hard_counter') return 'bg-md-red/20 text-md-red border border-md-red/30';
  if (s === 'soft_counter') return 'bg-md-orange/20 text-md-orange border border-md-orange/30';
  return 'bg-md-textMuted/15 text-md-textMuted border border-md-border';
}

function confidenceDot(c: 'high' | 'medium' | 'low'): string {
  if (c === 'high') return 'bg-md-green';
  if (c === 'medium') return 'bg-md-orange';
  return 'bg-md-textMuted';
}

function winRateColor(rate: number): string {
  if (rate >= 0.60) return 'text-md-green';
  if (rate >= 0.55) return 'text-md-green';
  if (rate >= 0.45) return 'text-md-textMuted';
  if (rate >= 0.40) return 'text-md-red';
  return 'text-md-red';
}

function metricLabel(value: number, low: string, mid: string, high: string): string {
  if (value >= 0.6) return high;
  if (value >= 0.3) return mid;
  return low;
}

function tierColor(tier: number | null): string {
  if (tier === 0) return '#f59e0b';
  if (tier === 1) return '#3b82f6';
  if (tier === 2) return '#8b5cf6';
  if (tier === 3) return '#6b7280';
  return '#404040';
}

// ── Sub-components ──

function RelationshipRow({ rel, side }: { rel: PredatorPreyRelationship; side: 'prey' | 'predator' }) {
  const deckName = side === 'prey' ? rel.prey : rel.predator;
  const pct = (rel.win_rate * 100).toFixed(1);

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-md-surfaceHover/40 transition-colors rounded">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${confidenceDot(rel.confidence)}`} title={`${rel.confidence} confidence`} />
        <span className="text-sm font-medium truncate">{deckName}</span>
        {rel.mechanism === 'inferred' && (
          <span className="text-xs italic text-md-textMuted">(inferred)</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${strengthColor(rel.strength)}`}>
          {strengthLabel(rel.strength)}
        </span>
        <span className={`text-sm font-bold tabular-nums ${winRateColor(side === 'prey' ? rel.win_rate : 1 - rel.win_rate)}`}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, subLabel, colorClass }: { label: string; value: string; subLabel?: string; colorClass?: string }) {
  return (
    <div className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border rounded-lg p-3 text-center">
      <div className={clsx('text-lg font-bold tabular-nums', colorClass || 'text-md-text')}>{value}</div>
      <div className="text-xs text-md-textMuted mt-0.5">{label}</div>
      {subLabel && <div className="text-xs text-md-textMuted mt-0.5 italic">{subLabel}</div>}
    </div>
  );
}

// ── Food Chain SVG ──

function FoodChainGraph({ foodChain, profiles }: { foodChain: PredatorPreyRelationship[]; profiles: DeckEcosystemProfile[] }) {
  const top = foodChain.slice(0, 15);
  const involvedDecks = useMemo(() => {
    const set = new Set<string>();
    for (const r of top) { set.add(r.predator); set.add(r.prey); }
    return Array.from(set);
  }, [top]);

  if (involvedDecks.length === 0) {
    return <p className="text-sm text-md-textMuted text-center py-4">No significant counter relationships found.</p>;
  }

  const profileMap = useMemo(() => {
    const m: Record<string, DeckEcosystemProfile> = {};
    for (const p of profiles) m[p.deck] = p;
    return m;
  }, [profiles]);

  const width = 600, height = 400;
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(cx, cy) - 60;

  // Position decks in a circle
  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    involvedDecks.forEach((deck, i) => {
      const angle = (2 * Math.PI * i) / involvedDecks.length - Math.PI / 2;
      pos[deck] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
    return pos;
  }, [involvedDecks, cx, cy, radius]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl mx-auto">
      <defs>
        <marker id="arrowRed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#ef4444" />
        </marker>
        <marker id="arrowOrange" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#f97316" />
        </marker>
      </defs>

      {/* Edges */}
      {top.map((rel, i) => {
        const from = positions[rel.predator];
        const to = positions[rel.prey];
        if (!from || !to) return null;

        // Shorten arrow to not overlap node
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nodeRadius = 20;
        const endX = to.x - (dx / len) * (nodeRadius + 10);
        const endY = to.y - (dy / len) * (nodeRadius + 10);
        const startX = from.x + (dx / len) * (nodeRadius + 2);
        const startY = from.y + (dy / len) * (nodeRadius + 2);

        const isHard = rel.strength === 'hard_counter';
        const thickness = Math.max(1, Math.min(4, rel.meta_impact * 200));

        return (
          <line
            key={i}
            x1={startX} y1={startY} x2={endX} y2={endY}
            stroke={isHard ? '#ef4444' : '#f97316'}
            strokeWidth={thickness}
            strokeOpacity={0.7}
            markerEnd={isHard ? 'url(#arrowRed)' : 'url(#arrowOrange)'}
          />
        );
      })}

      {/* Nodes */}
      {involvedDecks.map((deck) => {
        const pos = positions[deck];
        const profile = profileMap[deck];
        const playRate = profile?.play_rate ?? 0;
        const nodeR = Math.max(14, Math.min(28, 14 + playRate * 200));

        return (
          <g key={deck}>
            <circle
              cx={pos.x} cy={pos.y} r={nodeR}
              fill={tierColor(profile?.tier ?? null)}
              fillOpacity={0.25}
              stroke={tierColor(profile?.tier ?? null)}
              strokeWidth={2}
            />
            <text
              x={pos.x}
              y={pos.y + nodeR + 14}
              textAnchor="middle"
              fill="#a1a1aa"
              fontSize="10"
              fontWeight="500"
            >
              {deck.length > 15 ? deck.slice(0, 13) + '…' : deck}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main Component ──

interface Props {
  deckNames: string[];
}

export default function EcosystemView({ deckNames }: Props) {
  const [analysis, setAnalysis] = useState<EcosystemAnalysis | null>(null);
  const [selectedDeck, setSelectedDeck] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (deckNames.length > 0 && !selectedDeck) setSelectedDeck(deckNames[0]);
  }, [deckNames, selectedDeck]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getEcosystemAnalysis(controller.signal)
      .then(setAnalysis)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (error) return <ErrorBanner message={error} onRetry={() => setError('')} />;
  if (loading) return <LoadingSpinner />;
  if (!analysis || analysis.profiles.length === 0) {
    return (
      <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
        No ecosystem data available. Run a sync to populate matchup data.
      </div>
    );
  }

  const profile = analysis.profiles.find((p) => p.deck === selectedDeck) ?? analysis.profiles[0];

  const vulnLabel = profile.vulnerability_score > 0.03
    ? 'Exposed' : profile.vulnerability_score > 0.01
    ? 'Moderate' : 'Safe';
  const vulnColor = profile.vulnerability_score > 0.03
    ? 'text-md-red' : profile.vulnerability_score > 0.01
    ? 'text-md-orange' : 'text-md-green';

  return (
    <div className="space-y-4">
      {/* Section A: Deck Profile */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-md-text">Deck Ecosystem Profile</h3>
          <select
            value={selectedDeck}
            onChange={(e) => setSelectedDeck(e.target.value)}
            className="bg-md-bg border border-md-border rounded-lg px-3 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue max-w-xs"
          >
            {deckNames.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Header badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-bold text-md-text">{profile.deck}</span>
          {profile.tier != null && (
            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: tierColor(profile.tier) + '25', color: tierColor(profile.tier) }}>
              Tier {profile.tier}
            </span>
          )}
          {profile.polarization_index >= 0 && (
            <span className={clsx(
              'px-2 py-0.5 rounded text-xs font-semibold border',
              profile.polarization_index >= 0.4
                ? 'bg-md-purple/15 text-md-purple border-md-purple/30'
                : 'bg-md-textMuted/10 text-md-textMuted border-md-border'
            )}>
              {profile.polarization_index >= 0.4 ? 'Polarized' : 'Balanced'}
            </span>
          )}
          <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold border', vulnColor === 'text-md-red'
            ? 'bg-md-red/15 text-md-red border-md-red/30'
            : vulnColor === 'text-md-orange'
            ? 'bg-md-orange/15 text-md-orange border-md-orange/30'
            : 'bg-md-green/15 text-md-green border-md-green/30'
          )}>
            {vulnLabel}
          </span>
        </div>

        {/* Predator / Prey columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Prey (decks this one beats) */}
          <div>
            <h4 className="text-sm font-semibold text-md-green mb-2 flex items-center gap-1.5">
              <span>&#x1f3af;</span> Prey &mdash; Decks you beat
            </h4>
            <div className="bg-md-green/5 border border-md-green/10 rounded-lg divide-y divide-md-border">
              {profile.prey.length > 0 ? profile.prey.map((r) => (
                <RelationshipRow key={r.prey} rel={r} side="prey" />
              )) : (
                <p className="text-xs text-md-textMuted p-3">No favourable matchups found</p>
              )}
            </div>
          </div>

          {/* Predators (decks that beat this one) */}
          <div>
            <h4 className="text-sm font-semibold text-md-red mb-2 flex items-center gap-1.5">
              <span>&#x2620;</span> Predators &mdash; Decks that beat you
            </h4>
            <div className="bg-md-red/5 border border-md-red/10 rounded-lg divide-y divide-md-border">
              {profile.predators.length > 0 ? profile.predators.map((r) => (
                <RelationshipRow key={r.predator} rel={r} side="predator" />
              )) : (
                <p className="text-xs text-md-textMuted p-3">No significant threats found</p>
              )}
            </div>
          </div>
        </div>

        {/* Neutral matchups */}
        {profile.neutral.length > 0 && (
          <div className="text-xs text-md-textMuted">
            <span className="font-medium">Even matchups:</span>{' '}
            {profile.neutral.join(', ')}
          </div>
        )}

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Polarization"
            value={profile.polarization_index >= 0 ? (profile.polarization_index * 100).toFixed(0) : 'N/A'}
            subLabel={profile.polarization_index >= 0 ? metricLabel(profile.polarization_index, 'Balanced', 'Mixed', 'Polarized') : 'Need 3+ matchups'}
          />
          <StatCard
            label="Matchup Spread"
            value={profile.matchup_spread > 0 ? (profile.matchup_spread * 100).toFixed(0) + '%' : 'N/A'}
            subLabel="Best − Worst"
          />
          <StatCard
            label="Vulnerability"
            value={(profile.vulnerability_score * 100).toFixed(1)}
            subLabel={vulnLabel}
            colorClass={vulnColor}
          />
          <StatCard
            label="Meta Fitness"
            value={(profile.meta_fitness * 100).toFixed(1) + '%'}
            subLabel="Field-weighted WR"
            colorClass={winRateColor(profile.meta_fitness)}
          />
        </div>
      </div>

      {/* Section B: Food Chain Graph */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-md-text">Food Chain</h3>
        <p className="text-xs text-md-textMuted">
          Arrows point from predator to prey. Thickness = meta impact. Red = hard counter, orange = soft counter.
        </p>
        <FoodChainGraph foodChain={analysis.food_chain} profiles={analysis.profiles} />
      </div>

      {/* Section C: Meta Health Summary */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-md-text">Meta Health</h3>

        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <div className={clsx(
              'text-2xl font-bold tabular-nums',
              analysis.meta_health_index >= 0.6 ? 'text-md-green'
                : analysis.meta_health_index >= 0.4 ? 'text-md-orange'
                : 'text-md-red'
            )}>
              {(analysis.meta_health_index * 100).toFixed(0)}
            </div>
            <div className="text-xs text-md-textMuted">/ 100</div>
          </div>
          <div className="flex-1">
            <div className="w-full h-2 bg-md-bg rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  analysis.meta_health_index >= 0.6 ? 'bg-md-green'
                    : analysis.meta_health_index >= 0.4 ? 'bg-md-orange'
                    : 'bg-md-red'
                )}
                style={{ width: `${analysis.meta_health_index * 100}%` }}
              />
            </div>
            <p className="text-xs text-md-textMuted mt-1">
              {analysis.meta_health_index >= 0.6 ? 'Healthy — diverse meta with balanced play rates'
                : analysis.meta_health_index >= 0.4 ? 'Moderate — some decks dominate play share'
                : 'Concentrated — meta is dominated by few decks'}
            </p>
          </div>
        </div>

        {/* Top counter relationships */}
        {analysis.food_chain.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-md-textMuted">Top Counter Relationships</h4>
            {analysis.food_chain.slice(0, 3).map((r, i) => (
              <div key={i} className="text-sm text-md-textSecondary">
                <span className="font-medium text-md-text">{r.predator}</span>
                <span className="text-md-red mx-1">{r.strength === 'hard_counter' ? '⟫' : '›'}</span>
                <span className="font-medium text-md-text">{r.prey}</span>
                <span className="text-xs text-md-textMuted ml-2">
                  {(r.win_rate * 100).toFixed(0)}% WR, {(r.meta_impact * 100).toFixed(1)}% impact
                </span>
              </div>
            ))}
          </div>
        )}

        {/* RPS Cycles */}
        {analysis.cycles.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-md-textMuted">Rock-Paper-Scissors Cycles</h4>
            {analysis.cycles.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="text-md-purple font-medium">
                  {c.decks.join(' › ')} › {c.decks[0]}
                </span>
                <span className="text-xs text-md-textMuted ml-2">
                  avg {(c.cycle_strength * 100).toFixed(0)}% WR
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
