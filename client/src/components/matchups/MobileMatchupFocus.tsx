import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { MatchupMatrix } from '../../api/matchups';

type SortMode = 'best' | 'worst' | 'alpha';

function rateTint(rate: number): string {
  if (rate >= 0.60) return 'bg-md-green/25 border-md-green/30';
  if (rate >= 0.55) return 'bg-md-green/15 border-md-green/20';
  if (rate >= 0.48) return 'bg-md-surfaceAlt/40 border-md-border';
  if (rate >= 0.40) return 'bg-md-red/15 border-md-red/20';
  return 'bg-md-red/25 border-md-red/30';
}

function rateText(rate: number): string {
  if (rate >= 0.55) return 'text-md-green';
  if (rate >= 0.48) return 'text-md-textSecondary';
  return 'text-md-red';
}

export default function MobileMatchupFocus({ matrix, inferGaps }: { matrix: MatchupMatrix; inferGaps: boolean }) {
  const [selected, setSelected] = useState<string>(matrix.decks[0] ?? '');
  const [sort, setSort] = useState<SortMode>('best');

  const rows = useMemo(() => {
    if (!selected) return [];
    const r = matrix.decks
      .filter((d) => d !== selected)
      .map((opp) => ({
        opp,
        cell: matrix.matrix[selected]?.[opp],
      }))
      .filter((r) => r.cell);
    if (sort === 'alpha') return r.sort((a, b) => a.opp.localeCompare(b.opp));
    if (sort === 'worst') return r.sort((a, b) => (a.cell!.rate - b.cell!.rate));
    return r.sort((a, b) => (b.cell!.rate - a.cell!.rate));
  }, [matrix, selected, sort]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-1.5 block">Your deck</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full px-3 py-3 rounded-xl bg-md-surface border border-md-border text-md-text font-semibold focus:outline-none focus:border-md-blue"
        >
          {matrix.decks.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        {(['best', 'worst', 'alpha'] as SortMode[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSort(s)}
            className={clsx(
              'flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
              sort === s
                ? 'bg-md-blue/15 text-md-blue border-md-blue/30'
                : 'text-md-textMuted border-md-border'
            )}
          >
            {s === 'best' ? 'Best → Worst' : s === 'worst' ? 'Worst → Best' : 'A–Z'}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.length === 0 && (
          <p className="text-sm text-md-textMuted py-4 text-center">No matchup data for this deck.</p>
        )}
        {rows.map(({ opp, cell }) => {
          const pct = (cell!.rate * 100).toFixed(0);
          return (
            <Link
              key={opp}
              to={`/decks/${encodeURIComponent(opp)}`}
              className={clsx(
                'flex items-center justify-between px-3 py-3 rounded-xl border active:opacity-80 transition-opacity',
                rateTint(cell!.rate),
                cell!.inferred && 'border-dashed opacity-80'
              )}
            >
              <span className="font-semibold text-md-text min-w-0 truncate pr-2">
                {opp}
                {cell!.inferred && <span className="text-[10px] text-md-textMuted ml-1.5">(inferred)</span>}
              </span>
              <span className={clsx('font-bold text-base flex-shrink-0', rateText(cell!.rate))}>
                {pct}%
              </span>
            </Link>
          );
        })}
      </div>

      <p className="text-[11px] text-md-textMuted pt-2">
        Tap a row for full deck profile.{' '}
        {inferGaps && <span>Dashed rows are inferred from inverse/ecosystem models.</span>}
      </p>
    </div>
  );
}
