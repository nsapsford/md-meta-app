import { useState, useEffect } from 'react';
import { getBanList } from '../api/meta';
import type { BanListData, BanCard } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';

const RARITY_COLORS: Record<string, string> = {
  UR: 'text-rarity-ur',
  SR: 'text-rarity-sr',
  R: 'text-rarity-r',
  N: 'text-md-textMuted',
};

function BanSection({
  title,
  subtitle,
  cards,
  accentClass,
}: {
  title: string;
  subtitle: string;
  cards: BanCard[];
  accentClass: string;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="bg-md-surface border border-md-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-md-border flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${accentClass}`} />
        <h3 className="font-semibold">{title}</h3>
        <span className="text-md-textMuted text-xs">{subtitle}</span>
        <span className="text-md-textMuted text-sm ml-auto">({cards.length})</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 p-4">
        {cards.map((card) => (
          <div key={card.name} className="text-center group">
            <div className="relative mx-auto" style={{ width: 60, height: 88 }}>
              {card.image_small_url ? (
                <img
                  src={card.image_small_url}
                  alt={card.name}
                  className="rounded shadow w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
                  }}
                />
              ) : null}
              <div
                className={`${card.image_small_url ? 'hidden' : 'flex'} w-full h-full rounded border border-md-border bg-md-surfaceHover items-center justify-center`}
                style={{ width: 60, height: 88 }}
              >
                <span className="text-md-textMuted text-xs text-center px-1 leading-tight">{card.name.slice(0, 12)}</span>
              </div>
            </div>
            <p className="text-xs mt-1 truncate leading-tight" title={card.name}>{card.name}</p>
            {card.rarity && (
              <span className={`text-xs ${RARITY_COLORS[card.rarity] ?? 'text-md-textMuted'}`}>{card.rarity}</span>
            )}
          </div>
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

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-md-gold">Master Duel Ban List</h2>
        <p className="text-md-textMuted text-sm mt-1">
          {data.forbidden.length} Forbidden · {data.limited.length} Limited 1 · {data.semiLimited.length} Limited 2
          <span className="ml-2 opacity-60">· Source: MasterDuelMeta</span>
        </p>
      </div>

      <BanSection
        title="Forbidden"
        subtitle="0 copies allowed"
        cards={data.forbidden}
        accentClass="bg-md-red"
      />
      <BanSection
        title="Limited 1"
        subtitle="Maximum 1 copy"
        cards={data.limited}
        accentClass="bg-md-orange"
      />
      <BanSection
        title="Limited 2"
        subtitle="Maximum 2 copies"
        cards={data.semiLimited}
        accentClass="bg-yellow-400"
      />
    </div>
  );
}
