import { tierHex } from '../../constants/tierColors';

const TIER_LABELS = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3', 'Rogue'] as const;

interface TooltipItem {
  name?: string;
  value?: number | string | null;
  color?: string;
  fill?: string;
  payload?: { tier?: number };
}

interface ChartTooltipProps {
  // Injected by recharts when passed as <Tooltip content={...}>.
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  // Multi-series charts read better with the biggest value first.
  sortByValue?: boolean;
}

function formatValue(value: number | string | null | undefined): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Shared dark tooltip for all recharts charts: rounded card, tier badge when
// the hovered datum carries a tier, and color-dotted rows per series.
export default function ChartTooltip({ active, payload, label, sortByValue }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const items = sortByValue
    ? [...payload].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
    : payload;
  const tier = payload[0]?.payload?.tier;
  const hasTier = typeof tier === 'number';

  return (
    <div className="rounded-xl border border-md-border/60 bg-md-bg/95 backdrop-blur-sm px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.65)]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[13px] font-semibold text-md-text">{label}</span>
        {hasTier && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
            style={{
              color: tierHex(tier),
              backgroundColor: `${tierHex(tier)}1f`,
              border: `1px solid ${tierHex(tier)}40`,
            }}
          >
            {TIER_LABELS[tier] ?? 'Rogue'}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {items.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-xs text-md-textSecondary">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    typeof p.payload?.tier === 'number' ? tierHex(p.payload.tier) : p.color || p.fill,
                }}
              />
              {p.name}
            </span>
            <span className="text-xs font-semibold font-mono text-md-text tabular-nums">
              {formatValue(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
