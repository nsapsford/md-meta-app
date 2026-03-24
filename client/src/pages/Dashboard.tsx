import { useState, useEffect } from 'react';
import { getTierList, getFeaturedDecks } from '../api/meta';
import type { TierList } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import TopArchetypesGrid from '../components/dashboard/TopArchetypesGrid';
import TierListView from '../components/dashboard/TierListView';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const tierColors = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#6b7694'];

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
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [featured, setFeatured] = useState<FeaturedDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, feat] = await Promise.all([getTierList(), getFeaturedDecks()]);
      setTierList(data);
      setFeatured(feat);
    } catch (e: any) {
      setError(e.message || 'Failed to load tier list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!tierList) return null;

  const allDecks = [
    ...tierList['0'].map(d => ({ ...d, tierKey: 0 })),
    ...tierList['1'].map(d => ({ ...d, tierKey: 1 })),
    ...tierList['2'].map(d => ({ ...d, tierKey: 2 })),
    ...tierList['3'].map(d => ({ ...d, tierKey: 3 })),
    ...tierList.rogue.map(d => ({ ...d, tierKey: 4 })),
  ];

  const popularityData = allDecks
    .filter(d => d.power != null)
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .slice(0, 12)
    .map(d => ({ name: d.name, power: d.power, tier: d.tierKey }));

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="relative">
        <h2 className="text-3xl font-bold tracking-tight">
          <span className="text-shimmer">Meta Dashboard</span>
        </h2>
        <p className="text-md-textMuted text-sm mt-1.5">Current Yu-Gi-Oh! Master Duel tier list and meta overview</p>
      </div>

      {/* Top 3 Archetypes */}
      <TopArchetypesGrid featured={featured} />

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tier 0', count: tierList['0'].length, color: 'text-tier-0', accent: '#ff2d55' },
          { label: 'Tier 1', count: tierList['1'].length, color: 'text-tier-1', accent: '#ff8c38' },
          { label: 'Tier 2', count: tierList['2'].length, color: 'text-tier-2', accent: '#ffd60a' },
          { label: 'Total Tracked', count: allDecks.length, color: 'text-md-gold', accent: '#d4af37' },
        ].map((s) => (
          <div key={s.label} className="bg-md-surface border border-white/[0.07] rounded-xl p-5 relative overflow-hidden">
            <p className="text-[10px] text-md-textSecondary uppercase tracking-widest font-medium">{s.label}</p>
            <p className={`text-3xl font-bold mt-1.5 tabular-nums ${s.color}`}>{s.count}</p>
            <div className="absolute bottom-0 left-0 right-0 h-px opacity-30" style={{ background: s.accent }} />
          </div>
        ))}
      </div>

      {/* Data sources — segmented control */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium">Sources</span>
        <div className="inline-flex items-center bg-md-surface border border-white/[0.07] rounded-lg p-0.5">
          <span className="px-3 py-1 rounded-md text-[11px] text-md-textSecondary">MasterDuelMeta</span>
          <div className="w-px h-3 bg-white/10 mx-0.5" />
          <span className="px-3 py-1 rounded-md text-[11px] text-md-textSecondary">YGOProDeck</span>
          <div className="w-px h-3 bg-white/10 mx-0.5" />
          {allDecks.some(d => d.win_rate != null) ? (
            <span className="px-3 py-1 rounded-md bg-md-surfaceAlt border border-md-winRate/20 text-[11px] text-md-winRate font-medium">
              untapped.gg
            </span>
          ) : (
            <span className="px-3 py-1 rounded-md text-[11px] text-md-textMuted opacity-40 cursor-not-allowed">
              untapped.gg
            </span>
          )}
        </div>
      </div>

      {/* Tier List */}
      <TierListView tierList={tierList} />

      {/* Power Chart */}
      {popularityData.length > 0 && (
        <div className="bg-md-surface border border-white/[0.07] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-4 rounded-full bg-md-blue" />
            <h3 className="text-sm font-semibold text-md-text">Power Rankings</h3>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={popularityData} layout="vertical" margin={{ left: 110, right: 20 }}>
              <XAxis type="number" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={11} width={100} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  fontSize: 12,
                }}
                labelStyle={{ color: '#eceef4', fontWeight: 600 }}
              />
              <Bar dataKey="power" radius={[0, 6, 6, 0]} barSize={18}>
                {popularityData.map((entry, i) => (
                  <Cell key={i} fill={tierColors[entry.tier] || tierColors[4]} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
