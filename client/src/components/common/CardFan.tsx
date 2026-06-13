interface FanCard {
  name: string;
  image: string | null;
}

interface CardFanProps {
  cards: Array<FanCard>;
  thumbnail?: string | null;
  /** Max number of cards to fan out (default 3). */
  max?: number;
}

/**
 * Overlapping, rotated "fan" of up to `max` card images. Shared between the
 * Dashboard's Top Performing Decks grid and the My Decks list so both pages
 * present saved/featured decks with the same visual language.
 */
export default function CardFan({ cards, thumbnail, max = 3 }: CardFanProps) {
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

  const count = Math.min(cards.length, max);
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
