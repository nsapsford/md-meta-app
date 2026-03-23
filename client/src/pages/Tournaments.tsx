import { useState, useEffect } from 'react';
import { getTournaments } from '../api/meta';
import type { Tournament } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';

export default function Tournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getTournaments()
      .then(setTournaments)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-md-gold">Tournaments</h2>

      {tournaments.length === 0 ? (
        <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
          No tournament data available yet. Click "Sync Data" to fetch latest data.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t) => (
            <div key={t.id} className="bg-md-surface border border-md-border rounded-lg overflow-hidden card-hover">
              {t.banner_image && (
                <img src={t.banner_image} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="p-4">
                <h3 className="font-semibold text-md-text">{t.name}</h3>
                {t.short_name && <p className="text-sm text-md-textMuted">{t.short_name}</p>}
                {t.next_date && (
                  <p className="text-xs text-md-textMuted mt-2">
                    Date: {new Date(t.next_date).toLocaleDateString()}
                  </p>
                )}
                {t.placements_json && t.placements_json.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-md-textMuted uppercase tracking-wider">Top Placements</p>
                    {t.placements_json.slice(0, 3).map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-md-gold font-semibold w-6">#{i + 1}</span>
                        <span className="truncate">{p.deckType || p.deck || p.name || 'Unknown'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
