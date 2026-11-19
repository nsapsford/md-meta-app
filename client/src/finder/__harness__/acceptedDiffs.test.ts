import { describe, expect, it } from 'vitest';
import { withoutAccepted } from './acceptedDiffs';
import type { MoveView, StepDiff } from './lockstep';

const mv = (key: string, pend: string[], text = 'Master of Chaos: Special Summon DMG Apprentice from GY.'): MoveView =>
  ({ key, text, tags: ['fieldMon'], negatable: true, negated: false, obs: JSON.stringify({ pend, opts: [] }) });
const step = (missing: MoveView[], extra: MoveView[]): StepDiff[] => [{ situation: 's', depth: 1, path: [], missing, extra, evalDiff: null }];

describe('ACCEPTED: Master of Chaos revives are accepted only in pairs', () => {
  it('accepts a missing revive with its counterpart (same revive, dmg1 pending first) at the same step', () => {
    expect(withoutAccepted(step([mv('moc1:DMG', [])], [mv('moc1:DMG', ['dmg1'])]))).toEqual([]);
  });

  it('does not accept a plain missing revive', () => {
    expect(withoutAccepted(step([mv('moc1:DMG', [])], []))[0].missing).toHaveLength(1);
  });

  it('does not accept a lone extra revive, or a pair whose texts or triggers differ', () => {
    expect(withoutAccepted(step([], [mv('moc1:DMG', ['dmg1'])]))[0].extra).toHaveLength(1);
    const r = withoutAccepted(step([mv('moc1:DMG', [], 'other text')], [mv('moc1:DMG', ['dmg1'])]))[0];
    expect([r.missing.length, r.extra.length]).toEqual([1, 1]);
    expect(withoutAccepted(step([mv('moc1:DIA', [])], [mv('moc1:DIA', ['dmg1'])]))[0].missing).toHaveLength(1);
  });
});
