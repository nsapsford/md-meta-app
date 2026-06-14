import { Link } from 'react-router-dom';
import TierBadge from '../common/TierBadge';
import { hapticLight } from '../../utils/haptics';
import CardFan from '../common/CardFan';
import { tierHex } from '../../constants/tierColors';

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

interface TopArchetypesGridProps {
  featured: FeaturedDeck[];
  /** While true, render fixed-height skeleton cards to reserve layout space (prevents CLS). */
  loading?: boolean;
}

const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6';

function SkeletonGrid() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="featured-card rounded-2xl overflow-hidden skeleton-pulse"
          style={{ minHeight: '280px' }}
        />
      ))}
    </div>
  );
}

export default function TopArchetypesGrid({ featured, loading = false }: TopArchetypesGridProps) {
  if (loading) return <SkeletonGrid />;
  if (featured.length === 0) return null;

  return (
    <div>
      <div className={GRID_CLASS}>
        {featured.map((deck, idx) => {
          const tierColor = tierHex(deck.tier);
          return (
            <Link
              key={deck.id}
              to={`/decks/${encodeURIComponent(deck.name)}`}
              onClick={hapticLight}
              className="press group relative featured-card rounded-2xl overflow-hidden card-hover transform transition-all duration-300 hover:-translate-y-1"
            >
              {/* Tier-colored top accent line */}
              <div
                className="absolute top-0 inset-x-0 h-1"
                style={{ background: `linear-gradient(90deg, transparent, ${tierColor}80, transparent)` }}
              />

              {/* Ambient glow — fades in on hover */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${tierColor}40 0%, transparent 68%)` }}
              />

              <div className="relative p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-md-surface/80 to-md-surface border border-md-border flex items-center justify-center text-sm font-bold text-md-textSecondary">
                      {idx + 1}
                    </span>
                    <TierBadge tier={deck.tier} size="md" />
                  </div>
                  {typeof deck.power === 'number' && (
                    <span className="text-xs font-mono text-md-textMuted bg-md-surface/60 border border-md-border/50 px-2.5 py-1 rounded-lg">
                      {deck.power.toFixed(1)} PWR
                    </span>
                  )}
                </div>

                {/* Card fan */}
                <CardFan cards={deck.cards} thumbnail={deck.thumbnail_image} tierColor={tierColor} />

                {/* Name + stats */}
                <div className="mt-5 text-center">
                  <p className="font-bold text-md-text group-hover:text-md-gold transition-colors duration-300 truncate text-lg">
                    {deck.name}
                  </p>
                  <div className="flex items-center justify-center gap-4 mt-3 text-sm tabular-nums">
                    {typeof deck.win_rate === 'number' && (
                      <span className="text-md-winRate font-semibold">
                        {deck.win_rate.toFixed(1)}% WR
                      </span>
                    )}
                    {typeof deck.play_rate === 'number' && (
                      <span className="text-md-playRate font-medium">{deck.play_rate.toFixed(1)}% PR</span>
                    )}
                    {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                      <span className={`font-semibold ${deck.power_trend > 0 ? 'text-md-winRate' : 'text-md-red'}`}>
                        {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}