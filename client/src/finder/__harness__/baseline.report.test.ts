import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadReference } from './loadReference';
import { buildSituations, refRoot, PIN, type BaselineRow } from './situations';

describe('reference baseline', () => {
  it('records the reference best line for every situation (and is repeatable)', () => {
    const { engine, cards } = loadReference();
    const sits = buildSituations(engine, cards);
    const run = (): BaselineRow[] => sits.map((s) => {
      const r = engine.solveBeam(refRoot(engine, s.cfg), { ...PIN, policy: s.policy });
      return { id: s.id, score: r.lines[0].score, path: r.lines[0].state.path, nodes: r.nodes };
    }).sort((a, b) => (a.id < b.id ? -1 : 1));
    const a = run(), b = run();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a).toHaveLength(360);
    writeFileSync(fileURLToPath(new URL('./baseline.json', import.meta.url)), JSON.stringify(a, null, 2) + '\n');
  });
});
