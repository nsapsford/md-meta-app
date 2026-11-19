// Worst case: they use every interruption they hold, one after another, each where it leaves you
// worst off. Runs on the page and farms branch searches out through `run` (Workers). Port of the
// reference's worstUse / worstRound / robust. Needs no deck.

import { drawBit, eligible } from './opponent';
import type { BranchTask } from './replay';
import type { SerializedLine } from './serialize';
import type { Cfg, CardId, Interruption } from './types';

export interface RobustOpts { handMax?: number; firstMoves?: number; from?: number; branchMs?: number; hand?: CardId[]; stopBelow?(): number; expired?(): boolean }
interface UseOpts extends RobustOpts { noHand?: boolean }
type Run = (t: BranchTask) => Promise<any>;
interface Use { r: SerializedLine; i: number; tried?: Use[] }
export interface Applied { it: Interruption; step: number | null }
export interface RobustResult { line: SerializedLine; applied: Applied[]; score: number; pruned?: boolean; partial?: boolean }

/** The mechanism that draws for every Special Summon may be live from the start even when they have cards on the field. */
const ANY_FIELD_DRAW = 'drawSpecialSummon';

// For one interruption: the step where it hurts most. Every eligible step gets a quick search;
// full searches then run from the most damaging up, until no remaining step can be worse.
async function worstUse(cfg: Cfg, cur: SerializedLine, it: Interruption, fromIdx: number, run: Run, opts: UseOpts): Promise<Use | null> {
  const steps: number[] = [];
  cur.steps.forEach((st, i) => { if (i >= fromIdx && eligible(st, it)) steps.push(i); });
  const oppEmpty = !(cfg.opp && (cfg.opp.mons.length + cfg.opp.st.length));
  const bit = drawBit(it.kind);
  if (bit && fromIdx === 0 && !(cfg.base && cfg.base.length) && !((cfg.drawFx || 0) & bit) && (it.kind === ANY_FIELD_DRAW || oppEmpty) && !cur.path.some((k) => k[0] === '!' || k[0] === '^')) steps.unshift(-1);
  if (!steps.length) return null;
  const task = (i: number, quick: boolean): BranchTask => (i < 0
    ? { type: 'branch', cfg, prefix: [], key: null, it, start: true, quick, timeMs: opts.branchMs || 250, hand: opts.hand || [] }
    : { type: 'branch', cfg, prefix: cur.path.slice(0, cur.steps[i].pathIdx), key: cur.steps[i].key, it, quick, timeMs: opts.branchMs || 250, hand: opts.hand || [] });
  const q = await Promise.all(steps.map((i) => run(task(i, true)).catch(() => null)));
  const order = steps.map((i, n) => ({ i, q: q[n] as { score: number } | null })).filter((x): x is { i: number; q: { score: number } } => !!x.q).sort((a, b) => a.q.score - b.q.score);
  // Assigned inside callbacks, so typed by assertion (a plain annotation narrows it to null here).
  let best = null as Use | null;
  const tried: Use[] = [];
  for (let n = 0; n < order.length; n += 2) {
    const b0 = best;
    if (b0 && order[n].q.score >= b0.r.score - 1e-9) break;
    const batch = order.slice(n, n + 2).filter((x) => !b0 || x.q.score < b0.r.score);
    const full = await Promise.all(batch.map((x) => run(task(x.i, false)).catch(() => null)));
    full.forEach((r: SerializedLine | null, k) => { if (!r) return; tried.push({ r, i: batch[k].i }); if (!best || r.score < best.r.score) best = { r, i: batch[k].i }; });
    if (opts.expired && opts.expired()) break;
  }
  if (best) best.tried = tried;
  return best;
}

const sameIntr = (a: Interruption, b: Interruption) => a.kind === b.kind && a.src === b.src && a.uid === b.uid;

// One round: the worst use of each interruption they still hold (identical copies tested once).
async function worstRound(cfg: Cfg, cur: SerializedLine, intrs: Interruption[], used: Set<number>, fromIdx: number, run: Run, opts: UseOpts): Promise<{ j: number; w: Use }[]> {
  const uniq: number[] = [];
  intrs.forEach((it, j) => { if (!used.has(j) && !(opts.noHand && it.src === 'hand') && !uniq.some((u) => sameIntr(intrs[u], it))) uniq.push(j); });
  const res = await Promise.all(uniq.map((j) => worstUse(cfg, cur, intrs[j], fromIdx, run, opts)));
  return uniq.map((j, n) => ({ j, w: res[n] })).filter((x): x is { j: number; w: Use } => !!x.w).sort((a, b) => a.w.r.score - b.w.r.score);
}

// An interruption that changes nothing by itself is still spent, because two of them together can.
// The first one is tried several ways (opts.firstMoves): the most damaging opener is not always their best plan.
export async function robust(cfg: Cfg, line: SerializedLine, intrs: Interruption[], run: Run, opts: RobustOpts = {}): Promise<RobustResult> {
  const handMax = opts.handMax == null ? Infinity : opts.handMax;
  const below = (sc: number) => !!opts.stopBelow && sc < opts.stopBelow();
  const expired = () => !!opts.expired && opts.expired();
  const unused = (used: Set<number>): Applied[] => { const rest: Applied[] = []; intrs.forEach((it, j) => { if (!used.has(j) && !rest.some((r) => sameIntr(r.it, it))) rest.push({ it, step: null }); }); return rest; };
  async function chain(cur: SerializedLine, applied: Applied[], used: Set<number>, fromIdx: number): Promise<RobustResult> {
    while (used.size < intrs.length) {
      if (below(cur.score)) return { line: cur, applied, score: cur.score, pruned: true };
      if (expired()) return { line: cur, applied, score: cur.score, partial: true };
      const spent = applied.filter((a) => a.step != null && a.it.src === 'hand').length;
      const round = await worstRound(cfg, cur, intrs, used, fromIdx, run, spent >= handMax ? { ...opts, noHand: true } : opts);
      if (!round.length) break;
      const x = round[0];
      used.add(x.j);
      applied = applied.concat([{ it: intrs[x.j], step: x.w.i }]);
      cur = x.w.r; fromIdx = x.w.i + 1;
    }
    return { line: cur, applied: applied.concat(unused(used)), score: cur.score };
  }
  const first = await worstRound(cfg, line, intrs, new Set(), opts.from || 0, run, handMax <= 0 ? { ...opts, noHand: true } : opts);
  const openers: { j: number; w: Use }[] = [];
  for (const x of first) for (const t of x.w.tried || [x.w]) openers.push({ j: x.j, w: t });
  openers.sort((a, b) => (a.w.r.score - b.w.r.score) || (a.w.i - b.w.i));
  openers.length = Math.min(openers.length, intrs.length > 1 ? (opts.firstMoves || 3) : 1);
  if (!openers.length) return { line, applied: unused(new Set()), score: line.score };
  if (below(openers[0].w.r.score)) return { line: openers[0].w.r, applied: [{ it: intrs[openers[0].j], step: openers[0].w.i }], score: openers[0].w.r.score, pruned: true };
  const outs = await Promise.all(openers.map((x) => chain(x.w.r, [{ it: intrs[x.j], step: x.w.i }], new Set([x.j]), x.w.i + 1)));
  let best = outs[0];
  for (const o of outs) if (o.score < best.score) best = o;
  return best;
}
