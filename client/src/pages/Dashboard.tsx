import { memo, useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getTierList, getFeaturedDecks, getDecks } from '../api/meta';
import { getSyncStatus, type SyncRecord } from '../api/sync';
import { logGame } from '../api/personalGames';
import type { TierList } from '../types/meta';
import type { DeckType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import SyncFreshnessBadge from '../components/common/SyncFreshnessBadge';
import ChartTooltip from '../components/common/ChartTooltip';
import { useSyncUpdate } from '../cache/SyncUpdateContext';
import { readLocal, writeLocal, LOCAL_KEYS } from '../cache/cacheStore';
import TopArchetypesGrid from '../components/dashboard/TopArchetypesGrid';
import TierListView from '../components/dashboard/TierListView';
import MoversWidget from '../components/dashboard/MoversWidget';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TIER_COLORS, ROGUE_INDEX } from '../constants/tierColors';

const smallQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)') : null;
const subscribe = (cb: () => void) => { smallQuery?.addEventListener('change', cb); return () => smallQuery?.removeEventListener('change', cb); };
const getSnapshot = () => smallQuery?.matches ?? false;
function useIsSmall() { return useSyncExternalStore(subscribe, getSnapshot); }

interface PopularityDatum {
  name: string;
  power: number | null;
  tier: number;
}

// Memoized so Dashboard's frequent state changes (game-log form, bgLoading,
// sync badges) don't re-render recharts — the chart only redraws when its
// data or the small-screen breakpoint actually change.
const PowerRankingsChart = memo(function PowerRankingsChart({
  data,
  isSmall,
}: {
  data: PopularityDatum[];
  isSmall: boolean;
}) {
  // Draw-in only on the first render; when local-first data is replaced by the
  // network refresh the bars update in place instead of re-animating.
  const hasAnimatedRef = useRef(false);
  const animate = !hasAnimatedRef.current;
  useEffect(() => {
    hasAnimatedRef.current = true;
  }, []);

  return (
    <div className="h-64 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: isSmall ? 10 : 120, right: 10 }}>
          <defs>
            {TIER_COLORS.map((color, i) => (
              <linearGradient key={i} id={`tier-bar-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0.95} />
              </linearGradient>
            ))}
          </defs>
          <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#a1a1aa"
            fontSize={12}
            width={isSmall ? 0 : 110}
            hide={isSmall}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#eceef4' }}
          />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
          <Bar
            dataKey="power"
            name="Power"
            radius={[0, 6, 6, 0]}
            barSize={20}
            isAnimationActive={animate}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={`url(#tier-bar-grad-${TIER_COLORS[entry.tier] ? entry.tier : ROGUE_INDEX})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

interface FeaturedDeck {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  cards: Array<{ name: string; image: string | null }>;
}

export default function Dashboard() {
  const isSmall = useIsSmall();
  const { dataGeneration, applying } = useSyncUpdate();
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [featured, setFeatured] = useState<FeaturedDeck[]>([]);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks the background (non-blocking) data load so we can reserve space for
  // the Game Log + Top Decks sections and avoid a layout shift when they arrive.
  const [bgLoading, setBgLoading] = useState(true);
  const [error, setError] = useState('');

  // Quick-entry form state
  const [logDeck, setLogDeck] = useState('');
  const [logOpponent, setLogOpponent] = useState('');
  const [logResult, setLogResult] = useState<'win' | 'loss' | 'draw'>('win');
  const [logFirst, setLogFirst] = useState<boolean | null>(null);
  const [logSaving, setLogSaving] = useState(false);
  const [logFlash, setLogFlash] = useState('');

  const load = async () => {
    setBgLoading(true);
    setError('');

    // Local-first: paint instantly from the device cache when we have a copy,
    // so a cold start (or a Sync Update re-render) never blocks on the network.
    const cached = await readLocal<TierList>(LOCAL_KEYS.tierList);
    if (cached) {
      setTierList(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      // Critical path: tier list only — show the page as soon as this resolves
      const data = await getTierList();
      setTierList(data);
      void writeLocal(LOCAL_KEYS.tierList, data);
      setLoading(false);

      // Background: load supplementary data without blocking render
      Promise.all([
        getFeaturedDecks().catch(() => [] as FeaturedDeck[]),
        getSyncStatus().catch(() => [] as SyncRecord[]),
        getDecks().catch(() => [] as DeckType[]),
      ]).then(([feat, sync, decks]) => {
        setFeatured(Array.isArray(feat) ? feat : []);
        setSyncRecords(sync);
        const names = [...decks.filter((d) => d.tier != null && d.tier <= 3).map((d) => d.name), 'Rogue'];
        setDeckNames(names);
        if (names.length > 0) { setLogDeck(names[0]); setLogOpponent(names[0]); }
      }).finally(() => setBgLoading(false));
    } catch (e: any) {
      // Keep showing cached data on a network failure — that's the point of
      // local-first. Only surface the error when we have nothing to show.
      if (!cached) setError(e.message || 'Failed to load tier list');
      setLoading(false);
      setBgLoading(false);
    }
  };

  // Re-run on a Sync Update (dataGeneration bump) to refetch + re-render in place.
  useEffect(() => { load(); }, [dataGeneration]);

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

  const handleLogGame = async () => {
    if (!logDeck || !logOpponent) return;
    setLogSaving(true);
    try {
      await logGame({ deck_played: logDeck, opponent_deck: logOpponent, result: logResult, went_first: logFirst, notes: null });
      setLogFlash(`✓ ${logResult.toUpperCase()} vs ${logOpponent} logged`);
      setTimeout(() => setLogFlash(''), 3000);
    } catch (e: any) {
      console.error('logGame failed:', e?.response?.status, e?.response?.data, e);
      const msg = e?.response?.data?.error || e?.message || 'unknown error';
      setLogFlash(`Failed: ${msg}`);
      setTimeout(() => setLogFlash(''), 5000);
    } finally {
      setLogSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-md-blue/30 border-t-md-blue rounded-full animate-spin"></div>
        <p className="text-md-textSecondary">Loading dashboard...</p>
      </div>
    </div>
  );

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!tierList) return null;

  return (
    <div className="space-y-8 pb-8">
      {/* Hero header with gradient */}
      <div className="relative py-6 px-6 rounded-2xl bg-gradient-to-r from-md-surface/60 to-md-surface/40 border border-md-border/40 backdrop-blur-sm">
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

      {/* Quick Game Log — reserve space while background data loads to avoid CLS */}
      {bgLoading ? (
        <div
          className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-4 border border-md-border/40 skeleton-pulse"
          style={{ minHeight: '104px' }}
          aria-hidden
        />
      ) : deckNames.length > 0 && (
      <ErrorBoundary fallback={null}>
        <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-4 border border-md-border/40">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-md-purple to-md-blue"></div>
            <h3 className="text-sm font-bold text-md-text">Log a Game</h3>
            {logFlash && <span className="text-xs text-md-green ml-2">{logFlash}</span>}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-md-textMuted">I played</label>
              <select value={logDeck} onChange={(e) => setLogDeck(e.target.value)}
                className="bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue min-w-[140px]">
                {deckNames.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-md-textMuted">vs</label>
              <select value={logOpponent} onChange={(e) => setLogOpponent(e.target.value)}
                className="bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue min-w-[140px]">
                {deckNames.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex gap-1">
              {(['win', 'loss', 'draw'] as const).map((r) => (
                <button key={r} onClick={() => setLogResult(r)}
                  className={`px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                    logResult === r
                      ? r === 'win' ? 'bg-md-green/20 text-md-green border-md-green/30'
                        : r === 'loss' ? 'bg-md-red/20 text-md-red border-md-red/30'
                        : 'bg-md-textMuted/20 text-md-textMuted border-md-border'
                      : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                  }`}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {([true, false, null] as const).map((v) => (
                <button key={String(v)} onClick={() => setLogFirst(logFirst === v ? null : v)}
                  className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    logFirst === v && v !== null
                      ? 'bg-md-blue/15 text-md-blue border-md-blue/30'
                      : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                  }`}>
                  {v === true ? '1st' : v === false ? '2nd' : '?'}
                </button>
              ))}
            </div>
            <button onClick={handleLogGame} disabled={logSaving}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 hover:bg-md-blue/25 transition-colors disabled:opacity-50">
              {logSaving ? '...' : 'Log'}
            </button>
          </div>
        </div>
      </ErrorBoundary>
      )}

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

        <TopArchetypesGrid featured={featured} loading={bgLoading} />
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
            className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/40 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm group hover:shadow-lg hover:shadow-black/10 transition-all duration-300"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300" style={{ background: `linear-gradient(135deg, ${s.accent}10 0%, transparent 50%)` }}></div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-md-textSecondary uppercase tracking-widest font-bold">{s.label}</p>
                <p className={`text-3xl font-extrabold mt-1 tabular-nums ${s.color}`}>{s.count}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.accent}15` }}>
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: s.accent }}></div>
              </div>
            </div>
            <p className="text-xs text-md-textMuted mt-3">{s.desc}</p>
            <div className="absolute bottom-0 left-0 right-0 h-px opacity-30" style={{ background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)` }} />
          </div>
        ))}
      </div>

      {/* What's Moving widget */}
      <MoversWidget />

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
        <div className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/40 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-green to-md-blue"></div>
            <h3 className="text-lg font-bold text-md-text">Power Rankings</h3>
            <span className="text-xs text-md-textMuted ml-auto">Top 12 decks</span>
          </div>
          <PowerRankingsChart data={popularityData} isSmall={isSmall} />
        </div>
      )}
    </div>
  );
}