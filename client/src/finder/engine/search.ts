// Beam search over a turn: layer by layer, keep the `width` positions with the best
// score + potential, repeat with a wider beam until time runs out (or the answer stops improving).
// Port of the reference's topK / solveBeam, including the draw trade-off frontier, the safest
// lethal line, the greedy-opponent `policy` hook and the clock check every 8 positions expanded.
// One difference: a move that throws is counted in `errors` (and rethrown with `strict`) where the
// reference skipped it silently.

import type { Moves } from './moves';
import type { LineEval, Score } from './score';
import type { StateOps } from './state';
import type { Interruption, Move, State, StepView } from './types';

export interface SolveOpts {
  timeMs?: number; top?: number; width?: number; growth?: number; maxWidth?: number; rounds?: number; converge?: boolean;
  policy?: Interruption[]; onRound?(r: SolveResult): void; strict?: boolean;
}

export interface SolveResult {
  lines: LineEval[]; safest: LineEval | null; frontier: LineEval[] | null; all: LineEval[];
  nodes: number; ms: number; width: number; rounds: number; errors: number;
}

export interface SearchHooks {
  eligible(v: StepView, it: Interruption): boolean;
  interrupt(pre: State, act: Move, it: Interruption): State;
}

/** Indices of the k largest values of h[0..m), best first (ties: earlier index first). */
export function topK(h: ArrayLike<number>, m: number, k: number): number[] {
  const ord = new Int32Array(m);
  for (let i = 0; i < m; i++) ord[i] = i;
  if (m > k) {
    let lo = 0, hi = m - 1;
    while (lo < hi) {
      const p = ord[(lo + hi) >> 1], hp = h[p];
      let i = lo, j = hi;
      while (i <= j) {
        while (h[ord[i]] > hp || (h[ord[i]] === hp && ord[i] < p)) i++;
        while (hp > h[ord[j]] || (hp === h[ord[j]] && p < ord[j])) j--;
        if (i <= j) { const t = ord[i]; ord[i] = ord[j]; ord[j] = t; i++; j--; }
      }
      if (k - 1 <= j) hi = j; else if (k - 1 >= i) lo = i; else break;
    }
  }
  const top = Array.from(ord.subarray(0, Math.min(k, m)));
  top.sort((x, y) => (h[y] - h[x]) || (x - y));
  return top;
}

/**
 * A set of position keys (integers in 0..2^53, as stateKey returns): open addressing on the key's
 * two halves in typed arrays. Holds the same keys a Set<number> would, without boxing each one.
 */
export class KeySet {
  private lo: Int32Array;
  private hi: Int32Array;   // high half + 1; 0 marks an empty slot
  private mask: number;
  size = 0;

  constructor(capacity = 1024) {
    let c = 16;
    while (c < capacity * 2) c *= 2;
    this.lo = new Int32Array(c); this.hi = new Int32Array(c); this.mask = c - 1;
  }

  /** Add `k`; false when it was already there. */
  add(k: number): boolean {
    const lo = k | 0, hi = ((k / 4294967296) | 0) + 1;
    const L = this.lo, H = this.hi, mask = this.mask;
    let h = Math.imul(lo ^ Math.imul(hi, 0x85ebca6b), 0x9e3779b1);
    h = (h ^ (h >>> 15)) & mask;
    for (;;) {
      const x = H[h];
      if (x === 0) break;
      if (x === hi && L[h] === lo) return false;
      h = (h + 1) & mask;
    }
    H[h] = hi; L[h] = lo;
    if (++this.size * 2 > mask) this.grow();
    return true;
  }

  has(k: number): boolean {
    const lo = k | 0, hi = ((k / 4294967296) | 0) + 1;
    const L = this.lo, H = this.hi, mask = this.mask;
    let h = Math.imul(lo ^ Math.imul(hi, 0x85ebca6b), 0x9e3779b1);
    h = (h ^ (h >>> 15)) & mask;
    for (;;) {
      const x = H[h];
      if (x === 0) return false;
      if (x === hi && L[h] === lo) return true;
      h = (h + 1) & mask;
    }
  }

  private grow(): void {
    const L = this.lo, H = this.hi;
    const c = H.length * 2, mask = c - 1;
    const L2 = new Int32Array(c), H2 = new Int32Array(c);
    for (let i = 0; i < H.length; i++) {
      const hi = H[i];
      if (hi === 0) continue;
      const lo = L[i];
      let h = Math.imul(lo ^ Math.imul(hi, 0x85ebca6b), 0x9e3779b1);
      h = (h ^ (h >>> 15)) & mask;
      while (H2[h] !== 0) h = (h + 1) & mask;
      H2[h] = hi; L2[h] = lo;
    }
    this.lo = L2; this.hi = H2; this.mask = mask;
  }
}

export function createSearch(moves: Moves, score: Score, ops: Pick<StateOps, 'stateKey'>, hooks?: SearchHooks): { solveBeam(root: State, opts?: SolveOpts): SolveResult } {
  const { gen, exec } = moves;
  const { evaluate, quick, boardSig, potential } = score;
  const { stateKey } = ops;

  function solveBeam(root: State, opts: SolveOpts = {}): SolveResult {
    if (opts.policy && !hooks) throw new Error('solveBeam: `policy` needs the interruption hooks (createSearch(..., hooks))');
    const timeMs = opts.timeMs || 2500;
    const K = opts.top || 3;
    const t0 = Date.now();
    const growth = opts.growth || 2;
    const strict = !!opts.strict;
    let nodes = 0, width = opts.width || 150, rounds = 0, iter = 0, errors = 0;
    const maxWidth = opts.maxWidth || Infinity;
    const best: LineEval[] = [];
    let safest: LineEval | null = null, safestRisk = Infinity;
    const cap = K * 6;
    const front: { raw: number; s: State }[] = [];

    /** A finished line: kept among the best, the draw frontier and the safest lethal line when it earns it. Returns its score. */
    function consider(s: State): number {
      const q = quick(s);
      const score = q.score, raw = q.raw, lethal = q.lethal;
      if (s.drawFx) {
        const d = Math.min(s.oppDraws, 15), f = front[d];
        if (!f || raw > f.raw + 1e-9 || (raw > f.raw - 1e-9 && s.log.length < f.s.log.length)) front[d] = { raw, s };
      }
      if (lethal) {
        const rk = s.cDeckTouch * 3 + s.cDeckAdd * 2 + s.cFieldMon + s.log.length * 0.5;
        if (rk < safestRisk) { safestRisk = rk; safest = evaluate(s, true); safest.state = s; safest.sig = boardSig(safest); }
      }
      if (best.length >= cap && score <= best[best.length - 1].score) return score;
      const e = evaluate(s, false);
      const sig = boardSig(e);
      const j = best.findIndex((b) => b.sig === sig);
      if (j >= 0) { if (best[j].score >= score) return score; best.splice(j, 1); }
      const fe = evaluate(s, true);
      fe.sig = sig; fe.state = s;
      best.push(fe); best.sort((a, b) => b.score - a.score);
      if (best.length > cap) best.length = cap;
      return score;
    }

    function result(): SolveResult {
      const lines = best.slice(0, K);
      for (const b of best) b.safest = false;
      let sf: LineEval | null = safest;
      if (sf) {
        const st = sf.state;
        const hit = lines.find((x) => x.state === st);
        if (hit) { hit.safest = true; sf = hit; } else sf.safest = true;
      }
      // Draw trade-off: for each number of draws, the best board reachable, kept only if it beats every cheaper one.
      let frontier: LineEval[] | null = null;
      if (front.length) {
        frontier = [];
        let top = -Infinity;
        for (let d = 0; d < front.length; d++) {
          const f = front[d];
          if (!f || f.raw <= top + 0.5) continue;
          top = f.raw;
          const fe = evaluate(f.s, true); fe.state = f.s;
          frontier.push(fe);
        }
      }
      return { lines, safest: sf, frontier, all: best, nodes, ms: Date.now() - t0, width, rounds, errors };
    }

    function fail(e: unknown): void {
      errors++;
      if (strict) throw e;
    }

    if (!root.pend.length) consider(root);
    let timeUp = false, lastTop = -Infinity;
    while (!timeUp) {
      rounds++;
      let layer = [root];
      const seen = new KeySet(Math.min(width * 8, 1 << 16));
      seen.add(stateKey(root));
      for (let depth = 0; depth < 26 && layer.length && !timeUp; depth++) {
        const nextS: State[] = [], nextH: number[] = [];
        for (let li = 0; li < layer.length; li++) {
          const s = layer[li];
          let acts: Move[];
          try { acts = gen(s); } catch (e) { fail(e); continue; }
          const sLast = s.log.length ? s.log[s.log.length - 1] : null;
          for (let ai = 0; ai < acts.length; ai++) {
            const a = acts[ai];
            let n: State;
            try { n = exec(s, a, false); } catch (e) { fail(e); continue; }
            if (!n) continue;
            nodes++;
            const last = n.log.length ? n.log[n.log.length - 1] : null;
            if (last && last !== sLast) {
              last.pre = s; last.act = a;
              if (opts.policy) {
                // Greedy opponent: spends the first unspent interruption that can hit this step.
                const view: StepView = {
                  tags: last.tags, canNeg: a.neg, summonsAfter: n.summons, summoned: last.ns > 0, oppCount: s.opp ? s.opp.mons.length + s.opp.st.length : 0,
                  oppPresent: s.opp ? s.opp.mons.filter((m) => !m.faceDown).map((m) => m.uid).concat(s.opp.st.map((x) => x.uid)) : [],
                };
                const h = hooks!;
                const j = opts.policy.findIndex((it, q) => !(s.spent && s.spent[q]) && h.eligible(view, it));
                if (j >= 0) {
                  try { n = h.interrupt(s, a, opts.policy[j]); n.spent = { ...(s.spent || {}), [j]: true }; } catch (e) { fail(e); continue; }
                }
              }
            }
            if (!seen.add(stateKey(n))) continue;
            const sc = n.pend.length ? quick(n).score : consider(n);
            nextS.push(n); nextH.push(sc + potential(n));
          }
          if ((++iter & 7) === 0 && Date.now() - t0 > timeMs) { timeUp = true; break; }
        }
        const pick = topK(nextH, nextS.length, width);
        layer = pick.map((i) => nextS[i]);
      }
      const top = best.length ? best[0].score : -Infinity;
      if (opts.onRound) opts.onRound(result());
      if (opts.rounds && rounds >= opts.rounds) break;
      if (opts.converge && rounds >= 2 && !timeUp && top <= lastTop + 1e-9) break;
      lastTop = top;
      if (width * growth > maxWidth) break;
      width *= growth;
      if (Date.now() - t0 > timeMs) break;
    }
    return result();
  }

  return { solveBeam };
}
