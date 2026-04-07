import { Link } from 'react-router-dom';
import TierBadge from '../common/TierBadge';
import type { TierList, DeckTierEntry } from '../../types/meta';

interface TierListViewProps {
  tierList: TierList;
}

export default function TierListView({ tierList }: TierListViewProps) {
  return (
    <div className="space-y-6">
      {(['0', '1', '2', '3', 'rogue'] as const).map((tierKey) => {
        const decks = tierList[tierKey];
        if (!decks || decks.length === 0) return null;
        const tierNum = tierKey === 'rogue' ? null : parseInt(tierKey);

        return (
          <div key={tierKey} className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 rounded-2xl border border-md-border/40 overflow-hidden backdrop-blur-sm shadow-lg shadow-black/5">
            {/* Tier header with enhanced styling */}
            <div className="px-6 py-5 border-b border-md-border/30 flex items-center gap-4 bg-md-surface/40">
              <TierBadge tier={tierNum} size="lg" />
              <span className="text-md-textMuted text-sm font-medium tabular-nums">
                {decks.length} deck{decks.length !== 1 ? 's' : ''}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-md-blue animate-pulse"></div>
                <span className="text-xs text-md-textMuted uppercase tracking-wider">Active Meta</span>
              </div>
            </div>

            {/* Deck rows with enhanced styling */}
            <div className="divide-y divide-md-border/20">
              {decks.map((deck: DeckTierEntry) => (
                <Link
                  key={deck.id}
                  to={`/decks/${encodeURIComponent(deck.name)}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-4 hover:bg-md-surfaceHover/30 transition-all duration-200 group"
                >
                  {/* Card images — overlapping thumbnails */}
                  <div className="flex items-center min-w-[8rem]">
                    {deck.cards && deck.cards.length > 0 ? (
                      deck.cards.map((card, index) => (
                        <div
                          key={index}
                          className={`relative w-24 h-16 rounded-lg overflow-hidden border border-md-border/40 bg-gradient-to-br from-md-surface to-md-bg flex-shrink-0 shadow-card ${index > 0 ? '-ml-10' : ''}`}
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
                      <div className="relative w-24 h-16 rounded-lg overflow-hidden border border-md-border/40 bg-gradient-to-br from-md-surface to-md-bg flex-shrink-0">
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
                      <div className="w-24 h-16 rounded-lg border border-red-500/40 bg-gradient-to-br from-md-surface to-md-bg flex-shrink-0 flex items-center justify-center">
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
                    <p className="font-bold text-md-text group-hover:text-md-blue transition-all duration-200 truncate text-lg">
                      {deck.name}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-md-textMuted mt-1.5 tabular-nums">
                      {typeof deck.power === 'number' && (
                        <span className="font-mono bg-md-surface/50 px-2 py-1 rounded-md border border-md-border/30">
                          {deck.power.toFixed(1)} power
                        </span>
                      )}
                      {typeof deck.pop_rank === 'number' && (
                        <span className="bg-md-surface/50 px-2 py-1 rounded-md border border-md-border/30">
                          #{deck.pop_rank} popularity
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: stats + arrow */}
                  <div className="flex items-center gap-5 flex-shrink-0">
                    <div className="flex flex-col items-end gap-1 text-sm tabular-nums">
                      {typeof deck.win_rate === 'number' && (
                        <span className={`font-bold ${deck.win_rate >= 55 ? 'text-md-winRate' : deck.win_rate <= 45 ? 'text-md-red' : 'text-md-text'}`}>
                          {deck.win_rate.toFixed(1)}%<span className="text-md-textMuted font-normal ml-1 text-xs">win</span>
                        </span>
                      )}
                      {typeof deck.play_rate === 'number' && (
                        <span className="text-md-playRate font-medium">
                          {deck.play_rate.toFixed(1)}%<span className="text-md-textMuted ml-1 text-xs">play</span>
                        </span>
                      )}
                      {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                        <span className={`font-semibold text-xs ${deck.power_trend > 0 ? 'text-md-winRate' : 'text-md-red'}`}>
                          trend: {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <svg
                      className="w-5 h-5 text-md-textMuted/40 group-hover:text-md-textMuted group-hover:translate-x-1 transition-all duration-200 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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