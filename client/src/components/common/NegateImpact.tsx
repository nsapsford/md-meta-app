import type { Card } from '../../types/card';

interface NegateImpactProps {
  card: Card;
  compact?: boolean;
}

function impactLabel(value: number): { label: string; color: string } {
  if (value > 8) return { label: 'High', color: 'text-md-red' };
  if (value > 4) return { label: 'Medium', color: 'text-md-orange' };
  if (value > 2) return { label: 'Low', color: 'text-yellow-400' };
  return { label: 'Minimal', color: 'text-md-textMuted' };
}

function barColor(value: number): string {
  if (value > 8) return 'from-red-500 to-red-600';
  if (value > 4) return 'from-orange-500 to-orange-600';
  if (value > 2) return 'from-yellow-500 to-yellow-600';
  return 'from-gray-500 to-gray-600';
}

export default function NegateImpact({ card, compact = false }: NegateImpactProps) {
  const eff = card.negate_effectiveness;
  if (eff == null || eff <= 0) return null;

  const { label, color } = impactLabel(eff);
  const barWidth = Math.min(100, Math.max(5, (eff / 12) * 100));

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-md-textMuted">Negate:</span>
        <span className={`font-semibold ${color}`}>{label}</span>
        <span className="text-md-textMuted">+{eff.toFixed(1)}%</span>
      </div>
    );
  }

  return (
    <div className="bg-md-surfaceAlt border border-md-border/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-md-textMuted font-medium">Negate Impact</span>
        <span className={`text-sm font-bold ${color}`}>{label}</span>
      </div>

      {/* Impact bar */}
      <div className="h-1.5 bg-md-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor(eff)} transition-all duration-500`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Win rate stats */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {card.negated_win_rate != null && (
          <div>
            <p className="text-[10px] text-md-textMuted">Negated WR</p>
            <p className="text-sm font-semibold text-md-red">{card.negated_win_rate.toFixed(1)}%</p>
          </div>
        )}
        {card.not_negated_win_rate != null && (
          <div>
            <p className="text-[10px] text-md-textMuted">Not Negated WR</p>
            <p className="text-sm font-semibold text-md-green">{card.not_negated_win_rate.toFixed(1)}%</p>
          </div>
        )}
      </div>

      {/* Sample size */}
      {card.negate_sample_size != null && card.negate_sample_size > 0 && (
        <p className="text-[10px] text-md-textMuted">
          Appeared in {card.negate_sample_size.toLocaleString()} games
        </p>
      )}
    </div>
  );
}
