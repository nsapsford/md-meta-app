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
                  {/* Thumbnail */}
                  <div className="w-9 h-9 flex-shrink-0">
                    {deck.thumbnail_image ? (
                      <img
                        src={deck.thumbnail_image}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover ring-1 ring-white/[0.07]"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.07]" />
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
