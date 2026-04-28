import { useState, useEffect, useSyncExternalStore } from 'react';
import { getTierList, getFeaturedDecks, getDecks } from '../api/meta';
import { getSyncStatus, type SyncRecord } from '../api/sync';
import { logGame } from '../api/personalGames';
import type { TierList } from '../types/meta';
import type { DeckType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import SyncFreshnessBadge from '../components/common/SyncFreshnessBadge';
import TopArchetypesGrid from '../components/dashboard/TopArchetypesGrid';
import TierListView from '../components/dashboard/TierListView';
import MoversWidget from '../components/dashboard/MoversWidget';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const tierColors = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#6b7694'];

const smallQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)') : null;
const subscribe = (cb: () => void) => { smallQuery?.addEventListener('change', cb); return () => smallQuery?.removeEventListener('change', cb); };
const getSnapshot = () => smallQuery?.matches ?? false;
function useIsSmall() { return useSyncExternalStore(subscribe, getSnapshot); }

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
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [featured, setFeatured] = useState<FeaturedDeck[]>([]);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Quick-entry form state
  const [logDeck, setLogDeck] = useState('');
  const [logOpponent, setLogOpponent] = useState('');
  const [logResult, setLogResult] = useState<'win' | 'loss' | 'draw'>('win');
  const [logFirst, setLogFirst] = useState<boolean | null>(null);
  const [logSaving, setLogSaving] = useState(false);
  const [logFlash, setLogFlash] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, feat, sync, decks] = await Promise.all([
        getTierList(), getFeaturedDecks(), getSyncStatus(),
        getDecks().catch(() => [] as DeckType[]),
      ]);
      setTierList(data);
      setFeatured(Array.isArray(feat) ? feat : []);
      setSyncRecords(sync);
      const names = [...decks.filter((d) => d.tier != null && d.tier <= 3).map((d) => d.name), 'Rogue'];
      setDeckNames(names);
      if (names.length > 0) { setLogDeck(names[0]); setLogOpponent(names[0]); }
    } catch (e: any) {
      setError(e.message || 'Failed to load tier list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const allDecks = [
    ...(tierList['0'] ?? []).map(d => ({ ...d, tierKey: 0 })),
    ...(tierList['1'] ?? []).map(d => ({ ...d, tierKey: 1 })),
    ...(tierList['2'] ?? []).map(d => ({ ...d, tierKey: 2 })),
    ...(tierList['3'] ?? []).map(d => ({ ...d, tierKey: 3 })),
    ...(tierList.rogue ?? []).map(d => ({ ...d, tierKey: 4 })),
  ];

  const popularityData = allDecks
    .filter(d => d.power != null)
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .slice(0, 12)
    .map(d => ({ name: d.name, power: d.power, tier: d.tierKey }));

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
          <SyncFreshnessBadge records={syncRecords} sources={['mdm_deck_types', 'mdm_tournaments', 'untapped']} />
        </div>
      </div>

      {/* Quick Game Log */}
      {deckNames.length > 0 && (
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

        <TopArchetypesGrid featured={featured} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Tier 0', count: tierList['0'].length, color: 'text-tier-0', accent: '#ff2d55', desc: 'Dominant' },
          { label: 'Tier 1', count: tierList['1'].length, color: 'text-tier-1', accent: '#ff8c38', desc: 'Strong' },
          { label: 'Tier 2', count: tierList['2'].length, color: 'text-tier-2', accent: '#ffd60a', desc: 'Viable' },
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
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={popularityData} layout="vertical" margin={{ left: isSmall ? 10 : 120, right: 10 }}>
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
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.65)',
                    fontSize: 13,
                  }}
                  labelStyle={{ color: '#eceef4', fontWeight: 600 }}
                  itemStyle={{ color: '#a1a1aa' }}
                />
                <Bar dataKey="power" radius={[0, 6, 6, 0]} barSize={20}>
                  {popularityData.map((entry, i) => (
                    <Cell key={i} fill={tierColors[entry.tier] || tierColors[4]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}