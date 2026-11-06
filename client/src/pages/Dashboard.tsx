import { lazy, Suspense, useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../components/common/ErrorBanner';
import SyncFreshnessBadge from '../components/common/SyncFreshnessBadge';
import PullToRefresh from '../components/common/PullToRefresh';
import { useSyncUpdate } from '../cache/SyncUpdateContext';
import TopArchetypesGrid from '../components/dashboard/TopArchetypesGrid';
import TierListView from '../components/dashboard/TierListView';
import type { PopularityDatum } from '../components/dashboard/PowerRankingsChart';
import { tierListQuery, featuredDecksQuery } from '../queries/options';
import { useFirstContent } from '../launch/firstContent';
import { useNearViewport } from '../hooks/useNearViewport';

const PowerRankingsChart = lazy(() => import('../components/dashboard/PowerRankingsChart'));

const smallQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)') : null;
const subscribe = (cb: () => void) => { smallQuery?.addEventListener('change', cb); return () => smallQuery?.removeEventListener('change', cb); };
const getSnapshot = () => smallQuery?.matches ?? false;
function useIsSmall() { return useSyncExternalStore(subscribe, getSnapshot); }

export default function Dashboard() {
  const isSmall = useIsSmall();
  const { applying, applyUpdate, syncRecords } = useSyncUpdate();
  // Both requests start together on mount (they used to run one after the
  // other). Each paints from the persisted cache first when it has a copy,
  // then revalidates in the background.
  const tierListQ = useQuery(tierListQuery());
  const featuredQ = useQuery(featuredDecksQuery());
  const tierList = tierListQ.data ?? null;
  const featured = featuredQ.data ?? [];
  // Background revalidation failures stay silent while cached data is shown.
  const error = !tierList && tierListQ.error ? tierListQ.error.message || 'Failed to load tier list' : '';
  const [chartRef, chartNear] = useNearViewport<HTMLDivElement>();
  useFirstContent(tierList != null || error !== '');

  // Derived before the early returns (hooks must be unconditional) and memoized
  // on tierList so unrelated state changes don't recompute or re-render the chart.
  const allDecks = useMemo(() => {
    if (!tierList) return [];
    return [
      ...(tierList['0'] ?? []).map(d => ({ ...d, tierKey: 0 })),
      ...(tierList['1'] ?? []).map(d => ({ ...d, tierKey: 1 })),
      ...(tierList['2'] ?? []).map(d => ({ ...d, tierKey: 2 })),
      ...(tierList['3'] ?? []).map(d => ({ ...d, tierKey: 3 })),
      ...(tierList.rogue ?? []).map(d => ({ ...d, tierKey: 4 })),
    ];
  }, [tierList]);

  const popularityData = useMemo<PopularityDatum[]>(
    () =>
      allDecks
        .filter(d => d.power != null)
        .sort((a, b) => (b.power || 0) - (a.power || 0))
        .slice(0, 12)
        .map(d => ({ name: d.name, power: d.power, tier: d.tierKey })),
    [allDecks]
  );

  if (!tierList && !error) return (
    <div className="flex justify-center items-center py-20">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-md-blue/30 border-t-md-blue rounded-full animate-spin"></div>
        <p className="text-md-textSecondary">Loading dashboard...</p>
      </div>
    </div>
  );

  if (error) return <ErrorBanner message={error} onRetry={() => void tierListQ.refetch()} />;
  if (!tierList) return null;

  return (
    <PullToRefresh onRefresh={applyUpdate}>
    <div className="space-y-8 pb-8">
      {/* Hero header with gradient */}
      <div className="relative py-6 px-6 rounded-2xl bg-gradient-to-r from-md-surface/60 to-md-surface/40 border border-md-border/40">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMCIvPjxwYXRoIGQ9Ik0wIDBINzAgTDIwIDEwMFoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAxKSIgc3Ryb2tlLXdpZHRoPSIxcHgiLz48L3N2Zz4=')] opacity-5"></div>
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-md-gold to-md-text bg-clip-text text-transparent">
              Meta Dashboard
            </h1>
            <p className="text-md-textSecondary text-sm sm:text-base mt-2 max-w-2xl">
              Current Yu-Gi-Oh! Master Duel tier list and meta analysis with real-time data from multiple sources
            </p>
          </div>
          <SyncFreshnessBadge records={syncRecords} sources={['mdm_deck_types', 'mdm_tournaments', 'untapped']} updating={applying} />
        </div>
      </div>

      {/* Featured Decks Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-gold to-md-orange"></div>
            <h2 className="text-2xl font-bold text-md-text">Top Performing Decks</h2>
          </div>
          <span className="text-xs text-md-textMuted bg-md-surface px-3 py-1.5 rounded-full border border-md-border font-medium">
            Last 30 days
          </span>
        </div>

        <TopArchetypesGrid featured={featured} loading={featuredQ.isPending} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Tier 0', count: (tierList['0'] ?? []).length, color: 'text-tier-0', accent: '#ff2d55', desc: 'Dominant' },
          { label: 'Tier 1', count: (tierList['1'] ?? []).length, color: 'text-tier-1', accent: '#ff8c38', desc: 'Strong' },
          { label: 'Tier 2', count: (tierList['2'] ?? []).length, color: 'text-tier-2', accent: '#ffd60a', desc: 'Viable' },
          { label: 'Total Tracked', count: allDecks.length, color: 'text-md-gold', accent: '#d4af37', desc: 'Decks' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/40 rounded-2xl p-5 relative overflow-hidden group hover:shadow-lg hover:shadow-black/10 transition-all duration-300"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300" style={{ background: `linear-gradient(135deg, ${s.accent}10 0%, transparent 50%)` }}></div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-md-textSecondary uppercase tracking-widest font-bold truncate" title={s.label}>{s.label}</p>
                <p className={`text-3xl font-extrabold mt-1 tabular-nums ${s.color}`}>{s.count}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${s.accent}15` }}>
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: s.accent }}></div>
              </div>
            </div>
            <p className="text-xs text-md-textMuted mt-3">{s.desc}</p>
            <div className="absolute bottom-0 left-0 right-0 h-px opacity-30" style={{ background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)` }} />
          </div>
        ))}
      </div>

      {/* Data sources */}
      <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-5 border border-md-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-md-blue animate-pulse"></div>
            <h3 className="text-sm font-bold text-md-text">Data Sources</h3>
          </div>
          <span className="text-xs text-md-textMuted bg-md-surface px-2.5 py-1 rounded-full border border-md-border">
            Real-time
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="px-4 py-2 rounded-xl bg-md-surface border border-md-border/50">
            <span className="text-sm font-semibold text-md-text">MasterDuelMeta</span>
          </div>
          <div className="px-4 py-2 rounded-xl bg-md-surface border border-md-border/50">
            <span className="text-sm font-semibold text-md-text">YGOProDeck</span>
          </div>
          {allDecks.some(d => d.win_rate != null) ? (
            <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-md-winRate/10 to-md-winRate/5 border border-md-winRate/30">
              <span className="text-sm font-bold text-md-winRate">untapped.gg</span>
            </div>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-md-surface border border-md-border/30 opacity-50">
              <span className="text-sm font-semibold text-md-textMuted">untapped.gg</span>
            </div>
          )}
        </div>
      </div>

      {/* Tier List Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-blue to-md-purple"></div>
          <h2 className="text-2xl font-bold text-md-text">Complete Tier List</h2>
        </div>

        <TierListView tierList={tierList} />
      </div>

      {/* Power Rankings Chart */}
      {popularityData.length > 0 && (
        <div ref={chartRef} className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/40 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-green to-md-blue"></div>
            <h3 className="text-lg font-bold text-md-text">Power Rankings</h3>
            <span className="text-xs text-md-textMuted ml-auto">Top 12 decks</span>
          </div>
          {/* Fixed-height placeholder until recharts loads, so nothing shifts. */}
          {chartNear ? (
            <Suspense fallback={<div className="h-64 sm:h-80" />}>
              <PowerRankingsChart data={popularityData} isSmall={isSmall} />
            </Suspense>
          ) : (
            <div className="h-64 sm:h-80" />
          )}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}