import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTierList, getFeaturedDecks } from '../api/meta';
import type { TierList, DeckTierEntry } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import TierBadge from '../components/common/TierBadge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const tierColors = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#8892a8'];

interface FeaturedDeck {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  cards: Array<{ name: string; image: string | null }>;
}

// Fan of overlapping cards for a deck archetype
function CardFan({ cards }: { cards: Array<{ name: string; image: string | null }> }) {
  if (!cards || cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-md-textMuted text-xs">
        No card data yet
      </div>
    );
  }

  const count = Math.min(cards.length, 3);
  // Spread angles: evenly distributed across -30 to +30 degrees
  const totalSpread = 48;
  const angles = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -totalSpread / 2 + (i * totalSpread) / (count - 1)
  );
  // Horizontal offsets: fan out from center
  const xOffsets = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -18 * (count - 1) / 2 + i * 18
  );

  return (
    <div className="relative flex items-end justify-center" style={{ height: '112px', width: '100%' }}>
      {cards.slice(0, count).map((card, i) => (
        <div
          key={card.name}
          className="absolute bottom-0"
          style={{
            transform: `translateX(${xOffsets[i]}px) rotate(${angles[i]}deg)`,
            transformOrigin: 'bottom center',
            zIndex: i,
            transition: 'transform 0.2s ease',
          }}
          title={card.name}
        >
          {card.image ? (
            <img
              src={card.image}
              alt={card.name}
              className="rounded shadow-lg border border-md-border/50"
              style={{ width: '56px', height: '82px', objectFit: 'cover' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              className="rounded border border-md-border bg-md-surface flex items-center justify-center"
              style={{ width: '56px', height: '82px' }}
            >
              <span className="text-md-gold text-lg font-bold">?</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [featured, setFeatured] = useState<FeaturedDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, feat] = await Promise.all([getTierList(), getFeaturedDecks()]);
      setTierList(data);
      setFeatured(feat);
    } catch (e: any) {
      setError(e.message || 'Failed to load tier list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!tierList) return null;

  const allDecks = [
    ...tierList['0'].map(d => ({ ...d, tierKey: 0 })),
    ...tierList['1'].map(d => ({ ...d, tierKey: 1 })),
    ...tierList['2'].map(d => ({ ...d, tierKey: 2 })),
    ...tierList['3'].map(d => ({ ...d, tierKey: 3 })),
    ...tierList.rogue.map(d => ({ ...d, tierKey: 4 })),
  ];

  const popularityData = allDecks
    .filter(d => d.power != null)
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .slice(0, 15)
    .map(d => ({ name: d.name, power: d.power, tier: d.tierKey }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-md-gold mb-1">Meta Dashboard</h2>
        <p className="text-md-textMuted text-sm">Current Yu-Gi-Oh! Master Duel tier list and meta overview</p>
      </div>

      {/* Top 3 Archetypes — card fan display */}
      {featured.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-md-textMuted uppercase tracking-wider mb-3">Top Archetypes</h3>
          <div className="grid grid-cols-3 gap-4">
            {featured.map((deck, idx) => (
              <Link
                key={deck.id}
                to={`/decks/${encodeURIComponent(deck.name)}`}
                className="bg-md-surface border border-md-border rounded-lg p-4 hover:border-md-gold/40 hover:bg-md-surfaceHover transition-all group"
              >
                {/* Rank badge */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-md-gold opacity-60">#{idx + 1}</span>
                    <TierBadge tier={deck.tier} size="sm" />
                  </div>
                  {typeof deck.power === 'number' && (
                    <span className="text-xs text-md-textMuted">Power {deck.power.toFixed(1)}</span>
                  )}
                </div>

                {/* Card fan */}
                <CardFan cards={deck.cards} />

                {/* Deck name */}
                <div className="mt-3 text-center">
                  <p className="font-semibold text-md-text group-hover:text-md-gold transition-colors truncate">
                    {deck.name}
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-1 text-xs text-md-textMuted">
                    {typeof deck.win_rate === 'number' && (
                      <span className={deck.win_rate >= 55 ? 'text-md-green' : deck.win_rate <= 45 ? 'text-md-red' : ''}>
                        WR {deck.win_rate.toFixed(1)}%
                      </span>
                    )}
                    {typeof deck.play_rate === 'number' && (
                      <span>PR {deck.play_rate.toFixed(1)}%</span>
                    )}
                    {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                      <span className={deck.power_trend > 0 ? 'text-md-green' : 'text-md-red'}>
                        {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tier 0', count: tierList['0'].length, color: 'text-tier-0' },
          { label: 'Tier 1', count: tierList['1'].length, color: 'text-tier-1' },
          { label: 'Tier 2', count: tierList['2'].length, color: 'text-tier-2' },
          { label: 'Total Tracked', count: allDecks.length, color: 'text-md-gold' },
        ].map((s) => (
          <div key={s.label} className="bg-md-surface border border-md-border rounded-lg p-4">
            <p className="text-md-textMuted text-xs uppercase tracking-wider">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* Data sources */}
      <div className="flex items-center gap-3 text-xs text-md-textMuted">
        <span className="font-medium text-md-text">Data sources:</span>
        <span className="px-2 py-0.5 rounded bg-md-surface border border-md-border">MasterDuelMeta</span>
        <span className="px-2 py-0.5 rounded bg-md-surface border border-md-border">YGOProDeck</span>
        {allDecks.some(d => d.win_rate != null) && (
          <span className="px-2 py-0.5 rounded bg-md-surface border border-green-700 text-green-400">untapped.gg ✓</span>
        )}
        {!allDecks.some(d => d.win_rate != null) && (
          <span className="px-2 py-0.5 rounded bg-md-surface border border-md-border opacity-50">untapped.gg (sync needed)</span>
        )}
      </div>

      {/* Tier List */}
      <div className="space-y-4">
        {(['0', '1', '2', '3', 'rogue'] as const).map((tierKey) => {
          const decks = tierList[tierKey];
          if (!decks || decks.length === 0) return null;
          const tierNum = tierKey === 'rogue' ? null : parseInt(tierKey);

          return (
            <div key={tierKey} className="bg-md-surface border border-md-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-md-border flex items-center gap-3">
                <TierBadge tier={tierNum} size="md" />
                <span className="text-md-textMuted text-sm">{decks.length} deck{decks.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-md-border">
                {decks.map((deck: DeckTierEntry) => (
                  <Link
                    key={deck.id}
                    to={`/decks/${encodeURIComponent(deck.name)}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-md-surfaceHover transition-colors"
                  >
                    {deck.thumbnail_image && (
                      <img
                        src={deck.thumbnail_image}
                        alt=""
                        className="w-10 h-10 rounded object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-md-text truncate">{deck.name}</p>
                      <div className="flex items-center gap-4 text-xs text-md-textMuted mt-0.5">
                        {typeof deck.power === 'number' && <span>Power: {deck.power.toFixed(1)}</span>}
                        {typeof deck.pop_rank === 'number' && <span>Pop: #{deck.pop_rank}</span>}
                        {typeof deck.win_rate === 'number' && (
                          <span className={deck.win_rate >= 55 ? 'text-md-green' : deck.win_rate <= 45 ? 'text-md-red' : 'text-md-textMuted'}>
                            WR: {deck.win_rate.toFixed(1)}%
                          </span>
                        )}
                        {typeof deck.play_rate === 'number' && (
                          <span>PR: {deck.play_rate.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                    {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                      <span className={deck.power_trend > 0 ? 'text-md-green text-sm' : 'text-md-red text-sm'}>
                        {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Power Chart */}
      {popularityData.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Top Decks by Power</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={popularityData} layout="vertical" margin={{ left: 120 }}>
              <XAxis type="number" stroke="#8892a8" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="#8892a8" fontSize={11} width={110} />
              <Tooltip
                contentStyle={{ backgroundColor: '#131829', border: '1px solid #2a3050', borderRadius: 8 }}
                labelStyle={{ color: '#e8eaf0' }}
              />
              <Bar dataKey="power" radius={[0, 4, 4, 0]}>
                {popularityData.map((entry, i) => (
                  <Cell key={i} fill={tierColors[entry.tier] || tierColors[4]} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
