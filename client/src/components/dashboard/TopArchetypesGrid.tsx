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
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 rounded-full bg-md-gold" />
        <h3 className="text-xs font-semibold text-md-textMuted uppercase tracking-widest">Top Archetypes</h3>
      </div>
      <div className="grid grid-cols-3 gap-5">
        {featured.map((deck, idx) => {
          const tierColor = tierColors[deck.tier ?? 4];
          return (
            <Link
              key={deck.id}
              to={`/decks/${encodeURIComponent(deck.name)}`}
              className="group relative featured-card rounded-xl overflow-hidden card-hover"
            >
              {/* Tier-colored top accent line */}
              <div
                className="absolute top-0 inset-x-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${tierColor}60, transparent)` }}
              />

              {/* Ambient glow — fades in on hover */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${tierColor}18 0%, transparent 68%)` }}
              />

              <div className="relative p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-xs font-bold text-md-textSecondary">
                      {idx + 1}
                    </span>
                    <TierBadge tier={deck.tier} size="sm" />
                  </div>
                  {typeof deck.power === 'number' && (
                    <span className="text-xs font-mono text-md-textMuted bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md">
                      {deck.power.toFixed(1)} PWR
                    </span>
                  )}
                </div>

                {/* Card fan */}
                <CardFanMini cards={deck.cards} thumbnail={deck.thumbnail_image} />

                {/* Name + stats */}
                <div className="mt-4 text-center">
                  <p className="font-semibold text-md-text group-hover:text-md-gold transition-colors duration-300 truncate text-[15px]">
                    {deck.name}
                  </p>
                  <div className="flex items-center justify-center gap-4 mt-2 text-xs tabular-nums">
                    {typeof deck.win_rate === 'number' && (
                      <span className="text-md-winRate font-medium">
                        {deck.win_rate.toFixed(1)}% WR
                      </span>
                    )}
                    {typeof deck.play_rate === 'number' && (
                      <span className="text-md-playRate">{deck.play_rate.toFixed(1)}% PR</span>
                    )}
                    {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                      <span className={`font-medium ${deck.power_trend > 0 ? 'text-md-winRate' : 'text-md-red'}`}>
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
