import { Link } from 'react-router-dom';
import clsx from 'clsx';
import TierBadge from '../common/TierBadge';
import type { TierList, DeckTierEntry } from '../../types/meta';
import { useIsNative } from '../../hooks/useIsNative';
import { hapticLight } from '../../utils/haptics';

interface TierListViewProps {
  tierList: TierList;
}

const TIER_NOTES: Record<string, string> = {
  '1': 'Common, and clearly better than the average player',
  '2': 'Common, and better than average',
  '3': 'Common, but not shown to beat average',
  rogue: 'Seen on the ladder, too rare to rank',
};

export default function TierListView({ tierList }: TierListViewProps) {
  const isNative = useIsNative();
  return (
    <div className="space-y-6">
      {(['0', '1', '2', '3', 'rogue'] as const).map((tierKey) => {
        const decks = tierList[tierKey];
        if (!decks || decks.length === 0) return null;
        const tierNum = tierKey === 'rogue' ? null : parseInt(tierKey);

        return (
          <div key={tierKey} className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 rounded-2xl border border-md-border/40 overflow-hidden shadow-lg shadow-black/5">
            {/* Tier header with enhanced styling */}
            <div className={clsx('border-b border-md-border/30 flex items-center gap-4 bg-md-surface/40', isNative ? 'px-3 py-3' : 'px-6 py-5')}>
              <TierBadge tier={tierNum} size="lg" />
              <span className="text-md-textMuted text-sm font-medium tabular-nums">
                {decks.length} deck{decks.length !== 1 ? 's' : ''}
              </span>
              {TIER_NOTES[tierKey] && (
                <span className="ml-auto text-xs text-md-textMuted text-right">{TIER_NOTES[tierKey]}</span>
              )}
            </div>

            {/* Deck rows with enhanced styling */}
            <div className="divide-y divide-md-border/20">
              {decks.map((deck: DeckTierEntry) => (
                <Link
                  key={deck.id}
                  to={`/decks/${encodeURIComponent(deck.name)}`}
                  onClick={hapticLight}
                  className={clsx(
                    'press hover:bg-md-surfaceHover/30 transition-all duration-200 group',
                    isNative
                      ? 'flex flex-col gap-2 px-3 py-3'
                      : 'flex flex-col gap-2 px-3 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4 sm:px-6 sm:py-4'
                  )}
                >
                  {/* Card images — overlapping thumbnails */}
                  <div className={clsx('flex items-center overflow-hidden', isNative ? 'w-full' : 'w-full sm:w-auto sm:min-w-[8rem]')}>
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
                              loading="lazy"
                              decoding="async"
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
                          loading="lazy"
                          decoding="async"
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
                  <div className={clsx('flex items-center flex-shrink-0', isNative ? 'gap-3 justify-between w-full' : 'gap-3 justify-between w-full sm:gap-5 sm:justify-start sm:w-auto')}>
                    <div className={clsx('text-sm tabular-nums', isNative ? 'flex flex-row items-center gap-3' : 'flex flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-1')}>
                      {typeof deck.edge === 'number' && (
                        <span
                          className={`font-bold ${(deck.edge_floor ?? 0) > 0 ? 'text-md-winRate' : deck.edge < 0 ? 'text-md-red' : 'text-md-text'}`}
                          title={`Win rate vs the average player in these ranks. At least ${(deck.edge_floor ?? 0) >= 0 ? '+' : ''}${(deck.edge_floor ?? 0).toFixed(1)} with 95% confidence.`}
                        >
                          {deck.edge > 0 ? '+' : ''}{deck.edge.toFixed(1)}<span className="text-md-textMuted font-normal ml-1 text-xs">vs avg</span>
                        </span>
                      )}
                      {typeof deck.play_rate === 'number' && (
                        <span className="text-md-playRate font-medium">
                          {deck.play_rate.toFixed(1)}%<span className="text-md-textMuted ml-1 text-xs">of games</span>
                        </span>
                      )}
                      {typeof deck.win_rate === 'number' && (
                        <span className="text-md-textMuted text-xs">
                          {deck.win_rate.toFixed(1)}% win{typeof deck.games === 'number' ? ` · ${deck.games.toLocaleString()} games` : ''}
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

      {(tierList.tournament_only?.length ?? 0) > 0 && (
        <div className="bg-md-surface/50 rounded-2xl border border-md-border/40 px-4 py-4 sm:px-6">
          <p className="text-sm font-semibold text-md-text">Tournament results, no ladder data</p>
          <p className="text-xs text-md-textMuted mt-1">
            These place in tournaments but Untapped's tracker has no games for them, so nothing here says how they do on the ladder.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {tierList.tournament_only!.map((deck) => (
              <Link
                key={deck.id}
                to={`/decks/${encodeURIComponent(deck.name)}`}
                onClick={hapticLight}
                className="px-3 py-1.5 rounded-lg border border-md-border/40 bg-md-surface text-xs text-md-text hover:border-md-blue/50 transition-colors"
              >
                {deck.name}
                {typeof deck.power === 'number' && <span className="text-md-textMuted ml-1.5 tabular-nums">{deck.power.toFixed(1)} power</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}