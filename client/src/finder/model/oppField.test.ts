import { describe, expect, it } from 'vitest';
import type { IndexCard } from '../data/cardIndex';
import handTraps from '../deck/files/hand-traps.json';
import type { HandTrapFile } from '../deck/schema';
import { DEFAULT_SNAPSHOT, type FinderSnapshot } from './finderState';
import {
  addFromIndex, boardLabel, boardShort, fillMonByName, fillStByName, newMon, newSt, nextPos, nextUid, setAssumeOptions, unseenNote,
} from './oppField';

const TRAPS = handTraps as HandTrapFile;
const MON: IndexCard = { name: 'Some Synchro', mon: true, atk: 3000, def: 2400, attr: 'LIGHT', race: 'Plant', kind: 'synchro', intr: 'negAny' };
const ST: IndexCard = { name: 'Some Trap', mon: false, intr: 'negSummon', st: 'T' };
const snap = (o: Partial<FinderSnapshot['opp']> = {}): FinderSnapshot => ({ ...DEFAULT_SNAPSHOT, mode: 'second', opp: { lp: 8000, mons: [], st: [], ...o } });

describe('their field', () => {
  it('numbers new rows after the highest', () => {
    expect(nextUid(snap())).toBe('o1');
    expect(nextUid(snap({ mons: [newMon('o3')], st: [newSt('o1')] }))).toBe('o4');
  });
  it('adds a card from the index with its stats, kind and what it does', () => {
    const s = addFromIndex(addFromIndex(snap(), MON), ST);
    expect(s.opp.mons).toEqual([newMon('o1', { name: 'Some Synchro', atk: 3000, def: 2400, attr: 'LIGHT', race: 'Plant', kind: 'synchro', intr: 'negAny' })]);
    expect(s.opp.st).toEqual([newSt('o2', { name: 'Some Trap', intr: 'negSummon', stype: 'T' })]);
  });
  it('fills a row typed by name unless its stats were typed in; keeps position and flags', () => {
    const m = newMon('o2', { name: 'Some Synchro', pos: 'def', noTarget: true });
    expect(fillMonByName(m, MON)).toMatchObject({ uid: 'o2', atk: 3000, def: 2400, kind: 'synchro', pos: 'def', noTarget: true, intr: 'negAny' });
    const typed = { ...m, atk: 100 };
    expect(fillMonByName(typed, MON)).toBe(typed);
    expect(fillMonByName(m, ST)).toBe(m);
    expect(fillMonByName(m, undefined)).toBe(m);
    expect(fillStByName(newSt('o5', { name: 'Some Trap' }), ST)).toMatchObject({ uid: 'o5', intr: 'negSummon' });
    expect(fillStByName(newSt('o5', { intr: 'pop' }), ST)).toMatchObject({ intr: 'pop' });
  });
  it('cycles the position', () => {
    expect([nextPos('atk'), nextPos('def'), nextPos('set')]).toEqual(['def', 'set', 'atk']);
  });
  it('words the board kinds from the hand-trap data', () => {
    expect(boardLabel(TRAPS, 'negSummon')).toBe('Negates a summon');
    expect(boardLabel(TRAPS, 'nope')).toBe('Does nothing on your turn');
    expect([boardShort(TRAPS, 'negSummon'), boardShort(TRAPS, 'floodSpell'), boardShort(TRAPS, '')]).toEqual(['negates a summon', 'no Spells', '']);
    const o = setAssumeOptions(TRAPS);
    expect(o[0]).toEqual({ kind: '', label: 'do nothing' });
    expect(o.find((x) => x.kind === 'pop')!.label).toBe('remove a monster you summon');
    expect(o.some((x) => x.kind.startsWith('flood'))).toBe(false);
  });
  it('says how their hand size limits the hand traps', () => {
    expect(unseenNote({ oppHand: null, hts: ['a'], live: [] })).toBe('Hand size unknown: every hand trap switched on can be used.');
    expect(unseenNote({ oppHand: 1, hts: ['a', 'b'], live: [] })).toBe('They hold 1, so at most 1 of the 2 hand traps switched on are used against a line.');
    expect(unseenNote({ oppHand: 5, hts: ['a', 'b'], live: ['b'] })).toBe('They hold 5. Recording a hand trap they used lowers this.');
  });
});
