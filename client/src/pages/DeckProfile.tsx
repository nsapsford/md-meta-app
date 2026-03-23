import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDeckProfile } from '../api/meta';
import type { DeckProfile as DeckProfileType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import TierBadge from '../components/common/TierBadge';
import CardImage from '../components/common/CardImage';

export default function DeckProfile() {
  const { name } = useParams<{ name: string }>();
  const [deck, setDeck] = useState<DeckProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    getDeckProfile(decodeURIComponent(name))
      .then(setDeck)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} />;
  if (!deck) return null;

  const breakdown = deck.breakdown_json;
  const mainCards = breakdown?.main || [];
  const extraCards = breakdown?.extra || [];

  return (
    <div className="space-y-6">
      <Link to="/" className="text-md-blue text-sm hover:underline">&larr; Back to Dashboard</Link>

      {/* Header */}
      <div className="bg-md-surface border border-md-border rounded-lg p-6">
        <div className="flex items-start gap-4">
          {deck.thumbnail_image && (
            <img src={deck.thumbnail_image} alt="" className="w-20 h-20 rounded-lg object-cover" />
          )}
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
            {deck.overview && <p className="mt-3 text-sm text-md-textMuted leading-relaxed">{deck.overview}</p>}
          </div>
        </div>
      </div>

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

      {/* Sample Decklists */}
      {deck.topDecks && deck.topDecks.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Top Decklists ({deck.topDecks.length})</h3>
          <div className="space-y-4">
            {deck.topDecks.slice(0, 5).map((td) => (
              <div key={td.id} className="bg-md-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    {td.author && <p className="text-sm font-medium">{td.author}</p>}
                    <div className="flex items-center gap-3 text-xs text-md-textMuted">
                      {td.tournament_name && <span>{td.tournament_name}</span>}
                      {td.tournament_placement && <span>#{td.tournament_placement}</span>}
                      {td.ranked_type && <span>{td.ranked_type}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-md-textMuted">
                    {td.ur_price != null && <span className="text-rarity-ur">{td.ur_price} UR</span>}
                    {td.sr_price != null && <span className="text-rarity-sr">{td.sr_price} SR</span>}
                  </div>
                </div>
                {td.main_deck_json && (
                  <div className="flex flex-wrap gap-1">
                    {td.main_deck_json.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 bg-md-surface rounded text-xs">
                        {c.cardName} x{c.amount}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
