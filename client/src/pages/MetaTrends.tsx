import { useState, useEffect } from 'react';
import { getMetaTrends } from '../api/meta';
import type { MetaSnapshot } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#3d7eff', '#7c5cfc', '#ff6b9d', '#00d4aa', '#ff4757', '#c9a84c'];

export default function MetaTrends() {
  const [trends, setTrends] = useState<Record<string, MetaSnapshot[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<'power' | 'tier'>('power');

  useEffect(() => {
    getMetaTrends()
      .then(setTrends)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} />;

  const deckNames = Object.keys(trends);
  const hasRealData = deckNames.some((name) =>
    trends[name]?.some((s) => s.power != null && s.power > 0)
  );

  if (deckNames.length === 0 || !hasRealData) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-md-gold">Meta Trends</h2>
        <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
          No trend data yet. Run a meta sync to capture the first snapshot, then data will accumulate daily.
        </div>
      </div>
    );
  }

  // Build chart data
  const dates = new Set<string>();
  for (const snapshots of Object.values(trends)) {
    for (const s of snapshots) dates.add(s.snapshot_date);
  }
  const sortedDates = Array.from(dates).sort();

  // Pick top 10 decks by latest power (only decks with actual power data)
  const topDecks = deckNames
    .map((name) => {
      const latest = trends[name]?.find((s) => s.power != null && s.power > 0);
      return { name, power: latest?.power ?? 0 };
    })
    .filter((d) => d.power > 0)
    .sort((a, b) => b.power - a.power)
    .slice(0, 10)
    .map((d) => d.name);

  const chartData = sortedDates.map((date) => {
    const point: Record<string, any> = { date };
    for (const dn of topDecks) {
      const snap = trends[dn]?.find((s) => s.snapshot_date === date);
      point[dn] = metric === 'power'
        ? (snap?.power != null ? snap.power : null)
        : (snap?.tier != null ? snap.tier : null);
    }
    return point;
  }).filter((point) => topDecks.some((dn) => point[dn] != null));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-md-gold">Meta Trends</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setMetric('power')}
            className={`px-3 py-1.5 rounded text-sm ${metric === 'power' ? 'bg-md-blue text-white' : 'bg-md-surface border border-md-border text-md-textMuted hover:bg-md-surfaceHover'}`}
          >
            Power
          </button>
          <button
            onClick={() => setMetric('tier')}
            className={`px-3 py-1.5 rounded text-sm ${metric === 'tier' ? 'bg-md-blue text-white' : 'bg-md-surface border border-md-border text-md-textMuted hover:bg-md-surfaceHover'}`}
          >
            Tier
          </button>
        </div>
      </div>

      <div className="bg-md-surface border border-md-border rounded-lg p-4">
        <ResponsiveContainer width="100%" height={500}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" stroke="#8892a8" fontSize={11} />
            <YAxis
              stroke="#8892a8"
              fontSize={12}
              reversed={metric === 'tier'}
              domain={metric === 'tier' ? [0, 3] : ['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#131829', border: '1px solid #2a3050', borderRadius: 8 }}
              labelStyle={{ color: '#e8eaf0' }}
            />
            <Legend />
            {topDecks.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Deck Legend Table */}
      <div className="bg-md-surface border border-md-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-md-border">
              <th className="text-left px-4 py-2 text-sm text-md-textMuted">Deck</th>
              <th className="text-center px-4 py-2 text-sm text-md-textMuted">Data Points</th>
              <th className="text-center px-4 py-2 text-sm text-md-textMuted">Latest Power</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-md-border">
            {topDecks.map((name, i) => {
              const snaps = trends[name] || [];
              const latest = snaps.find((s) => s.power != null && s.power > 0) || snaps[0];
              return (
                <tr key={name} className="hover:bg-md-surfaceHover">
                  <td className="px-4 py-2 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-sm">{name}</span>
                  </td>
                  <td className="text-center px-4 py-2 text-sm text-md-textMuted">{snaps.length}</td>
                  <td className="text-center px-4 py-2 text-sm">{latest?.power?.toFixed(1) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
