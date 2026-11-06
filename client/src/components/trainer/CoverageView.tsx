import { useMemo } from 'react';
import type { ComboLine } from '../../api/lines';
import { coverage } from '../../utils/trainer';
import { StatusBadge, pct } from './shared';

const TRIALS = 20_000;

/**
 * How often each line comes up from a real opening hand, estimated by drawing
 * 20,000 hands from the saved list. "Best" = how often it's the line you should
 * play, which is the order to learn them in.
 */
export default function CoverageView({ lines, mainDeck }: { lines: ComboLine[]; mainDeck: number[] }) {
  const drawable = useMemo(() => lines.filter((l) => l.starters.length > 0), [lines]);
  const first = useMemo(() => coverage(drawable, mainDeck, 5, TRIALS, 1), [drawable, mainDeck]);
  const second = useMemo(() => coverage(drawable, mainDeck, 6, TRIALS, 2), [drawable, mainDeck]);
  const byId = new Map(drawable.map((l) => [l.id, l]));
  const learnOrder = [...first.perLine].sort((a, b) => b.best - a.best);
  const noStarters = lines.length - drawable.length;

  if (mainDeck.length < 6) return <p className="text-sm text-md-textMuted">Save a full main deck to see coverage.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Going first (5 cards)" value={pct(first.any)} />
        <Stat label="Going second (6 cards)" value={pct(second.any)} />
      </div>
      <p className="text-xs text-md-textMuted">
        Share of opening hands where you can play at least one stored line. The rest are hands
        you either brick or haven't written a line for yet. The opening-hand drill lets you add lines from those hands.
      </p>

      {drawable.length === 0 ? (
        <p className="text-sm text-md-textMuted">No lines with starters yet.</p>
      ) : (
        <div className="rounded-xl border border-md-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 bg-md-surfaceAlt text-[10px] font-bold uppercase tracking-widest text-md-textMuted">
            <span>Line (learn in this order)</span>
            <span className="text-right">Playable</span>
            <span className="text-right">Best line</span>
          </div>
          {learnOrder.map((row) => {
            const l = byId.get(row.id)!;
            return (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 border-t border-md-border/50 items-center">
                <span className="text-sm text-md-text flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="truncate">{l.name}</span>
                  {l.status !== 'verified' && <StatusBadge line={l} />}
                </span>
                <span className="text-sm text-md-textSecondary text-right tabular-nums">{pct(row.playable)}</span>
                <span className="text-sm font-bold text-md-text text-right tabular-nums">{pct(row.best)}</span>
              </div>
            );
          })}
        </div>
      )}
      {noStarters > 0 && (
        <p className="text-[11px] text-md-orange">{noStarters} line{noStarters === 1 ? ' has' : 's have'} no starters set and {noStarters === 1 ? "isn't" : "aren't"} counted.</p>
      )}
      <p className="text-[11px] text-md-textMuted">Estimated from {TRIALS.toLocaleString()} simulated hands per column (about ±0.7%). Going-first figures.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-md-surface border border-md-border">
      <p className="text-[10px] font-bold uppercase tracking-widest text-md-textMuted">{label}</p>
      <p className="text-2xl font-extrabold text-md-text tabular-nums">{value}</p>
    </div>
  );
}
