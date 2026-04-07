import { useState, useEffect } from 'react';
import { getBanList } from '../api/meta';
import type { BanListData, BanCard } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';

const RARITY_BORDER: Record<string, string> = {
  UR: 'border-b-2 border-rarity-ur',
  SR: 'border-b-2 border-rarity-sr',
  R: 'border-b-2 border-rarity-r',
  N: 'border-b-2 border-md-textMuted/40',
};

const RARITY_LABEL: Record<string, string> = {
  UR: 'text-rarity-ur',
  SR: 'text-rarity-sr',
  R: 'text-rarity-r',
  N: 'text-md-textMuted',
};

function BanCardCell({ card }: { card: BanCard }) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rarityBorder = card.rarity ? (RARITY_BORDER[card.rarity] ?? '') : '';
  const hasNegate = card.negate_effectiveness != null && card.negate_effectiveness > 0;

  return (
    <div
      className={`group cursor-default relative ${rarityBorder}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative w-full aspect-[7/10] rounded-md overflow-hidden bg-md-surfaceAlt shadow-card">
        {card.image_small_url && !imgError ? (
          <img
            src={card.image_small_url}
            alt={card.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-1">
            <span className="text-md-textMuted text-[9px] text-center leading-tight">{card.name.slice(0, 20)}</span>
          </div>
        )}
        {card.rarity && (
          <span className={`absolute top-0.5 right-0.5 text-[8px] font-bold px-1 rounded ${RARITY_LABEL[card.rarity] ?? 'text-md-textMuted'} bg-black/60`}>
            {card.rarity}
          </span>
        )}
        {hasNegate && (
          <span className={`absolute bottom-0.5 left-0.5 text-[8px] font-bold px-1 rounded bg-black/70 ${card.negate_effectiveness! > 8 ? 'text-md-red' : card.negate_effectiveness! > 4 ? 'text-md-orange' : 'text-yellow-400'}`}>
            +{card.negate_effectiveness!.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[10px] mt-1 truncate text-md-textSecondary leading-tight" title={card.name}>{card.name}</p>
      {hovered && hasNegate && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-md-surface border border-md-border rounded-lg p-2 shadow-lg whitespace-nowrap pointer-events-none">
          <p className={`text-xs font-semibold ${card.negate_effectiveness! > 8 ? 'text-md-red' : card.negate_effectiveness! > 4 ? 'text-md-orange' : 'text-yellow-400'}`}>
            Negate Impact: +{card.negate_effectiveness!.toFixed(1)}%
          </p>
          {card.not_negated_win_rate != null && card.negated_win_rate != null && (
            <p className="text-[10px] text-md-textMuted mt-0.5">
              WR: <span className="text-md-green">{card.not_negated_win_rate.toFixed(1)}%</span> / Negated: <span className="text-md-red">{card.negated_win_rate.toFixed(1)}%</span>
            </p>
          )}
          {card.negate_sample_size != null && card.negate_sample_size > 0 && (
            <p className="text-[9px] text-md-textMuted mt-0.5">{card.negate_sample_size.toLocaleString()} games</p>
          )}
        </div>
      )}
    </div>
  );
}

function BanSection({
  title,
  subtitle,
  cards,
  accentColor,
}: {
  title: string;
  subtitle: string;
  cards: BanCard[];
  accentColor: string;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="bg-md-surface rounded-xl border border-md-border overflow-hidden">
      <div className="px-5 py-3.5 border-b border-md-border/60 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <h3 className="font-semibold text-sm">{title}</h3>
        <span className="text-md-textMuted text-xs">{subtitle}</span>
        <span className="text-md-textMuted text-xs ml-auto font-mono">{cards.length}</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2.5 p-4">
        {cards.map((card) => (
          <BanCardCell key={card.name} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function BanList() {
  const [data, setData] = useState<BanListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    getBanList()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          <span className="text-shimmer">Ban List</span>
        </h2>
        <div className="flex items-center gap-4 text-xs text-md-textMuted mt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-md-red" />
            {data.forbidden.length} Forbidden
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-md-orange" />
            {data.limited.length} Limited 1
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            {data.semiLimited.length} Limited 2
          </span>
          <span className="text-md-textMuted/50 ml-1">Source: MasterDuelMeta</span>
        </div>
      </div>

      <BanSection title="Forbidden" subtitle="0 copies allowed" cards={data.forbidden} accentColor="#ff4d5e" />
      <BanSection title="Limited 1" subtitle="1 copy max" cards={data.limited} accentColor="#ff9147" />
      <BanSection title="Limited 2" subtitle="2 copies max" cards={data.semiLimited} accentColor="#facc15" />
    </div>
  );
}
