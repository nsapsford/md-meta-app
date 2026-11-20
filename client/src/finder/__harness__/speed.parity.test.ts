// The speed gate: first-001…first-020 at PIN through both engines, three runs each (the best
// total time counts); the new engine must explore at least 90% as many positions per second as
// the reference.

import { describe, expect, it } from 'vitest';
import { loadDeckFiles } from './groupParity';
import { loadReference } from './loadReference';
import { newRoot } from './runSituation';
import { buildSituations, PIN, refRoot } from './situations';

const RUNS = 3;

describe('speed: positions per second against the reference', () => {
  it('the new engine explores at least 90% as many positions per second', () => {
    const { engine: ref, cards } = loadReference();
    const l = loadDeckFiles(); if (!l.ok) throw new Error(l.errors);
    const neu = l.engine;
    const sits = buildSituations(ref, cards).filter((s) => s.group === 'first').slice(0, 20);
    expect(sits.map((s) => s.id).at(-1)).toBe('first-020');

    const time = (solve: () => number): { nodes: number; ms: number } => {
      let best = Infinity, nodes = 0;
      for (let r = 0; r < RUNS; r++) {
        const t0 = performance.now();
        nodes = solve();
        best = Math.min(best, performance.now() - t0);
      }
      return { nodes, ms: best };
    };
    // Roots are built outside the timed part; both engines solve the same positions.
    const refRoots = sits.map((s) => refRoot(ref, s.cfg));
    const newRoots = sits.map((s) => newRoot(ref, neu, s));
    const a = time(() => refRoots.reduce((n, root) => n + ref.solveBeam(root, { ...PIN }).nodes, 0));
    const b = time(() => newRoots.reduce((n, root) => n + neu.solveBeam(root, { ...PIN }).nodes, 0));
    const ratio = (b.nodes / b.ms) / (a.nodes / a.ms);
    console.info(`speed: reference ${a.nodes} positions in ${a.ms.toFixed(0)} ms (${(a.nodes / a.ms).toFixed(1)}/ms); new ${b.nodes} in ${b.ms.toFixed(0)} ms (${(b.nodes / b.ms).toFixed(1)}/ms); ratio ${ratio.toFixed(3)}`);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });
});
