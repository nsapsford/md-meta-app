// Interruption parity: for each of the 54 `trap` situations, walk the reference's unpoliced best
// line ({ width: 60, rounds: 1 }) on both engines, and at every step try each interruption of the
// situation's policy. Where the reference finds it eligible, both engines must agree that it is,
// and the interrupted results must look the same: position, step text and interruption note.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../engine';
import type { State, StepView } from '../engine/types';
import { loadDeckFiles } from './groupParity';
import { loadReference, refExec } from './loadReference';
import { toCfg, toIntr } from './mapping';
import { newObserve, refObserve } from './observe';
import { translatePath } from './lockstep';
import { buildSituations } from './situations';

function refView(s: any, a: any, n: any): StepView | null {
  const last = n.log.length ? n.log[n.log.length - 1] : null;
  if (!last || last === s.log[s.log.length - 1]) return null;
  return {
    tags: last.tags, canNeg: a.neg, summonsAfter: n.summons, summoned: last.ns > 0, oppCount: s.opp ? s.opp.mons.length + s.opp.st.length : 0,
    oppPresent: s.opp ? s.opp.mons.filter((m: any) => !m.faceDown).map((m: any) => m.uid).concat(s.opp.st.map((x: any) => x.uid)) : [],
  } as any;
}
function newView(s: State, a: { neg: boolean }, n: State): StepView | null {
  const last = n.log.length ? n.log[n.log.length - 1] : null;
  if (!last || last === s.log[s.log.length - 1]) return null;
  return {
    tags: last.tags, canNeg: a.neg, summonsAfter: n.summons, summoned: last.ns > 0, oppCount: s.opp ? s.opp.mons.length + s.opp.st.length : 0,
    oppPresent: s.opp ? s.opp.mons.filter((m) => !m.faceDown).map((m) => m.uid).concat(s.opp.st.map((x) => x.uid)) : [],
  };
}
const lastOf = (pre: any, n: any) => { const l = n.log[n.log.length - 1]; return l && l !== pre.log[pre.log.length - 1] ? l : null; };

describe('interrupt parity: trap situations', () => {
  const { engine: ref, cards } = loadReference();
  const sits = buildSituations(ref, cards).filter((s) => s.group === 'trap');
  let neu: Engine;
  beforeAll(() => { const l = loadDeckFiles(); if (!l.ok) throw new Error(l.errors); neu = l.engine; });

  let total = 0;
  it('has 54 trap situations', () => { expect(sits.length).toBe(54); });
  afterAll(() => { console.info(`interrupt parity: ${total} (step, interruption) pairs compared`); expect(total).toBeGreaterThan(100); });

  for (const sit of sits) {
    it(sit.id, () => {
      const refPath: string[] = ref.solveBeam(ref.newState(sit.cfg), { width: 60, rounds: 1, timeMs: 3_600_000 }).lines[0].state.path;
      const newPath = translatePath(ref, neu, sit.cfg, refPath);
      let sa = ref.newState(sit.cfg), sb = neu.newState(toCfg(sit.cfg));
      const diffs: string[] = [];
      let tested = 0;
      refPath.forEach((k, i) => {
        const neg = k[0] === '~';
        const ra = ref.gen(sa).find((x) => x.k === (neg ? k.slice(1) : k))!;
        const nk = newPath[i];
        const nb = neu.gen(sb).find((x) => x.k === (neg ? nk.slice(1) : nk))!;
        const na = refExec(sa, ra, neg), nn = neu.exec(sb, nb, neg);
        const va = refView(sa, ra, na), vb = newView(sb, nb, nn);
        for (const rit of sit.policy ?? []) {
          const it = toIntr(rit);
          const ea = !!va && ref.eligible(va, rit), eb = !!vb && neu.eligible(vb, it);
          if (ea !== eb) { diffs.push(`step ${i + 1} (${k}) ${rit.kind}: eligible ${ea} vs ${eb}`); continue; }
          if (!ea) continue;
          tested++;
          // Both may throw: a protection's cost can take the very card the step needs (Dragoon
          // discarding the card being activated); the search then drops the move on both sides.
          const res = (f: () => any, obs: (x: any) => string, pre: any) => {
            let x: any;
            try { x = f(); } catch { return 'throws'; }
            const l = lastOf(pre, x);
            return JSON.stringify([obs(x), l?.text ?? '', l?.interrupted ?? null]);
          };
          const oa = res(() => ref.interrupt(sa, ra, rit), (x) => refObserve(ref, x), sa);
          const ob = res(() => neu.interrupt(sb, nb, it), (x) => newObserve(neu, x), sb);
          if (oa !== ob) diffs.push(`step ${i + 1} (${k}) ${rit.kind}:\n  ref ${oa}\n  new ${ob}`);
        }
        sa = na; sb = nn;
      });
      total += tested;
      expect(diffs.join('\n')).toBe('');
    });
  }
});
