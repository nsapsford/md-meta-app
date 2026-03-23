import { useState, useRef } from 'react';
import type { EnrichedDeckCard } from '../../types/deck';
import CardImage from '../common/CardImage';

interface DecklistViewProps {
  mainDeck: EnrichedDeckCard[];
  extraDeck: EnrichedDeckCard[];
  deckArchetype: string;
}

interface CategorizedDeck {
  archetypeMonsters: EnrichedDeckCard[];
  techMonsters: EnrichedDeckCard[];
  spells: EnrichedDeckCard[];
  traps: EnrichedDeckCard[];
}

function categorizeDeck(cards: EnrichedDeckCard[], deckName: string): CategorizedDeck {
  const deckWords = deckName.toLowerCase().split(/\s+/);
  const result: CategorizedDeck = { archetypeMonsters: [], techMonsters: [], spells: [], traps: [] };

  for (const card of cards) {
    const type = (card.type || '').toLowerCase();
    if (type.includes('spell')) {
      result.spells.push(card);
    } else if (type.includes('trap')) {
      result.traps.push(card);
    } else {
      // Monster — check if it belongs to the deck's archetype
      const cardArchetype = (card.archetype || '').toLowerCase();
      const cardName = card.cardName.toLowerCase();
      const isArchetype = deckWords.some(w =>
        w.length > 2 && (cardArchetype.includes(w) || cardName.includes(w))
      );
      if (isArchetype) {
        result.archetypeMonsters.push(card);
      } else {
        result.techMonsters.push(card);
      }
    }
  }
  return result;
}

const RARITY_BORDERS: Record<string, string> = {
  UR: 'border-l-rarity-ur',
  SR: 'border-l-rarity-sr',
  R: 'border-l-rarity-r',
  N: 'border-l-rarity-n',
};

function DeckCardCell({ card }: { card: EnrichedDeckCard }) {
  const borderClass = RARITY_BORDERS[card.rarity || 'N'] || RARITY_BORDERS.N;
  const [hovered, setHovered] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const largeUrl = card.imageUrl?.replace('/cards_small/', '/cards/') || null;

  const handleMouseEnter = () => {
    setHovered(true);
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const popW = 480;
      const popH = 700;
      let left = rect.right + 8;
      let top = rect.top;
      // Flip left if overflows right
      if (left + popW > viewW) left = rect.left - popW - 8;
      // Clamp to viewport
      if (top + popH > viewH) top = viewH - popH - 8;
      if (top < 8) top = 8;
      setPos({ top, left });
    }
  };

  return (
    <div
      ref={cellRef}
      className={`relative border-l-2 ${borderClass} rounded overflow-hidden`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <CardImage src={card.imageUrl || null} alt={card.cardName} size="md" />
      {card.amount > 1 && (
        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
          x{card.amount}
        </span>
      )}
      <span className="absolute top-0 left-0.5 text-[10px] font-bold px-1 rounded-br bg-black/60 text-white uppercase">
        {card.rarity || 'N'}
      </span>
      {hovered && largeUrl && pos && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg overflow-hidden shadow-2xl border border-md-border bg-md-bg p-1.5"
          style={{ top: pos.top, left: pos.left, width: 480 }}
        >
          <img src={largeUrl} alt={card.cardName} className="w-full rounded" />
          <p className="text-sm text-center text-md-text mt-1.5 font-medium truncate px-2">{card.cardName}</p>
        </div>
      )}
    </div>
  );
}

function CardSection({ label, cards, totalCards }: { label: string; cards: EnrichedDeckCard[]; totalCards?: number }) {
  if (cards.length === 0) return null;
  const total = totalCards ?? cards.reduce((sum, c) => sum + c.amount, 0);
  return (
    <div>
      <h4 className="text-xs font-semibold text-md-textMuted uppercase tracking-wider mb-2">
        {label} <span className="text-md-text">({total})</span>
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {cards.map((card, i) => (
          <DeckCardCell key={`${card.cardName}-${i}`} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function DecklistView({ mainDeck, extraDeck, deckArchetype }: DecklistViewProps) {
  const { archetypeMonsters, techMonsters, spells, traps } = categorizeDeck(mainDeck, deckArchetype);
  const mainTotal = mainDeck.reduce((sum, c) => sum + c.amount, 0);
  const extraTotal = extraDeck.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-md-textMuted">Main Deck ({mainTotal}) / Extra Deck ({extraTotal})</p>

      <CardSection label="Archetype Monsters" cards={archetypeMonsters} />
      <CardSection label="Staples / Tech" cards={techMonsters} />
      <CardSection label="Spells" cards={spells} />
      <CardSection label="Traps" cards={traps} />

      {extraDeck.length > 0 && (
        <>
          <hr className="border-md-border" />
          <CardSection label="Extra Deck" cards={extraDeck} />
        </>
      )}
    </div>
  );
}
