import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMetaMovers, type MoverEntry, type MoversResult } from '../../api/meta';
import clsx from 'clsx';

function MoverRow({ deck, rank }: { deck: MoverEntry; rank: number }) {
  const rising = deck.power_delta > 0;
  const deltaStr = `${rising ? '+' : ''}${deck.power_delta.toFixed(1)}`;
  const deltaColor = rising ? 'text-md-green' : 'text-md-red';
  const arrow = rising ? '▲' : '▼';

  return (
    <Link
      to={`/decks/${encodeURIComponent(deck.deck_type_name)}`}
      className="flex items-center gap-3 py-2 group hover:opacity-80 transition-opacity"
    >
      <span className="text-xs text-md-textMuted tabular-nums w-4 shrink-0">{rank}</span>

      <div className="w-10 h-7 rounded overflow-hidden border border-md-border/30 bg-md-surface shrink-0 relative">
        {deck.thumbnail_image ? (
          <img
            src={deck.thumbnail_image}
            alt={deck.deck_type_name}
            className="absolute inset-0 w-full h-full object-cover object-top"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-md-textMuted/30 text-xs">?</div>
        )}
      </div>

      <span className="text-sm font-medium truncate flex-1 group-hover:text-md-blue transition-colors">
        {deck.deck_type_name}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <span className={clsx('text-xs font-bold', deltaColor)}>{arrow}</span>
        <span className={clsx('text-sm font-bold tabular-nums', deltaColor)}>{deltaStr}</span>
      </div>
    </Link>
  );
}

export default function MoversWidget() {
  const [data, setData] = useState<MoversResult | null>(null);
  const [windowDays, setWindowDays] = useState<7 | 14>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMetaMovers(windowDays)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [windowDays]);

  // Only render if we have meaningful data
  if (!loading && (!data || ((data.risers?.length ?? 0) === 0 && (data.fallers?.length ?? 0) === 0))) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/40 rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-orange to-md-red"></div>
          <h3 className="text-lg font-bold text-md-text">What's Moving</h3>
          {data?.post_banlist && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-md-gold/15 text-md-gold border border-md-gold/25">
              Post F&L
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {([7, 14] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindowDays(w)}
              className={clsx('px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors', {
                'bg-md-blue/15 text-md-blue border-md-blue/30': windowDays === w,
                'text-md-textMuted border-md-border hover:border-md-borderLight': windowDays !== w,
              })}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-md-blue/30 border-t-md-blue rounded-full animate-spin"></div>
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <p className="text-xs font-bold text-md-green uppercase tracking-wider mb-1">Risers</p>
            <div className="divide-y divide-md-border/30">
              {data.risers.slice(0, 3).map((d, i) => (
                <MoverRow key={d.deck_type_name} deck={d} rank={i + 1} />
              ))}
              {data.risers.length === 0 && (
                <p className="text-xs text-md-textMuted py-2">Not enough history yet.</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-md-red uppercase tracking-wider mb-1">Fallers</p>
            <div className="divide-y divide-md-border/30">
              {data.fallers.slice(0, 3).map((d, i) => (
                <MoverRow key={d.deck_type_name} deck={d} rank={i + 1} />
              ))}
              {data.fallers.length === 0 && (
                <p className="text-xs text-md-textMuted py-2">Not enough history yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-md-textMuted mt-3">Power delta over last {windowDays} days.</p>
    </div>
  );
}
