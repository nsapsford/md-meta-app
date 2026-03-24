import { useState, useEffect } from 'react';
import { getMetaTrends } from '../api/meta';
import type { MetaSnapshot } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#ff4d5e', '#ff9147', '#ffd60a', '#3dd975', '#4a8eff', '#8b6cff', '#ff6b9d', '#00d4aa', '#f97316', '#d4af37'];

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

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorBanner message={error} />;

  const deckNames = Object.keys(trends);
  const hasRealData = deckNames.some((name) =>
    trends[name]?.some((s) => s.power != null && s.power > 0)
  );

  if (deckNames.length === 0 || !hasRealData) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold"><span className="text-shimmer">Meta Trends</span></h2>
        <div className="bg-md-surface border border-md-border rounded-xl p-10 text-center text-md-textMuted">
          No trend data yet. Run a meta sync to capture the first snapshot.
        </div>
      </div>
    );
  }

  const dates = new Set<string>();
  for (const snapshots of Object.values(trends)) {
    for (const s of snapshots) dates.add(s.snapshot_date);
  }
  const sortedDates = Array.from(dates).sort();

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight"><span className="text-shimmer">Meta Trends</span></h2>
        <div className="flex gap-1 bg-md-surface border border-md-border rounded-lg p-0.5">
          {(['power', 'tier'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 capitalize ${
                metric === m
                  ? 'bg-md-blue/15 text-md-blue shadow-sm'
                  : 'text-md-textMuted hover:text-md-textSecondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-md-surface border border-md-border rounded-xl p-5">
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" stroke="#6b7694" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#6b7694"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              reversed={metric === 'tier'}
              domain={metric === 'tier' ? [0, 3] : ['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#141a2e',
                border: '1px solid #1e2740',
                borderRadius: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                fontSize: 12,
              }}
              labelStyle={{ color: '#eceef4', fontWeight: 600 }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 16, fontSize: 11 }}
              iconType="circle"
              iconSize={8}
            />
            {topDecks.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: '#0f1423' }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Deck table */}
      <div className="bg-md-surface border border-md-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-md-border/60">
              <th className="text-left px-5 py-3 text-[11px] text-md-textMuted uppercase tracking-wider font-medium">Deck</th>
              <th className="text-center px-4 py-3 text-[11px] text-md-textMuted uppercase tracking-wider font-medium">Data Points</th>
              <th className="text-right px-5 py-3 text-[11px] text-md-textMuted uppercase tracking-wider font-medium">Latest Power</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-md-border/40">
            {topDecks.map((name, i) => {
              const snaps = trends[name] || [];
              const latest = snaps.find((s) => s.power != null && s.power > 0) || snaps[0];
              return (
                <tr key={name} className="hover:bg-md-surfaceHover/50 transition-colors">
                  <td className="px-5 py-2.5 flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-sm font-medium">{name}</span>
                  </td>
                  <td className="text-center px-4 py-2.5 text-sm text-md-textMuted font-mono">{snaps.length}</td>
                  <td className="text-right px-5 py-2.5 text-sm font-semibold font-mono">{latest?.power?.toFixed(1) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
