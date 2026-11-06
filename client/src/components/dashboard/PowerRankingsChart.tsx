import { memo, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ChartTooltip from '../common/ChartTooltip';
import { TIER_COLORS, ROGUE_INDEX } from '../../constants/tierColors';

export interface PopularityDatum {
  name: string;
  power: number | null;
  tier: number;
}

// Lives in its own module so recharts (~100 kB gzip) is only fetched and
// parsed when the chart scrolls near the viewport, not on Dashboard's first paint.
// Memoized so Dashboard's state changes (sync badges, loading flags) don't
// re-render recharts — the chart only redraws when its data or the
// small-screen breakpoint actually change.
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

export default PowerRankingsChart;
