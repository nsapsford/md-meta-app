import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { metaTrendsQuery, tierListQuery } from '../queries/options';
import { useFirstContent } from '../launch/firstContent';
import type { MetaSnapshot } from '../types/meta';
import ErrorBanner from '../components/common/ErrorBanner';
import { TrendsSkeleton } from '../components/common/Skeleton';
import ChartTooltip from '../components/common/ChartTooltip';
import CountUp from '../components/common/CountUp';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useIsNative } from '../hooks/useIsNative';

const COLORS = ['#ff4d5e', '#ff9147', '#ffd60a', '#3dd975', '#4a8eff', '#8b6cff', '#ff6b9d', '#00d4aa', '#f97316', '#d4af37'];

function MiniCardFan({ images }: { images: string[] }) {
  const count = images.length;
  const totalSpread = 24;
  const angles = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -totalSpread / 2 + (i * totalSpread) / (count - 1)
  );
  const xOffsets = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -10 * (count - 1) / 2 + i * 10
  );
  return (
    <div className="relative flex items-end justify-center shrink-0" style={{ height: 72, width: 72 }}>
      {images.map((src, i) => (
        <div
          key={i}
          className="absolute bottom-0"
          style={{
            transform: `translateX(${xOffsets[i]}px) rotate(${angles[i]}deg)`,
            transformOrigin: 'bottom center',
            zIndex: i,
          }}
        >
          <img
            loading="lazy"
            decoding="async"
            src={src}
            alt=""
            className="rounded shadow-md border border-md-border/50"
            style={{ width: 44, height: 64, objectFit: 'cover' }}
          />
        </div>
      ))}
    </div>
  );
}

const EMPTY_TRENDS: Record<string, MetaSnapshot[]> = {};

export default function MetaTrends() {
  const trendsQ = useQuery(metaTrendsQuery());
  // Representative card art per deck already ships with the tier list (and is
  // usually cached from the Dashboard), so the table's card fans cost no
  // requests. This used to run up to ~4 card searches per deck, for 10 decks,
  // twice per visit (once for the cached trends, again for the fresh ones).
  const tierListQ = useQuery(tierListQuery());
  const trends = trendsQ.data ?? EMPTY_TRENDS;
  const loading = trendsQ.isPending;
  const error = !trendsQ.data && trendsQ.error ? trendsQ.error.message : '';
  const [metric, setMetric] = useState<'power' | 'tier'>('power');
  const [timeRange, setTimeRange] = useState(7);
  const navigate = useNavigate();
  const isNative = useIsNative();
  useFirstContent(!loading || error !== '');

  // Play the line-draw animation only on the first reveal. Re-animating on every
  // slider/metric change is what produces the abrupt "jump to end" — recharts
  // restarts the tween mid-flight, so we disable animation after the initial run.
  const hasAnimatedRef = useRef(false);
  useEffect(() => {
    if (!loading) hasAnimatedRef.current = true;
  }, [loading]);
  const animateChart = !hasAnimatedRef.current;

  const deckImages = useMemo(() => {
    const out: Record<string, string[]> = {};
    const tl = tierListQ.data;
    if (!tl) return out;
    for (const tier of [tl['0'], tl['1'], tl['2'], tl['3'], tl.rogue]) {
      for (const d of tier ?? []) {
        const imgs = (d.cards ?? []).map((c) => c.image).filter((x): x is string => !!x).slice(0, 3);
        if (imgs.length > 0) out[d.name] = imgs;
        else if (d.thumbnail_image) out[d.name] = [d.thumbnail_image];
      }
    }
    return out;
  }, [tierListQ.data]);

  // Derived series, memoised so dragging the range slider only re-slices
  // instead of re-scanning every snapshot for every deck on each input event.
  const { topDecks, chartData, hasRealData } = useMemo(() => {
    const deckNames = Object.keys(trends);
    const hasRealData = deckNames.some((name) => trends[name]?.some((s) => s.power != null && s.power > 0));
    const topDecks = deckNames
      .map((name) => {
        const latest = trends[name]?.find((s) => s.power != null && s.power > 0);
        return { name, power: latest?.power ?? 0 };
      })
      .filter((d) => d.power > 0)
      .sort((a, b) => b.power - a.power)
      .slice(0, 10)
      .map((d) => d.name);

    const byDate = new Map<string, Record<string, MetaSnapshot>>();
    for (const dn of topDecks) {
      for (const snap of trends[dn] ?? []) {
        let row = byDate.get(snap.snapshot_date);
        if (!row) byDate.set(snap.snapshot_date, (row = {}));
        if (!row[dn]) row[dn] = snap; // first snapshot per date wins, as before
      }
    }
    const allDates = new Set<string>();
    for (const snapshots of Object.values(trends)) for (const s of snapshots) allDates.add(s.snapshot_date);

    const chartData = Array.from(allDates).sort().map((date) => {
      const point: Record<string, string | number | null> = { date };
      const row = byDate.get(date);
      for (const dn of topDecks) {
        const snap = row?.[dn];
        point[dn] = metric === 'power' ? (snap?.power ?? null) : (snap?.tier ?? null);
      }
      return point;
    }).filter((point) => topDecks.some((dn) => point[dn] != null));

    return { topDecks, chartData, hasRealData };
  }, [trends, metric]);

  if (loading) return <div className="py-4"><TrendsSkeleton /></div>;
  if (error) return <ErrorBanner message={error} />;

  if (topDecks.length === 0 || !hasRealData) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold"><span className="text-shimmer">Meta Trends</span></h2>
        <div className="bg-md-surface border border-md-border rounded-xl p-10 text-center text-md-textMuted">
          No trend data yet. Run a meta sync to capture the first snapshot.
        </div>
      </div>
    );
  }

  const visibleData = chartData.slice(-Math.min(timeRange, chartData.length));

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

      <div className="flex items-center gap-3 px-1">
        <span className="text-xs text-md-textMuted whitespace-nowrap">Last {Math.min(timeRange, chartData.length)} of {chartData.length}</span>
        <input
          type="range"
          min={2}
          max={chartData.length}
          value={Math.min(timeRange, chartData.length)}
          onChange={(e) => setTimeRange(Number(e.target.value))}
          className="w-full accent-md-blue"
        />
        <span className="text-xs text-md-textMuted whitespace-nowrap">All</span>
      </div>

      <div className="bg-md-surface border border-md-border rounded-xl p-5 overflow-x-auto">
        <ResponsiveContainer width="100%" height={isNative ? 380 : 420}>
          <LineChart data={visibleData} margin={isNative ? { top: 5, right: 10, left: -20, bottom: 60 } : { top: 5, right: 30, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="date"
              stroke="#6b7694"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              angle={isNative ? -45 : 0}
              textAnchor={isNative ? "end" : "middle"}
              height={isNative ? 80 : 30}
            />
            <YAxis
              stroke="#6b7694"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              reversed={metric === 'tier'}
              domain={metric === 'tier' ? [0, 3] : ['auto', 'auto']}
            />
            <Tooltip content={<ChartTooltip sortByValue />} />
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
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2, fill: '#0f1423' }}
                activeDot={{ r: 6, strokeWidth: 0, style: { filter: `drop-shadow(0 0 6px ${COLORS[i % COLORS.length]})` } }}
                connectNulls
                isAnimationActive={animateChart}
                animationDuration={900}
                animationEasing="ease-in-out"
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
              const imgs = deckImages[name];
              return (
                <tr key={name} className="hover:bg-md-surfaceHover/50 transition-colors cursor-pointer" onClick={() => navigate(`/decks/${encodeURIComponent(name)}`)}>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {imgs && imgs.length > 0 && <MiniCardFan images={imgs} />}
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                  </td>
                  <td className="text-center px-4 py-2 text-sm text-md-textMuted font-mono align-middle">
                    <CountUp value={snaps.length} decimals={0} />
                  </td>
                  <td className="text-right px-5 py-2 text-sm font-semibold font-mono align-middle">
                    {latest?.power != null && latest.power > 0 ? <CountUp value={latest.power} decimals={1} /> : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
