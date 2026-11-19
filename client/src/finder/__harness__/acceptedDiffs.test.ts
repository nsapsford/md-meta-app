import { describe, expect, it } from 'vitest';
import { ACCEPTED_EXPORT, ACCEPTED_EXPORT_TEXT, withoutAccepted } from './acceptedDiffs';
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

describe('ACCEPTED_EXPORT', () => {
  const t = (a: object, b: object) => ACCEPTED_EXPORT.some((x) => x.test(a as never, b as never));
  const SARC = 'Activate Shining Sarcophagus.';
  it('accepts a Continuous Spell activation for the reference move (hand) or nothing (Set copy)', () => {
    expect(t({ text: SARC, moves: [{ card: 'Shining Sarcophagus', from: 'hand', to: 'field' }] }, { text: SARC, activations: [{ card: 'Shining Sarcophagus', from: 'hand' }] })).toBe(true);
    expect(t({ text: SARC }, { text: SARC, activations: [{ card: 'Shining Sarcophagus', from: 'field' }] })).toBe(true);
  });
  it('rejects mismatched zones, other cards and extra entries', () => {
    expect(t({ text: SARC }, { text: SARC, activations: [{ card: 'Shining Sarcophagus', from: 'hand' }] })).toBe(false);
    expect(t({ text: 'Activate X.' }, { text: 'Activate X.', activations: [{ card: 'X', from: 'field' }] })).toBe(false);
    expect(t({ text: SARC }, { text: SARC, activations: [{ card: 'Shining Sarcophagus', from: 'field' }], moves: [{ card: 'A', from: 'hand', to: 'gy' }] })).toBe(false);
  });
  it('end-board text: only the trailing in-hand parts may be reordered', () => {
    expect(ACCEPTED_EXPORT_TEXT.test('A; Droll in hand; Ash in hand', 'A; Ash in hand; Droll in hand')).toBe(true);
    expect(ACCEPTED_EXPORT_TEXT.test('A; B; Ash in hand', 'B; A; Ash in hand')).toBe(false);
  });
});
