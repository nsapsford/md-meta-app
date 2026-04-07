import { Link } from 'react-router-dom';
import TierBadge from '../common/TierBadge';

const tierColors = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#6b7694'];

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

function CardFanMini({ cards, thumbnail }: { cards: Array<{ name: string; image: string | null }>; thumbnail?: string | null }) {
  // Fallback: if no card data but we have a thumbnail, show it as a single centered card
  if ((!cards || cards.length === 0) && thumbnail) {
    return (
      <div className="relative flex items-end justify-center" style={{ height: '130px', width: '100%' }}>
        <div className="absolute bottom-0" style={{ transformOrigin: 'bottom center', zIndex: 0 }}>
          <img
            src={thumbnail}
            alt="Deck thumbnail"
            className="rounded-md shadow-card border border-white/5"
            style={{ width: '64px', height: '94px', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-md-textMuted text-xs">
        No card data
      </div>
    );
  }

  const count = Math.min(cards.length, 3);
  const totalSpread = 40;
  const angles = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -totalSpread / 2 + (i * totalSpread) / (count - 1)
  );
  const xOffsets = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -20 * (count - 1) / 2 + i * 20
  );

  return (
    <div className="relative flex items-end justify-center" style={{ height: '130px', width: '100%' }}>
      {cards.slice(0, count).map((card, i) => (
        <div
          key={card.name}
          className="absolute bottom-0 transition-transform duration-300 ease-out group-hover:scale-105"
          style={{
            transform: `translateX(${xOffsets[i]}px) rotate(${angles[i]}deg)`,
            transformOrigin: 'bottom center',
            zIndex: i,
          }}
          title={card.name}
        >
          {card.image ? (
            <img
              src={card.image}
              alt={card.name}
              className="rounded-md shadow-card border border-white/5"
              style={{ width: '64px', height: '94px', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="rounded-md border border-white/[0.07] bg-md-surfaceAlt flex items-center justify-center"
              style={{ width: '64px', height: '94px' }}
            >
              <span className="text-md-gold text-lg font-bold">?</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface TopArchetypesGridProps {
  featured: FeaturedDeck[];
}

export default function TopArchetypesGrid({ featured }: TopArchetypesGridProps) {
  if (featured.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {featured.map((deck, idx) => {
          const tierColor = tierColors[deck.tier ?? 4];
          return (
            <Link
              key={deck.id}
              to={`/decks/${encodeURIComponent(deck.name)}`}
              className="group relative featured-card rounded-2xl overflow-hidden card-hover transform transition-all duration-300 hover:-translate-y-1"
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
                <CardFanMini cards={deck.cards} thumbnail={deck.thumbnail_image} />

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