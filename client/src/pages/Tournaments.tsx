import { useState, useEffect } from 'react';
import { getTournaments, getRecentTournamentResults } from '../api/meta';
import type { Tournament, TournamentResult } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';

const MDM_DOMAIN = 'https://www.masterduelmeta.com';

function resolveBannerUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${MDM_DOMAIN}${url}` : url;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
}

export default function Tournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getTournaments(), getRecentTournamentResults()])
      .then(([t, r]) => { setTournaments(t); setResults(r); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-md-gold mb-4">Tournament Types</h2>
        {tournaments.length === 0 ? (
          <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
            No tournament data available yet. Click "Sync Data" to fetch latest data.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => {
              const bannerUrl = resolveBannerUrl(t.banner_image);
              return (
                <div key={t.id} className="bg-md-surface border border-md-border rounded-lg overflow-hidden card-hover">
                  {bannerUrl && (
                    <img src={bannerUrl} alt={t.name} className="w-full h-32 object-cover" />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-md-text">{t.name}</h3>
                    {t.short_name && <p className="text-sm text-md-textMuted">{t.short_name}</p>}
                    {t.next_date && (
                      <p className="text-xs text-md-textMuted mt-2">
                        Next: {formatDate(t.next_date)}
                      </p>
                    )}
                    {t.placements_json && t.placements_json.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs text-md-textMuted uppercase tracking-wider">Prize Structure</p>
                        {t.placements_json.slice(0, 3).map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="text-md-gold font-semibold w-16 shrink-0">{p.place ?? `#${i + 1}`}</span>
                            <span className="truncate text-md-textMuted">
                              {p.tpcPoints != null ? `${p.tpcPoints} TPC pts` : (p.prize ?? '')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold text-md-gold mb-4">Recent Top Results</h2>
        {results.length === 0 ? (
          <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
            No placement data available yet.
          </div>
        ) : (
          <div className="bg-md-surface border border-md-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-md-border text-left text-md-textMuted text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Placement</th>
                  <th className="px-4 py-3">Deck</th>
                  <th className="px-4 py-3">Author</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-md-border last:border-0 hover:bg-md-border/20 transition-colors">
                    <td className="px-4 py-3 text-md-gold font-semibold">{r.tournament_placement}</td>
                    <td className="px-4 py-3 text-md-text font-medium">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-md-gold transition-colors">
                          {r.deck_type_name}
                        </a>
                      ) : r.deck_type_name}
                    </td>
                    <td className="px-4 py-3 text-md-textMuted">{r.author ?? '—'}</td>
                    <td className="px-4 py-3 text-md-textMuted">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
