import { describe, expect, it } from 'vitest';
import { compileDeck } from '../deck/compile';
import { createEngine } from './index';
import { TOY_FACTS, TOY_FILE, toyCfg } from './__toy__/toyDeck';

describe('createEngine', () => {
  const eng = createEngine(compileDeck(TOY_FILE, TOY_FACTS));
  const root = eng.newState(toyCfg({ SEEKER: 1, TUNER: 1 }));

  it('runs moves and records them on the path', () => {
    const a = eng.gen(root)[0];
    const n = eng.exec(root, a, false);
    expect(n.path).toEqual([a.k]);
    expect(eng.stateKey(n)).not.toBe(eng.stateKey(root));
    expect(eng.potential(root)).toBeGreaterThan(0);
    expect(eng.evaluate(root, true).items).not.toBeNull();
  });

  it('solves a line', () => {
    const r = eng.solveBeam(root, { width: 60, rounds: 1, timeMs: 3_600_000, strict: true });
    expect(r.errors).toBe(0);
    expect(r.lines[0].state!.path.slice(-1)[0]).toBe('syn:SYNC:SEEKER+TUNER');
  });
});
