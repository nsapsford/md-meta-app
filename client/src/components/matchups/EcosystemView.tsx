import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { getEcosystemAnalysis } from '../../api/matchups';
import type {
  EcosystemAnalysis,
  DeckEcosystemProfile,
  PredatorPreyRelationship,
  GameTheoryProfile,
  TournamentFieldEntry,
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

function strategyLabel(s: GameTheoryProfile['strategy_type']): { label: string; color: string } {
  switch (s) {
    case 'dominant': return { label: 'Dominant', color: 'bg-md-green/15 text-md-green border-md-green/30' };
    case 'counter_pick': return { label: 'Counter-Pick', color: 'bg-md-orange/15 text-md-orange border-md-orange/30' };
    case 'generalist': return { label: 'Generalist', color: 'bg-md-blue/15 text-md-blue border-md-blue/30' };
    case 'niche': return { label: 'Niche', color: 'bg-md-purple/15 text-md-purple border-md-purple/30' };
    case 'dominated': return { label: 'Dominated', color: 'bg-md-red/15 text-md-red border-md-red/30' };
  }
}

function nashDeviationLabel(d: number): { label: string; color: string } {
  if (d > 0.3) return { label: 'Overplayed', color: 'text-md-red' };
  if (d > 0.1) return { label: 'Slightly Over', color: 'text-md-orange' };
  if (d < -0.3) return { label: 'Underplayed', color: 'text-md-green' };
  if (d < -0.1) return { label: 'Slightly Under', color: 'text-md-blue' };
  return { label: 'At Equilibrium', color: 'text-md-textMuted' };
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

// ── Interactive Food Chain SVG ──

interface TooltipData {
  x: number;
  y: number;
  type: 'node' | 'edge';
  deck?: DeckEcosystemProfile;
  relationship?: PredatorPreyRelationship;
}

function FoodChainGraph({
  foodChain,
  profiles,
  selectedDeck,
  onDeckSelect,
}: {
  foodChain: PredatorPreyRelationship[];
  profiles: DeckEcosystemProfile[];
  selectedDeck: string;
  onDeckSelect: (deck: string) => void;
}) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const top = foodChain.slice(0, 15);
  const involvedDecks = useMemo(() => {
    const set = new Set<string>();
    for (const r of top) { set.add(r.predator); set.add(r.prey); }
    return Array.from(set);
  }, [top]);

  const profileMap = useMemo(() => {
    const m: Record<string, DeckEcosystemProfile> = {};
    for (const p of profiles) m[p.deck] = p;
    return m;
  }, [profiles]);

  const width = 650, height = 450;
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(cx, cy) - 70;

  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    involvedDecks.forEach((deck, i) => {
      const angle = (2 * Math.PI * i) / involvedDecks.length - Math.PI / 2;
      pos[deck] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
    return pos;
  }, [involvedDecks, cx, cy, radius]);

  // Which edges connect to hovered/selected node
  const connectedEdges = useMemo(() => {
    const target = hoveredNode || selectedDeck;
    if (!target) return new Set<number>();
    const s = new Set<number>();
    top.forEach((r, i) => {
      if (r.predator === target || r.prey === target) s.add(i);
    });
    return s;
  }, [hoveredNode, selectedDeck, top]);

  const connectedDecks = useMemo(() => {
    const target = hoveredNode || selectedDeck;
    if (!target) return new Set<string>();
    const s = new Set<string>([target]);
    top.forEach((r) => {
      if (r.predator === target) s.add(r.prey);
      if (r.prey === target) s.add(r.predator);
    });
    return s;
  }, [hoveredNode, selectedDeck, top]);

  const handleNodeEnter = useCallback((deck: string, e: React.MouseEvent<SVGElement>) => {
    setHoveredNode(deck);
    const profile = profileMap[deck];
    if (profile) {
      const svgRect = (e.currentTarget.closest('svg') as SVGSVGElement)?.getBoundingClientRect();
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        x: rect.left - (svgRect?.left ?? 0) + rect.width / 2,
        y: rect.top - (svgRect?.top ?? 0) - 8,
        type: 'node',
        deck: profile,
      });
    }
  }, [profileMap]);

  const handleEdgeEnter = useCallback((idx: number, e: React.MouseEvent<SVGElement>) => {
    setHoveredEdge(idx);
    const rel = top[idx];
    if (rel) {
      const svgRect = (e.currentTarget.closest('svg') as SVGSVGElement)?.getBoundingClientRect();
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        x: rect.left - (svgRect?.left ?? 0) + rect.width / 2,
        y: rect.top - (svgRect?.top ?? 0) - 8,
        type: 'edge',
        relationship: rel,
      });
    }
  }, [top]);

  const handleLeave = useCallback(() => {
    setHoveredNode(null);
    setHoveredEdge(null);
    setTooltip(null);
  }, []);

  if (involvedDecks.length === 0) {
    return <p className="text-sm text-md-textMuted text-center py-4">No significant counter relationships found.</p>;
  }

  const hasActiveHighlight = hoveredNode != null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl mx-auto">
        <defs>
          <marker id="arrowRed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#ef4444" />
          </marker>
          <marker id="arrowOrange" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#f97316" />
          </marker>
          <marker id="arrowDim" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#404040" />
          </marker>
        </defs>

        {/* Edges */}
        {top.map((rel, i) => {
          const from = positions[rel.predator];
          const to = positions[rel.prey];
          if (!from || !to) return null;

          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return null;
          const nodeRadius = 22;
          const endX = to.x - (dx / len) * (nodeRadius + 10);
          const endY = to.y - (dy / len) * (nodeRadius + 10);
          const startX = from.x + (dx / len) * (nodeRadius + 2);
          const startY = from.y + (dy / len) * (nodeRadius + 2);

          const isHard = rel.strength === 'hard_counter';
          const thickness = Math.max(1.5, Math.min(5, rel.meta_impact * 300 + 1));
          const isConnected = connectedEdges.has(i);
          const isHoveredEdge = hoveredEdge === i;
          const dimmed = hasActiveHighlight && !isConnected;

          return (
            <g key={`edge-${i}`}>
              {/* Invisible wider hit area for hovering */}
              <line
                x1={startX} y1={startY} x2={endX} y2={endY}
                stroke="transparent"
                strokeWidth={12}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => handleEdgeEnter(i, e)}
                onMouseLeave={handleLeave}
              />
              <line
                x1={startX} y1={startY} x2={endX} y2={endY}
                stroke={dimmed ? '#333' : isHard ? '#ef4444' : '#f97316'}
                strokeWidth={isHoveredEdge ? thickness + 2 : thickness}
                strokeOpacity={dimmed ? 0.2 : isHoveredEdge ? 1 : 0.7}
                markerEnd={dimmed ? 'url(#arrowDim)' : isHard ? 'url(#arrowRed)' : 'url(#arrowOrange)'}
                style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s', pointerEvents: 'none' }}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {involvedDecks.map((deck) => {
          const pos = positions[deck];
          const profile = profileMap[deck];
          const playRate = profile?.play_rate ?? 0;
          const nodeR = Math.max(16, Math.min(30, 16 + playRate * 200));
          const isHovered = hoveredNode === deck;
          const isSelected = selectedDeck === deck;
          const dimmed = hasActiveHighlight && !connectedDecks.has(deck);

          return (
            <g
              key={deck}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              opacity={dimmed ? 0.2 : 1}
              onMouseEnter={(e) => handleNodeEnter(deck, e)}
              onMouseLeave={handleLeave}
              onClick={() => onDeckSelect(deck)}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={pos.x} cy={pos.y} r={nodeR + 5}
                  fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2"
                />
              )}
              {/* Hover glow */}
              {isHovered && (
                <circle
                  cx={pos.x} cy={pos.y} r={nodeR + 3}
                  fill="none" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.5}
                />
              )}
              <circle
                cx={pos.x} cy={pos.y} r={nodeR}
                fill={tierColor(profile?.tier ?? null)}
                fillOpacity={isHovered ? 0.45 : 0.25}
                stroke={tierColor(profile?.tier ?? null)}
                strokeWidth={isHovered || isSelected ? 3 : 2}
              />
              <text
                x={pos.x}
                y={pos.y + nodeR + 14}
                textAnchor="middle"
                fill={dimmed ? '#555' : '#a1a1aa'}
                fontSize="10"
                fontWeight="500"
              >
                {deck.length > 15 ? deck.slice(0, 13) + '\u2026' : deck}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip overlay */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 bg-md-bg border border-md-border rounded-lg shadow-lg p-3 max-w-[220px]"
          style={{
            left: `${Math.min(Math.max(tooltip.x, 110), 540)}px`,
            top: `${tooltip.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.type === 'node' && tooltip.deck && (
            <div className="space-y-1">
              <div className="font-semibold text-sm text-md-text">{tooltip.deck.deck}</div>
              <div className="text-xs text-md-textMuted">
                Tier {tooltip.deck.tier ?? '?'} &middot; {tooltip.deck.prey.length} prey &middot; {tooltip.deck.predators.length} predators
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Meta Fitness: </span>
                <span className={winRateColor(tooltip.deck.meta_fitness)}>{(tooltip.deck.meta_fitness * 100).toFixed(1)}%</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Play Rate: </span>
                <span className="text-md-text">{((tooltip.deck.play_rate ?? 0) * 100).toFixed(1)}%</span>
              </div>
              {tooltip.deck.game_theory && (
                <div className="text-xs">
                  <span className="text-md-textMuted">Strategy: </span>
                  <span className={strategyLabel(tooltip.deck.game_theory.strategy_type).color.split(' ')[1]}>
                    {strategyLabel(tooltip.deck.game_theory.strategy_type).label}
                  </span>
                </div>
              )}
              <div className="text-[10px] text-md-textMuted italic mt-1">Click to select</div>
            </div>
          )}
          {tooltip.type === 'edge' && tooltip.relationship && (
            <div className="space-y-1">
              <div className="text-sm">
                <span className="font-semibold text-md-text">{tooltip.relationship.predator}</span>
                <span className="text-md-red mx-1">{tooltip.relationship.strength === 'hard_counter' ? '\u27EB' : '\u203A'}</span>
                <span className="font-semibold text-md-text">{tooltip.relationship.prey}</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Win Rate: </span>
                <span className={winRateColor(tooltip.relationship.win_rate)}>{(tooltip.relationship.win_rate * 100).toFixed(1)}%</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Meta Impact: </span>
                <span className="text-md-text">{(tooltip.relationship.meta_impact * 100).toFixed(2)}%</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Strength: </span>
                <span>{strengthLabel(tooltip.relationship.strength)}</span>
              </div>
              <div className="text-xs flex items-center gap-1">
                <span className="text-md-textMuted">Confidence:</span>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidenceDot(tooltip.relationship.confidence)}`} />
                <span>{tooltip.relationship.confidence}</span>
              </div>
              {tooltip.relationship.sample_size > 0 && (
                <div className="text-xs text-md-textMuted">n={tooltip.relationship.sample_size}</div>
              )}
              {tooltip.relationship.mechanism === 'inferred' && (
                <div className="text-[10px] italic text-md-textMuted">Inferred from tournament trends</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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
  const gt = profile.game_theory;

  const vulnLabel = profile.vulnerability_score > 0.03
    ? 'Exposed' : profile.vulnerability_score > 0.01
    ? 'Moderate' : 'Safe';
  const vulnColor = profile.vulnerability_score > 0.03
    ? 'text-md-red' : profile.vulnerability_score > 0.01
    ? 'text-md-orange' : 'text-md-green';

  const strat = strategyLabel(gt.strategy_type);
  const nashDev = nashDeviationLabel(gt.nash_deviation);

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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-bold text-md-text">{profile.deck}</span>
          {profile.tier != null && (
            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: tierColor(profile.tier) + '25', color: tierColor(profile.tier) }}>
              Tier {profile.tier}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${strat.color}`}>
            {strat.label}
          </span>
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

        {/* Game Theory insight row */}
        <div className="bg-md-bg/50 border border-md-border rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-medium text-md-textMuted uppercase tracking-wide">Game Theory Analysis</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-xs text-md-textMuted block">Expected Payoff</span>
              <span className={`font-bold ${winRateColor(gt.expected_payoff)}`}>
                {(gt.expected_payoff * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-xs text-md-textMuted block">Nash Status</span>
              <span className={`font-bold ${nashDev.color}`}>{nashDev.label}</span>
              <span className="text-xs text-md-textMuted ml-1">
                ({gt.nash_deviation > 0 ? '+' : ''}{(gt.nash_deviation * 100).toFixed(0)}%)
              </span>
            </div>
            <div>
              <span className="text-xs text-md-textMuted block">Best Counter To</span>
              <span className="font-bold text-md-text">
                {gt.best_response_to || '\u2014'}
              </span>
            </div>
            <div>
              <span className="text-xs text-md-textMuted block">Dominance</span>
              {gt.dominates.length > 0 ? (
                <span className="text-md-green text-xs">Dominates {gt.dominates.length} deck{gt.dominates.length > 1 ? 's' : ''}</span>
              ) : gt.dominated_by.length > 0 ? (
                <span className="text-md-red text-xs">Dominated by {gt.dominated_by.join(', ')}</span>
              ) : (
                <span className="text-md-textMuted text-xs">No dominance found</span>
              )}
            </div>
          </div>
        </div>

        {/* Predator / Prey columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            subLabel="Best \u2212 Worst"
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

      {/* Section B: Food Chain Graph (interactive) */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-md-text">Food Chain</h3>
        <p className="text-xs text-md-textMuted">
          Hover nodes and edges for details. Click a node to select it. Arrows: predator &#x2192; prey. Thickness = meta impact.
        </p>
        <FoodChainGraph
          foodChain={analysis.food_chain}
          profiles={analysis.profiles}
          selectedDeck={selectedDeck}
          onDeckSelect={setSelectedDeck}
        />
      </div>

      {/* Section C: Tournament Field + Nash Equilibrium */}
      {(analysis.tournament_field.length > 0 || Object.keys(analysis.nash_equilibrium).length > 0) && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-md-text">Tournament Field &amp; Equilibrium</h3>

          {analysis.tournament_field.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-md-border text-md-textMuted text-xs">
                    <th className="text-left py-2 px-3">Deck</th>
                    <th className="text-center py-2 px-3">Field %</th>
                    <th className="text-center py-2 px-3">Top Cut %</th>
                    <th className="text-center py-2 px-3">Conversion</th>
                    <th className="text-center py-2 px-3">Nash Optimal</th>
                    <th className="text-center py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-border">
                  {analysis.tournament_field.map((entry) => {
                    const nashRate = analysis.nash_equilibrium[entry.deck] ?? 0;
                    const actualRate = entry.field_pct;
                    const dev = nashRate > 0 ? (actualRate - nashRate) / nashRate : 0;
                    const devInfo = nashDeviationLabel(dev);

                    return (
                      <tr
                        key={entry.deck}
                        className={clsx(
                          'hover:bg-md-surfaceHover/40 transition-colors cursor-pointer',
                          selectedDeck === entry.deck && 'bg-md-blue/5'
                        )}
                        onClick={() => setSelectedDeck(entry.deck)}
                      >
                        <td className="py-2 px-3 font-medium">{entry.deck}</td>
                        <td className="py-2 px-3 text-center tabular-nums">{(entry.field_pct * 100).toFixed(1)}%</td>
                        <td className="py-2 px-3 text-center tabular-nums">{(entry.top_cut_pct * 100).toFixed(1)}%</td>
                        <td className="py-2 px-3 text-center">
                          <span className={clsx('tabular-nums font-semibold',
                            entry.conversion_rate >= 1.3 ? 'text-md-green'
                              : entry.conversion_rate >= 0.8 ? 'text-md-textMuted'
                              : 'text-md-red'
                          )}>
                            {entry.conversion_rate.toFixed(2)}x
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center tabular-nums text-md-textMuted">
                          {(nashRate * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={clsx('text-xs font-semibold', devInfo.color)}>
                            {devInfo.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-md-textMuted mt-2">
                Conversion = top cut share / field share. &gt;1.0 = overperforming. Nash Optimal = game-theory equilibrium play rate.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Section D: Meta Health Summary */}
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
              {analysis.meta_health_index >= 0.6 ? 'Healthy \u2014 diverse meta with balanced play rates'
                : analysis.meta_health_index >= 0.4 ? 'Moderate \u2014 some decks dominate play share'
                : 'Concentrated \u2014 meta is dominated by few decks'}
            </p>
          </div>
        </div>

        {analysis.food_chain.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-md-textMuted">Top Counter Relationships</h4>
            {analysis.food_chain.slice(0, 3).map((r, i) => (
              <div key={i} className="text-sm text-md-textSecondary">
                <span className="font-medium text-md-text">{r.predator}</span>
                <span className="text-md-red mx-1">{r.strength === 'hard_counter' ? '\u27EB' : '\u203A'}</span>
                <span className="font-medium text-md-text">{r.prey}</span>
                <span className="text-xs text-md-textMuted ml-2">
                  {(r.win_rate * 100).toFixed(0)}% WR, {(r.meta_impact * 100).toFixed(1)}% impact
                </span>
              </div>
            ))}
          </div>
        )}

        {analysis.cycles.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-md-textMuted">Rock-Paper-Scissors Cycles</h4>
            {analysis.cycles.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="text-md-purple font-medium">
                  {c.decks.join(' \u203A ')} \u203A {c.decks[0]}
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
