// Rebuilding lines from their paths (lets several Workers share the work), the plan a line stands
// for without its interruptions, and one branch of the worst-case search. Port of the reference's
// replay / planOf / asLine / branchTask.
//
// Path entries: `key` a move, `~key` the move negated, `!{k, it}` the move with their
// interruption on it, `^it` a draw effect live from the start of the turn, `@ev` a recorded event.

import type { LineEval } from './score';
import type { SolveOpts, SolveResult } from './search';
import type { SerializedLine, Serializer } from './serialize';
import type { Cfg, CardId, Interruption, Move, State, TurnEvent } from './types';

export interface BranchTask {
  type: 'branch'; cfg: Cfg; prefix: string[]; key: string | null; it: Interruption; start?: boolean; quick?: boolean;
  timeMs?: number; width?: number; maxWidth?: number; hand?: CardId[]; frontier?: boolean; drawPenalty?: number;
}
export type BranchResult = { score: number } | SerializedLine | { best: SerializedLine; frontier: SerializedLine[] } | null;

export interface ReplayCore {
  newState(cfg: Cfg): State;
  gen(s: State): Move[];
  exec(s: State, a: Move, neg: boolean): State;
  evaluate(s: State, full: boolean): LineEval;
  solveBeam(root: State, opts?: SolveOpts): SolveResult;
  interrupt(pre: State, act: Move, it: Interruption): State;
  startDraw(s: State, it: Interruption): State;
  applyEvent(s: State, ev: TurnEvent): State;
}

export interface Replayer {
  replay(cfg: Cfg, path: string[]): State;
  planOf(cfg: Cfg, path: string[]): LineEval;
  asLine(s: State): LineEval;
  branchTask(t: BranchTask): BranchResult;
}

/**
 * Every error replaying a path starts with this: the path no longer fits (a move it names is not
 * there, or a recorded event cannot have happened). The page tells these apart from other failures.
 */
export const REPLAY_ERROR = 'replay: ';
export const isReplayError = (message: string) => message.startsWith(REPLAY_ERROR);
/** A replay error's reason, without the marker. */
export const replayReason = (message: string) => (isReplayError(message) ? message.slice(REPLAY_ERROR.length) : message);

export function createReplay(e: ReplayCore, ser: Pick<Serializer, 'serializeLine'>): Replayer {
  const { gen, exec } = e;

  /** Run a move, marking the step it recorded with the position before it and the move. */
  function run(s: State, a: Move, neg: boolean): State {
    const n = exec(s, a, neg);
    const last = n.log[n.log.length - 1];
    if (last && last !== s.log[s.log.length - 1]) { last.pre = s; last.act = a; }
    return n;
  }

  function replay(cfg: Cfg, path: string[]): State {
    let s = e.newState(cfg);
    for (const k of path) {
      try {
        if (k[0] === '@') s = e.applyEvent(s, JSON.parse(k.slice(1)));
        else if (k[0] === '^') s = e.startDraw(s, JSON.parse(k.slice(1)));
        else if (k[0] === '!') {
          const o = JSON.parse(k.slice(1)) as { k: string; it: Interruption };
          const a = gen(s).find((x) => x.k === o.k);
          if (!a) throw new Error(REPLAY_ERROR + o.k);
          s = e.interrupt(s, a, o.it);
        } else {
          const neg = k[0] === '~';
          const key = neg ? k.slice(1) : k;
          const a = gen(s).find((x) => x.k === key);
          if (!a) throw new Error(REPLAY_ERROR + key);
          s = run(s, a, neg);
        }
      } catch (err) {
        const m = String((err as Error)?.message ?? err);
        throw isReplayError(m) ? err : new Error(REPLAY_ERROR + m);
      }
    }
    return s;
  }

  function asLine(s: State): LineEval { const ev = e.evaluate(s, true); ev.state = s; return ev; }

  // The same moves with no interruptions: what you would actually try to do. Tolerant: triggers
  // that only exist without the interruption are resolved with their first option, and moves that
  // stop being legal are skipped.
  function planOf(cfg: Cfg, path: string[]): LineEval {
    const bl = (cfg.base || []).length;
    const want = path.slice(bl).filter((k) => k[0] !== '^' && k[0] !== '@').map((k) => (k[0] === '!' ? (JSON.parse(k.slice(1)) as { k: string }).k : k[0] === '~' ? k.slice(1) : k));
    let s = bl ? replay(cfg, path.slice(0, bl)) : e.newState(cfg);
    const apply = (a: Move) => { s = run(s, a, false); };
    const base = (k: string) => k.replace(/#\d+$/, '');
    for (const k of want) {
      for (let guard = 0; guard < 6; guard++) {
        const acts = gen(s);
        const a = acts.find((x) => x.k === k) || acts.find((x) => base(x.k) === base(k));
        if (a) { apply(a); break; }
        if (!s.pend.length) break;
        apply(acts.find((x) => !x.k.startsWith('dec:')) || acts[0]);
      }
    }
    for (let guard = 0; guard < 6 && s.pend.length; guard++) { const acts = gen(s); apply(acts.find((x) => !x.k.startsWith('dec:')) || acts[0]); }
    // Finish the plan: the bait line stops where the interrupted version diverged.
    const more = e.solveBeam(s, { timeMs: 300, width: 48, growth: 4, maxWidth: 768, converge: true });
    const fin = more.lines[0];
    return fin && fin.score > e.evaluate(s, false).score ? fin : asLine(s);
  }

  // One branch: replay to a step, let them interrupt it, find your best continuation.
  function branchTask(t: BranchTask): BranchResult {
    const cfg = t.drawPenalty != null ? { ...t.cfg, drawPenalty: t.drawPenalty } : t.cfg;
    let n: State;
    if (t.start) n = e.startDraw(replay(cfg, t.prefix || []), t.it);
    else {
      const s = replay(cfg, t.prefix);
      const a = gen(s).find((x) => x.k === t.key);
      if (!a) return null;
      n = e.interrupt(s, a, t.it);
    }
    const w = t.width || 48;
    if (t.quick) {
      const q = e.solveBeam(n, { timeMs: 200, width: w, rounds: 1, top: 1 });
      return { score: q.lines[0] ? q.lines[0].score : e.evaluate(n, false).score };
    }
    const r = e.solveBeam(n, { timeMs: t.timeMs || 250, width: w, growth: 4, maxWidth: t.maxWidth || 768, converge: true });
    const best = r.lines[0] || asLine(n);
    if (t.frontier) return { best: ser.serializeLine(best, t.hand || [], 'branch'), frontier: (r.frontier || []).map((l) => ser.serializeLine(l, t.hand || [], 'branch')) };
    return ser.serializeLine(best, t.hand || [], 'branch');
  }

  return { replay, planOf, asLine, branchTask };
}
