import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDeckProfile } from '../api/meta';
import type { DeckProfile as DeckProfileType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import TierBadge from '../components/common/TierBadge';
import CardImage from '../components/common/CardImage';
import DecklistView from '../components/decks/DecklistView';

function HeaderCardFan({ deck }: { deck: DeckProfileType }) {
  // Get top 3 archetype cards from the first top decklist
  const deckNameLower = deck.name.toLowerCase();
  const deckWords = deckNameLower.split(/\s+/).filter(w => w.length > 2);
  const firstDeck = deck.topDecks?.[0];
  const allCards = [...(firstDeck?.main_deck_json || []), ...(firstDeck?.extra_deck_json || [])];
  const archetypeCards = allCards.filter(c => {
    const arch = (c.archetype || '').toLowerCase();
    const name = c.cardName.toLowerCase();
    return deckWords.some(w => arch.includes(w) || name.includes(w));
  }).filter(c => c.imageUrl).slice(0, 3);

  if (archetypeCards.length === 0) return null;

  const count = archetypeCards.length;
  const totalSpread = 30;
  const angles = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -totalSpread / 2 + (i * totalSpread) / (count - 1)
  );
  const xOffsets = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -14 * (count - 1) / 2 + i * 14
  );

  return (
    <div className="relative flex items-end justify-center shrink-0" style={{ height: '120px', width: '120px' }}>
      {archetypeCards.map((card, i) => (
        <div
          key={card.cardName}
          className="absolute bottom-0"
          style={{
            transform: `translateX(${xOffsets[i]}px) rotate(${angles[i]}deg)`,
            transformOrigin: 'bottom center',
            zIndex: i,
          }}
        >
          <img
            src={card.imageUrl!}
            alt={card.cardName}
            className="rounded shadow-lg border border-md-border/50"
            style={{ width: '64px', height: '94px', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ))}
    </div>
  );
}

export default function DeckProfile() {
  const { name } = useParams<{ name: string }>();
  const [deck, setDeck] = useState<DeckProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    getDeckProfile(decodeURIComponent(name))
      .then((d) => {
        setDeck(d);
        if (d.topDecks?.[0]?.id) setExpandedDeck(d.topDecks[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} />;
  if (!deck) return null;

  const breakdown = deck.breakdown_json;
  const mainCards = Array.isArray(breakdown?.main) ? breakdown.main : [];
  const extraCards = Array.isArray(breakdown?.extra) ? breakdown.extra : [];

  return (
    <div className="space-y-6">
      <Link to="/" className="text-md-blue text-sm hover:underline">&larr; Back to Dashboard</Link>

      {/* Header */}
      <div className="bg-md-surface border border-md-border rounded-lg p-6">
        <div className="flex items-start gap-6">
          <HeaderCardFan deck={deck} />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold">{deck.name}</h2>
              <TierBadge tier={deck.tier} size="lg" />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-md-textMuted">
              {deck.power != null && <span>Power: <span className="text-md-gold font-semibold">{deck.power.toFixed(1)}</span></span>}
              {deck.power_trend != null && (
                <span>
                  Trend: <span className={deck.power_trend > 0 ? 'text-md-green' : 'text-md-red'}>
                    {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                  </span>
                </span>
              )}
              {deck.avg_ur_price != null && <span>UR: {Math.round(deck.avg_ur_price)}</span>}
              {deck.avg_sr_price != null && <span>SR: {Math.round(deck.avg_sr_price)}</span>}
            </div>
            {/* untapped.gg stats */}
            {(deck.win_rate != null || deck.play_rate != null) && (
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                <span className="text-xs text-md-textMuted font-medium uppercase tracking-wider">untapped.gg</span>
                {deck.win_rate != null && (
                  <span className={`font-semibold ${deck.win_rate >= 55 ? 'text-md-green' : deck.win_rate <= 45 ? 'text-md-red' : 'text-md-text'}`}>
                    Win Rate: {deck.win_rate.toFixed(1)}%
                  </span>
                )}
                {deck.play_rate != null && (
                  <span className="text-md-blue font-semibold">Play Rate: {deck.play_rate.toFixed(1)}%</span>
                )}
                {deck.sample_size != null && (
                  <span className="text-md-textMuted">{deck.sample_size.toLocaleString()} games</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty State — no breakdown and no top decklists */}
      {mainCards.length === 0 && extraCards.length === 0 && (!deck.topDecks || deck.topDecks.length === 0) && (
        <div className="bg-md-surface border border-md-border rounded-lg p-10 text-center">
          <svg className="w-12 h-12 mx-auto text-md-textMuted/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
            <path d="M8 12h8M12 8v8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h3 className="text-lg font-semibold text-md-textSecondary mb-1">No Decklist Available</h3>
          <p className="text-sm text-md-textMuted max-w-md mx-auto">
            No decklist data is currently available for <span className="text-md-text font-medium">{deck.name}</span>. This archetype may be newly tracked or awaiting tournament results.
          </p>
        </div>
      )}

      {/* Deck Breakdown */}
      {mainCards.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Main Deck Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {mainCards.sort((a, b) => (b.percentage || b.usage || 0) - (a.percentage || a.usage || 0)).map((card, i) => {
              const usage = card.percentage || card.usage || 0;
              const cardName = card.cardName || card.name || '';
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-md-bg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cardName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-md-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-md-blue rounded-full"
                          style={{ width: `${Math.min(usage, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-md-textMuted w-10 text-right">{usage}%</span>
                    </div>
                  </div>
                  {card.amount && <span className="text-xs text-md-textMuted">x{card.amount}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {extraCards.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Extra Deck Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {extraCards.sort((a, b) => (b.percentage || b.usage || 0) - (a.percentage || a.usage || 0)).map((card, i) => {
              const usage = card.percentage || card.usage || 0;
              const cardName = card.cardName || card.name || '';
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-md-bg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cardName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-md-border rounded-full overflow-hidden">
                        <div className="h-full bg-md-purple rounded-full" style={{ width: `${Math.min(usage, 100)}%` }} />
                      </div>
                      <span className="text-xs text-md-textMuted w-10 text-right">{usage}%</span>
                    </div>
                  </div>
                  {card.amount && <span className="text-xs text-md-textMuted">x{card.amount}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Decklists */}
      {deck.topDecks && deck.topDecks.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Top Decklists ({deck.topDecks.length})</h3>
          <div className="space-y-3">
            {deck.topDecks.slice(0, 5).map((td, idx) => {
              const isExpanded = expandedDeck === td.id;
              return (
                <div key={td.id} className="bg-md-bg rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedDeck(isExpanded ? null : td.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-md-surface/50 transition-colors text-left"
                  >
                    <div>
                      {td.author && <p className="text-sm font-medium">{td.author}</p>}
                      <div className="flex items-center gap-3 text-xs text-md-textMuted">
                        {td.tournament_name && <span>{td.tournament_name}</span>}
                        {td.tournament_placement && <span>#{td.tournament_placement}</span>}
                        {td.ranked_type && <span>{td.ranked_type}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 text-xs text-md-textMuted">
                        {td.ur_price != null && <span className="text-rarity-ur">{td.ur_price} UR</span>}
                        {td.sr_price != null && <span className="text-rarity-sr">{td.sr_price} SR</span>}
                      </div>
                      <span className={`text-md-textMuted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9660;</span>
                    </div>
                  </button>
                  {isExpanded && td.main_deck_json && (
                    <div className="px-4 pb-4">
                      <DecklistView
                        mainDeck={td.main_deck_json}
                        extraDeck={td.extra_deck_json || []}
                        deckArchetype={deck.name}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
