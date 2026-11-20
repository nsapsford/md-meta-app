import { describe, expect, it } from 'vitest';
import { ACCEPTED_EXPORT, ACCEPTED_EXPORT_TEXT, ACCEPTED_LEDGER, withoutAccepted } from './acceptedDiffs';
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
  it('accepts no export step differences', () => { expect(ACCEPTED_EXPORT).toEqual([]); });
  it('end-board text: only the trailing in-hand parts may be reordered', () => {
    expect(ACCEPTED_EXPORT_TEXT.test('A; Droll in hand; Ash in hand', 'A; Ash in hand; Droll in hand')).toBe(true);
    expect(ACCEPTED_EXPORT_TEXT.test('A; B; Ash in hand', 'B; A; Ash in hand')).toBe(false);
  });
});

describe('ACCEPTED_LEDGER: an effect restriction recorded by card name', () => {
  const msg = '"Witch" can\'t activate its effects this turn (it was summoned under a restriction that stops it).';
  const issue = (step: number) => ({ severity: 'error', step, message: msg });
  const restricted = { activations: [{ card: 'Curtain' }], summons: [{ card: 'Witch' }] };
  const own = { summons: [{ card: 'Witch' }] };
  const act = { activations: [{ card: 'Witch' }] };
  const accepted = (steps: object[], at: number) => ACCEPTED_LEDGER.some((a) => a.test(issue(at), steps));

  it('accepts an activation by a second copy summoned by its own procedure after the restricted one', () => {
    expect(accepted([restricted, own, act], 3)).toBe(true);
  });
  it('does not accept one copy, a restricted copy summoned last, or another message', () => {
    expect(accepted([restricted, act], 2)).toBe(false);
    expect(accepted([own, restricted, act], 3)).toBe(false);
    expect(accepted([restricted, own, act], 2)).toBe(false);
    expect(ACCEPTED_LEDGER.some((a) => a.test({ severity: 'error', step: 3, message: 'other' }, [restricted, own, act]))).toBe(false);
  });
  it('does not accept it when a copy left the field between the unrestricted summon and the activation', () => {
    const asMaterial = { summons: [{ card: 'Link', materials: ['Witch', 'Other'] }] };
    const sentOff = { moves: [{ card: 'Witch', from: 'field', to: 'gy' }] };
    expect(accepted([restricted, own, asMaterial, act], 4)).toBe(false);
    expect(accepted([restricted, own, sentOff, act], 4)).toBe(false);
    // Another card leaving, or a Witch moving elsewhere, changes nothing.
    expect(accepted([restricted, own, { summons: [{ card: 'Link', materials: ['Other'] }] }, { moves: [{ card: 'Witch', from: 'deck', to: 'hand' }] }, act], 5)).toBe(true);
  });
});
