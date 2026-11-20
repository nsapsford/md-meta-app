// The score gate: on every one of the 360 situations, at the pinned beam (PIN: one round of
// width 240, never clock-limited), the new engine's best line scores at least the reference's
// recorded best (baseline.json), within the 1e-9 summing-order tolerance.

import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../engine';
import { loadDeckFiles } from './groupParity';
import { loadReference } from './loadReference';
import { readBaseline, SCORE_EPS, solveNew } from './runSituation';
import { buildSituations, PIN } from './situations';

describe('score parity: the new engine scores at least the reference on every situation', () => {
  const { engine: ref, cards } = loadReference();
  const sits = buildSituations(ref, cards);
  const base = readBaseline();
  let neu: Engine;
  beforeAll(() => { const l = loadDeckFiles(); if (!l.ok) throw new Error(l.errors); neu = l.engine; });

  it('has 360 situations, each with a baseline row', () => {
    expect(sits).toHaveLength(360);
    expect(sits.filter((s) => !base.has(s.id)).map((s) => s.id)).toEqual([]);
  });

  for (const sit of sits) {
    it(sit.id, () => {
      const r = solveNew(ref, neu, sit, { ...PIN, strict: true });
      expect(r.lines[0].score).toBeGreaterThanOrEqual(base.get(sit.id)!.score - SCORE_EPS);
    });
  }
});
