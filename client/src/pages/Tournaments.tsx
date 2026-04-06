import { useState, useEffect } from 'react';
import { getTournaments, getRecentTournamentResults } from '../api/tournaments';
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
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function placementMeta(placement: string): { label: string; color: string; ringColor: string } {
  const p = (placement ?? '').toLowerCase();
  if (p.startsWith('1st')) return { label: '1st', color: 'text-md-gold', ringColor: 'border-md-gold/40' };
  if (p.startsWith('2nd')) return { label: '2nd', color: 'text-[#a1a1aa]', ringColor: 'border-[#a1a1aa]/40' };
  if (p.startsWith('3rd')) return { label: '3rd', color: 'text-[#cd7f32]', ringColor: 'border-[#cd7f32]/40' };
  return { label: placement, color: 'text-md-textMuted', ringColor: 'border-md-border' };
}

// ─── Tournament Card ───────────────────────────────────────────────────────────

function TournamentCard({ t }: { t: Tournament }) {
  const portraitUrl = t.winner_deck_thumbnail ?? resolveBannerUrl(t.banner_image);

  return (
    <div className="group relative featured-card rounded-xl overflow-hidden card-hover flex flex-col">
      {/* Gold top accent line */}
      <div
        className="absolute top-0 inset-x-0 h-px z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }}
      />

      {/* Portrait / banner area */}
      <div className="relative h-44 w-full overflow-hidden bg-md-surfaceAlt flex-shrink-0">
        {portraitUrl ? (
          <>
            <img
              src={portraitUrl}
              alt={t.winner_deck_name ?? t.name}
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111113] via-[#111113]/30 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-md-surfaceAlt to-md-bg" />
        )}

        {/* Winner deck chip overlaid at bottom of portrait */}
        {t.winner_deck_name && (
          <div className="absolute bottom-2.5 left-3 right-3 z-10">
            <span className="inline-flex items-center gap-1.5 bg-black/55 backdrop-blur-sm border border-white/10 rounded-md px-2.5 py-1 text-xs font-medium text-md-gold truncate max-w-full">
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 1L7.5 4.5H11L8.25 6.75L9.25 10.5L6 8.25L2.75 10.5L3.75 6.75L1 4.5H4.5L6 1Z" />
              </svg>
              {t.winner_deck_name}
            </span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div>
          <h3 className="font-semibold text-[15px] leading-snug text-md-text group-hover:text-md-gold transition-colors duration-300">
            {t.name}
          </h3>
          {t.short_name && t.short_name !== t.name && (
            <p className="text-xs text-md-textMuted mt-0.5">{t.short_name}</p>
          )}
        </div>

        {t.next_date && (
          <div className="inline-flex items-center gap-1.5 self-start bg-md-surfaceAlt border border-white/[0.07] rounded-md px-2 py-0.5">
            <svg className="w-3 h-3 text-md-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.5" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] text-md-textMuted tabular-nums">{formatDate(t.next_date)}</span>
          </div>
        )}

        {/* Prize structure */}
        {t.placements_json && t.placements_json.length > 0 && (
          <div className="mt-auto pt-3 border-t border-white/[0.05] space-y-1">
            <p className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium mb-1.5">Prize Structure</p>
            {t.placements_json.slice(0, 3).map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs tabular-nums">
                <span className="text-md-gold font-semibold w-14 shrink-0">{p.place ?? `#${i + 1}`}</span>
                <span className="truncate text-md-textMuted">
                  {p.tpcPoints != null ? `${p.tpcPoints} TPC pts` : (p.prize ?? '—')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recent Result Row ─────────────────────────────────────────────────────────

function ResultRow({ r }: { r: TournamentResult }) {
  const { label, color, ringColor } = placementMeta(r.tournament_placement ?? '');
  return (
    <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-4 px-5 py-3.5 hover:bg-white/[0.025] transition-colors duration-150 group">
      <span className={`inline-flex items-center justify-center text-xs font-bold border rounded-md px-2 py-0.5 bg-white/[0.03] ${color} ${ringColor}`}>
        {label}
      </span>

      <div className="min-w-0">
        {r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-md-text group-hover:text-md-gold transition-colors duration-150 truncate block"
          >
            {r.deck_type_name}
          </a>
        ) : (
          <span className="text-sm font-medium text-md-text truncate block">{r.deck_type_name}</span>
        )}
        {r.author && (
          <span className="text-[11px] text-md-textMuted">{r.author}</span>
        )}
      </div>

      <span className="text-xs text-md-textMuted tabular-nums flex-shrink-0">{formatDate(r.created_at)}</span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

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

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-8">

      {/* Hero header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          <span className="text-shimmer">Tournaments</span>
        </h2>
        <p className="text-md-textMuted text-sm mt-1.5">
          {tournaments.length > 0
            ? `${tournaments.length} tournament format${tournaments.length !== 1 ? 's' : ''} tracked`
            : 'Yu-Gi-Oh! Master Duel competitive tournaments'}
        </p>
      </div>

      {/* Tournament Formats grid */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 rounded-full bg-md-gold" />
          <h3 className="text-xs font-semibold text-md-textMuted uppercase tracking-widest">Tournament Formats</h3>
        </div>

        {tournaments.length === 0 ? (
          <div className="featured-card rounded-xl p-8 text-center text-md-textMuted">
            No tournament data available yet. Click "Sync Data" to fetch the latest data.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tournaments.map((t) => <TournamentCard key={t.id} t={t} />)}
          </div>
        )}
      </section>

      {/* Recent Top Results */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 rounded-full bg-md-blue" />
          <h3 className="text-xs font-semibold text-md-textMuted uppercase tracking-widest">Recent Top Results</h3>
        </div>

        {results.length === 0 ? (
          <div className="featured-card rounded-xl p-8 text-center text-md-textMuted">
            No placement data available yet.
          </div>
        ) : (
          <div className="featured-card rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[5rem_1fr_auto] gap-4 px-5 py-3.5 border-b border-white/[0.05]">
              <span className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium">Place</span>
              <span className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium">Deck / Player</span>
              <span className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium">Date</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {results.map((r, i) => <ResultRow key={i} r={r} />)}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
