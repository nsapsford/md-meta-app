import { Link } from 'react-router-dom';
import TierBadge from '../common/TierBadge';
import type { TierList, DeckTierEntry } from '../../types/meta';

interface TierListViewProps {
  tierList: TierList;
}

export default function TierListView({ tierList }: TierListViewProps) {
  return (
    <div className="space-y-5">
      {(['0', '1', '2', '3', 'rogue'] as const).map((tierKey) => {
        const decks = tierList[tierKey];
        if (!decks || decks.length === 0) return null;
        const tierNum = tierKey === 'rogue' ? null : parseInt(tierKey);

        return (
          <div key={tierKey} className="bg-md-surface rounded-xl border border-white/[0.07] overflow-hidden">
            {/* Tier header */}
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center gap-3">
              <TierBadge tier={tierNum} size="md" />
              <span className="text-md-textMuted text-xs font-medium tabular-nums">
                {decks.length} deck{decks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Deck rows */}
            <div className="divide-y divide-white/[0.04]">
              {decks.map((deck: DeckTierEntry) => (
                <Link
                  key={deck.id}
                  to={`/decks/${encodeURIComponent(deck.name)}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3.5 hover:bg-white/[0.025] transition-colors duration-150 group"
                >
                  {/* Card images — overlapping thumbnails */}
                  <div className="flex items-center min-w-[8rem]">
                    {deck.cards && deck.cards.length > 0 ? (
                      deck.cards.map((card, index) => (
                        <div
                          key={index}
                          className={`relative w-24 h-16 rounded-md overflow-hidden border border-white/[0.07] bg-md-surfaceAlt flex-shrink-0 ${index > 0 ? '-ml-12' : ''}`}
                          style={{ zIndex: index }}
                        >
                          {/* Placeholder icon (behind image) */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-5 h-5 text-md-textMuted/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                              <path d="M3 16l5-5 4 4 4-4 5 5" strokeWidth="1.5" strokeLinejoin="round" />
                              <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                            </svg>
                          </div>
                          {/* Image layer */}
                          {card.image && (
                            <img
                              src={card.image}
                              alt={card.name}
                              className="absolute inset-0 w-full h-full object-cover object-top"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                        </div>
                      ))
                    ) : deck.thumbnail_image ? (
                      <div className="relative w-24 h-16 rounded-md overflow-hidden border border-white/[0.07] bg-md-surfaceAlt flex-shrink-0">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-5 h-5 text-md-textMuted/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                            <path d="M3 16l5-5 4 4 4-4 5 5" strokeWidth="1.5" strokeLinejoin="round" />
                            <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                          </svg>
                        </div>
                        <img
                          src={deck.thumbnail_image}
                          alt={deck.name}
                          className="absolute inset-0 w-full h-full object-cover object-top"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-16 rounded-md border border-red-500/40 bg-md-surfaceAlt flex-shrink-0 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                          <path d="M3 16l5-5 4 4 4-4 5 5" strokeWidth="1.5" strokeLinejoin="round" />
                          <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Name + secondary stats */}
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-md-text group-hover:text-md-blue transition-colors duration-150 truncate">
                      {deck.name}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-md-textMuted mt-0.5 tabular-nums">
                      {typeof deck.power === 'number' && (
                        <span className="font-mono">{deck.power.toFixed(1)} pwr</span>
                      )}
                      {typeof deck.pop_rank === 'number' && (
                        <span>#{deck.pop_rank}</span>
                      )}
                    </div>
                  </div>

                  {/* Right: stats + arrow */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      {typeof deck.win_rate === 'number' && (
                        <span className={`font-medium ${deck.win_rate >= 55 ? 'text-md-winRate' : deck.win_rate <= 45 ? 'text-md-red' : 'text-md-textMuted'}`}>
                          {deck.win_rate.toFixed(1)}%<span className="text-md-textMuted font-normal ml-0.5">WR</span>
                        </span>
                      )}
                      {typeof deck.play_rate === 'number' && (
                        <span className="text-md-playRate">
                          {deck.play_rate.toFixed(1)}%<span className="text-md-textMuted ml-0.5">PR</span>
                        </span>
                      )}
                      {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                        <span className={`font-medium ${deck.power_trend > 0 ? 'text-md-winRate' : 'text-md-red'}`}>
                          {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <svg
                      className="w-4 h-4 text-md-textMuted/40 group-hover:text-md-textMuted group-hover:translate-x-0.5 transition-all duration-150 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
