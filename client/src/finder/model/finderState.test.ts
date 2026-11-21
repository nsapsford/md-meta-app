import { describe, expect, it } from 'vitest';
import dmFile from '../deck/files/dm-azamina.json';
import staples from '../deck/files/staples.json';
import handTraps from '../deck/files/hand-traps.json';
import { validateDeckFile, type DeckFile, type HandTrapFile } from '../deck/schema';
import { buildCfg, buildIntrs } from './buildCfg';
import { DEFAULT_SNAPSHOT, resolveList, restoreSnapshot, setMode, type FinderSnapshot, type OppMonInput, type OppStInput, type ResolvedList } from './finderState';

const TRAPS = handTraps as HandTrapFile;
const LIST: ResolvedList = { main: { ROD: 3, DM: 1 }, extra: { DRAG: 1 }, blanks: 0, unknown: [] };
const FILE: Pick<DeckFile, 'cards'> = { cards: [{ id: 'ROD', passcodes: [11, 12], short: 'Rod' }, { id: 'DRAG', passcodes: [21], short: 'Dragoon' }] };
const mon = (o: Partial<OppMonInput>): OppMonInput => ({ uid: 'o1', name: '', atk: 0, def: 0, pos: 'atk', attr: '?', race: '', kind: 'main', intr: '', uses: 1, noDestroy: false, noTarget: false, ...o });
const st = (o: Partial<OppStInput>): OppStInput => ({ uid: 's1', name: '', intr: '', uses: 1, noDestroy: false, noTarget: false, stype: 'T', ...o });
const second = (o: Partial<FinderSnapshot['opp']>, s: Partial<FinderSnapshot> = {}): FinderSnapshot => ({ ...setMode(DEFAULT_SNAPSHOT, 'second'), ...s, opp: { lp: 8000, mons: [], st: [], ...o } });

describe('the default setup', () => {
  it('goes first with Ash switched on and five cards in their hand', () => {
    expect(DEFAULT_SNAPSHOT).toEqual({ v: 1, mode: 'first', hand: [], hts: ['ash'], live: [], oppHand: 5, setAssume: '', opp: { lp: 8000, mons: [], st: [] } });
  });
  it('their hand is five going first and unknown going second', () => {
    expect(setMode(DEFAULT_SNAPSHOT, 'second')).toMatchObject({ mode: 'second', oppHand: null });
    expect(setMode({ ...DEFAULT_SNAPSHOT, mode: 'second', oppHand: null }, 'first')).toMatchObject({ mode: 'first', oppHand: 5 });
  });
});

describe('restoreSnapshot', () => {
  it('drops hand cards the list no longer has, and extra copies', () => {
    const s = restoreSnapshot({ v: 1, hand: ['ROD', 'ROD', 'GONE', 'UNK'] }, { main: { ROD: 1 }, extra: {}, blanks: 0, unknown: [] }, TRAPS);
    expect(s.hand).toEqual(['ROD', 'UNK']);
  });
  it('falls back to defaults for junk', () => {
    for (const raw of [null, 7, 'x', { v: 2 }, { v: 1, hand: 'no' }]) expect(restoreSnapshot(raw, LIST, TRAPS)).toEqual(DEFAULT_SNAPSHOT);
  });
  it('caps the hand at 7', () => {
    expect(restoreSnapshot({ v: 1, hand: Array(9).fill('UNK') }, LIST, TRAPS).hand).toHaveLength(7);
  });
  it('drops hand traps and live effects the data file does not have', () => {
    const s = restoreSnapshot({ v: 1, hts: ['ash', 'zzz'], live: ['fuwalos', 'zzz', 'ash'] }, LIST, TRAPS);
    expect([s.hts, s.live]).toEqual([['ash'], ['fuwalos']]);
  });
  it('keeps a saved setup, cleaning their field', () => {
    const raw = { v: 1, mode: 'second', hand: ['DM'], hts: [], live: [], oppHand: null, setAssume: 'negST', opp: { lp: 4000, mons: [{ name: 'Baronne', atk: 3000, pos: 'def', kind: 'synchro', intr: 'negAny', uses: 0, extra: 1 }, 'junk'], st: [{ name: '', stype: 'Q', intr: 'nonsense' }] } };
    const s = restoreSnapshot(raw, LIST, TRAPS);
    expect(s).toEqual({
      v: 1, mode: 'second', hand: ['DM'], hts: [], live: [], oppHand: null, setAssume: 'negST',
      opp: { lp: 4000, mons: [mon({ name: 'Baronne', atk: 3000, pos: 'def', kind: 'synchro', intr: 'negAny' })], st: [st({ uid: 'o2' })] },
    });
    expect(restoreSnapshot(s, LIST, TRAPS)).toEqual(s);
    expect(restoreSnapshot({ v: 1, mode: 'second' }, LIST, TRAPS).oppHand).toBeNull();
  });
});

describe('resolveList', () => {
  it('counts unknown cards as blanks', () => {
    expect(resolveList({ main: [{ passcode: 999, count: 2 }], extra: [] }, FILE)).toEqual({ main: {}, extra: {}, blanks: 2, unknown: [999] });
  });
  it('knows every passcode of a card, and the Extra Deck', () => {
    expect(resolveList({ main: [{ passcode: 11, count: 1 }, { passcode: 12, count: 2 }], extra: [{ passcode: 21, count: 1 }, { passcode: 22, count: 1 }] }, FILE))
      .toEqual({ main: { ROD: 3 }, extra: { DRAG: 1 }, blanks: 0, unknown: [22] });
  });
  it('reads the old tool\'s Droll passcode in the real deck file', () => {
    const r = validateDeckFile(dmFile, { staples });
    if (!r.ok) throw new Error('invalid');
    expect(resolveList({ main: [{ passcode: 94145022, count: 2 }, { passcode: 94145021, count: 1 }], extra: [] }, r.file)).toEqual({ main: { DROLL: 3 }, extra: {}, blanks: 0, unknown: [] });
  });
});

describe('buildCfg', () => {
  it('takes hand cards out of the deck; blanks are never in it', () => {
    const c = buildCfg({ ...DEFAULT_SNAPSHOT, hand: ['ROD', 'UNK'] }, { main: { ROD: 3 }, extra: {}, blanks: 2, unknown: [] });
    expect(c.deck).toEqual({ ROD: 2 });
    expect(c.hand).toEqual({ ROD: 1, UNK: 1 });
    expect(c.opp).toBeUndefined();
  });
  it('builds their field only going second, with the Set-card assumption', () => {
    const s = second({ lp: 0, mons: [mon({ name: 'Baronne', atk: 3000, kind: 'synchro', intr: 'negAny' }), mon({ uid: 'o2', pos: 'set' })], st: [st({}), st({ uid: 's2', name: 'Named' })] }, { setAssume: 'negST' });
    const c = buildCfg(s, LIST);
    expect(c.opp).toEqual({
      lp: 8000,
      mons: [
        { uid: 'o1', kind: 'mon', name: 'Baronne', atk: 3000, def: 0, pos: 'atk', attr: '?', race: '?', noDestroy: false, noTarget: false, faceDown: false, ext: true, intr: 'negAny' },
        { uid: 'o2', kind: 'mon', name: 'monster', atk: 0, def: 0, pos: 'set', attr: '?', race: '?', noDestroy: false, noTarget: false, faceDown: true, ext: false, intr: null },
      ],
      st: [
        { uid: 's1', kind: 'st', name: 'Set card', noDestroy: false, noTarget: false, intr: 'negST' },
        { uid: 's2', kind: 'st', name: 'Named', noDestroy: false, noTarget: false, intr: null },
      ],
    });
    expect(buildCfg({ ...s, mode: 'first' }, LIST).opp).toBeUndefined();
  });
  it('sets the live draw effects', () => {
    expect(buildCfg({ ...DEFAULT_SNAPSHOT, live: ['fuwalos', 'maxxc'] }, LIST, TRAPS).drawFx).toBe(1 | 4);
    expect(buildCfg(DEFAULT_SNAPSHOT, LIST, TRAPS).drawFx).toBeUndefined();
  });
});

describe('buildIntrs', () => {
  it('lists interruptions: switched-on hand traps not already live, board cards once per use, no floodgates, no face-down monsters', () => {
    const s = second({
      mons: [mon({ uid: 'm1', name: 'Apollousa', intr: 'negMon', uses: 2 }), mon({ uid: 'm2', intr: 'negAny', pos: 'set' }), mon({ uid: 'm3', intr: 'floodExtra' })],
      st: [st({ uid: 's1' }), st({ uid: 's2', name: 'Gate', intr: 'floodSpell' }), st({ uid: 's3', name: 'Dud' })],
    }, { hts: ['ash', 'nibiru', 'maxxc'], live: ['maxxc'], setAssume: 'negSummon' });
    expect(buildIntrs(s, TRAPS)).toEqual([
      { kind: 'negDeckTouch', src: 'hand', label: 'Ash Blossom', short: 'Ash', monster: true },
      { kind: 'wipeAtSummons', src: 'hand', label: 'Nibiru', short: 'Nibiru', monster: true, param: 5 },
      { kind: 'negMon', src: 'board', uid: 'm1', cardKind: 'mon', label: 'Apollousa' },
      { kind: 'negMon', src: 'board', uid: 'm1', cardKind: 'mon', label: 'Apollousa' },
      { kind: 'negSummon', src: 'board', uid: 's1', cardKind: 'st', label: 'An unknown Set card' },
    ]);
    expect(buildIntrs({ ...s, mode: 'first' }, TRAPS)).toHaveLength(2);
  });
});
