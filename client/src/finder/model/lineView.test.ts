import { describe, expect, it } from 'vitest';
import handTraps from '../deck/files/hand-traps.json';
import type { HandTrapFile } from '../deck/schema';
import type { RobustResult } from '../engine/robust';
import type { SerializedLine, SerializedStep } from '../engine/serialize';
import type { Interruption } from '../engine/types';
import {
  boardShort, branchTitle, drawNames, eventText, hardCount, headline, howItDecides, lineFacts, NEGATE, oppAddMon,
  recordOptions, resultTabs, statusText, stepMarks, stopCards, tradeNote, verdictText, whatIfOptions, worstDetail,
} from './lineView';
import type { SessionView } from './solveSession';

const TRAPS = handTraps as HandTrapFile;
const trap = (id: string) => TRAPS.traps.find((t) => t.id === id)!;
const asIt = (id: string): Interruption => { const t = trap(id); return { kind: t.mechanism, src: 'hand', label: t.label, short: t.short, monster: t.monster, ...(t.param !== undefined ? { param: t.param } : {}) }; };

function step(o: Partial<SerializedStep> = {}): SerializedStep {
  return { pathIdx: 0, key: 'k', ev: false, mons: [], sts: [], oppPresent: [], summoned: false, extraSummon: false, draws: 0, oppCount: 0, text: 't', tags: {}, interrupted: null, summonsAfter: 0, canNeg: true, wipeHere: false, firstDeckAdd: false, notes: [], lineNote: null, ...o };
}
function line(o: Partial<SerializedLine> = {}): SerializedLine {
  return {
    tag: 'Line', score: 200, summary: { draws: 0, eff: 0, raw: 200 }, items: [['A: negate', 1], ['B: banish', 0.9], ['C (Set)', 0.4], ['D', 0.1]], sets: [], chokes: null, safest: false,
    path: ['a', 'b'], steps: [step({ key: 'a' }), step({ key: 'b', pathIdx: 1, wipeHere: true, tags: { deckTouch: true } })], summons: 5, opening: [], drawFx: 0,
    board: { mons: [], st: [], hand: {}, lp: 8000, opp: [] }, generated: { name: 'x', starters: [], steps: [], endBoard: [] }, ...o,
  } as SerializedLine;
}

describe('a line in words', () => {
  it('headlines interruptions going first, lethal or LP left going second', () => {
    const l = line();
    expect(hardCount(l)).toBe(2);
    expect(headline(l, 'first')).toEqual({ big: '2', small: 'interruptions', tone: 'plain' });
    expect(boardShort(l, 'first')).toBe('2 interruptions + 1 soft');
    expect(headline(line({ summary: { lethal: true, battle: 7000, burn: 1000 } }), 'second')).toEqual({ big: 'Lethal', small: '8,000 dmg', tone: 'good' });
    expect(headline(line({ summary: { oppLp: 8000, battle: 2500 } }), 'second')).toEqual({ big: '5,500', small: 'LP left', tone: 'warn' });
  });
  it('titles the verdict and lists its pills', () => {
    expect(verdictText(line(), 'first')).toEqual({ title: 'hard interruptions on their turn', pills: [{ text: 'A', soft: false }, { text: 'B', soft: false }, { text: 'C', soft: true }] });
    const v = verdictText(line({ summary: { lethal: true, battle: 8000, burn: 0, oppLp: 8000, removed: 2 } }), 'second');
    expect(v.title).toBe('8,000 battle damage into 8,000 LP');
    expect(v.pills[0]).toEqual({ text: 'Removes 2 cards', soft: false });
  });
  it('counts steps, summons, Deck touches and the wipe window from the hand-trap data', () => {
    expect(lineFacts(line(), TRAPS)).toEqual(['2 steps', '5 summons', '1 from the Deck', `${trap('nibiru').short} from step 2`]);
    expect(lineFacts(line({ steps: [] }), TRAPS)[3]).toBe(`No ${trap('nibiru').short} window`);
  });
  it('prices a board under a draw effect', () => {
    const bit = 1;
    const t = tradeNote(line({ summary: { draws: 2, eff: 1 } }), bit, TRAPS)!;
    expect(t.title).toBe('They draw 2 cards for this board');
    expect(t.sub).toMatch(/They keep 1 of them after the End Phase hand limit\.$/);
    expect(tradeNote(line(), 0, TRAPS)).toBeNull();
    expect(drawNames(1, TRAPS)).toBe(trap('fuwalos').short);
  });
  it('says what the worst case was', () => {
    const it = asIt('ash');
    const w = (score: number, applied: RobustResult['applied']): RobustResult => ({ line: line({ score }), applied, score });
    expect(worstDetail({ line: line(), worst: null })).toBeNull();
    expect(worstDetail({ line: line(), worst: w(100, [{ it, step: 1 }, { it: asIt('droll'), step: null }]) }))
      .toEqual({ sub: `Their best play: ${it.label} on step 2. ${trap('droll').label} has nothing left to hit.`, hasLine: true, firstHit: { step: 1, label: it.label } });
    expect(worstDetail({ line: line(), worst: w(200, [{ it, step: 0 }]) })!.sub).toBe(`Even with ${it.label} on step 1, you have another route to the same result.`);
  });
});

describe('steps', () => {
  const intrs = [asIt('ash'), asIt('ash'), asIt('fuwalos')];
  it('marks which chosen interruptions can hit a step, and the answers ready', () => {
    const s = step({ tags: { deckTouch: true }, notes: ['n1'], draws: 1 });
    expect(stepMarks(s, intrs, [{ label: 'Guard (discard 1)', stepNote: 'n1' }], 'X')).toEqual([
      { text: 'Worst case: X', tone: 'hit' },
      { text: 'They draw 1', tone: 'draw', title: 'A summon that their draw effect counts' },
      { text: trap('ash').short, tone: 'on', title: `${trap('ash').short} can hit this step` },
      { text: 'Guard can answer', tone: 'safe', title: 'You have an answer ready at this point' },
    ]);
    expect(stepMarks(step({ tags: { noResp: true }, notes: ['n1'] }), intrs, [])).toEqual([{ text: 'No response possible', tone: 'safe' }]);
  });
  it('offers what-ifs for the eligible chosen interruptions and a plain negation', () => {
    expect(whatIfOptions(step({ tags: { deckTouch: true } }), intrs).map((o) => o.label)).toEqual(['Negated here', `${trap('ash').short} here`, `${trap('fuwalos').short} here`]);
    expect(whatIfOptions(step({ canNeg: false, oppCount: 1 }), intrs)).toEqual([]);
    expect(whatIfOptions(step({ ev: true }), intrs)).toEqual([]);
  });
  it('titles a branch', () => {
    expect(branchTitle(0, NEGATE, step())).toBe('If step 1 is negated');
    expect(branchTitle(2, asIt('fuwalos'), step())).toBe(`If they chain ${trap('fuwalos').short} to step 3`);
    expect(branchTitle(2, asIt('maxxc'), step({ tags: { inherent: true } }))).toBe(`If they answer step 3 with ${trap('maxxc').short}`);
    expect(branchTitle(1, asIt('ash'), step())).toBe(`If they use ${trap('ash').short} on step 2`);
  });
  it('lists what can be recorded after a step', () => {
    const types = recordOptions(step({ tags: { deckAdd: true }, summonsAfter: 5, mons: ['X'] }), TRAPS).map((o) => o.type);
    expect(types).toEqual(['stop', 'trap:droll', 'trap:nibiru', 'trap:fuwalos', 'trap:purulia', 'trap:maxxc', 'lose', 'gain', 'oppAdd']);
    expect(recordOptions(step({ canNeg: false, oppCount: 2 }), TRAPS).map((o) => o.type)).toEqual(['trap:maxxc', 'gain', 'oppAdd']);
    expect(stopCards(TRAPS).map((t) => t.id)).toEqual(['ash', 'imperm', 'veiler', 'belle']);
  });
  it('words recorded events', () => {
    const short = (id: string) => `<${id}>`;
    expect(eventText({ t: 'hit', step: 1, it: NEGATE }, short)).toBe('Step 2 stopped');
    expect(eventText({ t: 'hit', step: 1, it: { ...NEGATE, label: 'Their card' } }, short)).toBe('Step 2 stopped by Their card');
    expect(eventText({ t: 'hit', step: 0, it: asIt('droll') }, short)).toBe(`${trap('droll').label} on step 1`);
    expect(eventText({ t: 'lose', id: 'X', to: 'ban' }, short)).toBe('Lost <X> (banished)');
    expect(eventText({ t: 'gain', id: 'X' }, short)).toBe('<X> in hand');
    expect(eventText({ t: 'oppAdd', mon: { name: 'M' } }, short)).toBe('They summoned M');
  });
  it('builds the monster they summoned from the index; only a floodgate is kept', () => {
    expect(oppAddMon('x', { name: 'M', mon: true, atk: 1, def: 2, attr: 'DARK', race: 'Fiend', kind: 'link', intr: 'negAny' }, 'e1'))
      .toEqual({ uid: 'e1', name: 'M', atk: 1, def: 2, attr: 'DARK', race: 'Fiend', ext: true, intr: null });
    expect(oppAddMon('x', { name: 'M', mon: true, kind: 'main', intr: 'floodExtra' }, 'e1').intr).toBe('floodExtra');
    expect(oppAddMon('  ', undefined, 'e2')).toEqual({ uid: 'e2', name: 'a monster' });
  });
});

describe('the line tabs', () => {
  const vl = (key: string, badges: string[] = []) => ({ key, line: line(), worst: null, badges, testing: false });
  const L = ['a', 'b', 'c', 'd', 'e'].map((k) => vl(k));
  it('shows three lines, then the selected or better one, then safest lethal', () => {
    const safest = vl('s', ['Safest']);
    const t = resultTabs({ lines: [...L, safest], safest, selected: 'e', better: null, drawFx: 0 });
    expect(t.map((x) => [x.v.key, x.label])).toEqual([['a', 'Line 1'], ['b', 'Line 2'], ['c', 'Line 3'], ['e', 'Line 5'], ['s', 'Safest lethal']]);
    expect(resultTabs({ lines: L, safest: null, selected: 'a', better: 'd', drawFx: 0 }).map((x) => x.v.key)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('shows every trade-off option under a draw effect', () => {
    const t = resultTabs({ lines: [vl('a', ['Best trade']), ...L.slice(1)], safest: null, selected: 'a', better: null, drawFx: 1 });
    expect(t).toHaveLength(5);
    expect(t[0].badge).toBe('Best trade');
  });
});

describe('the status line and how it decides', () => {
  const v = (o: Partial<SessionView>): SessionView => ({
    phase: 'idle', lines: [], safest: null, trade: [], selected: null, nodes: 0, ms: 0, tested: 0, total: 0, deep: false, message: '', better: null,
    base: { steps: 0, events: [], path: [] }, branch: null, mode: 'first', hand: [], intrs: [], drawFx: 0, snapshot: null, ...o,
  });
  it('says where the search is', () => {
    expect(statusText(v({ phase: 'solving', nodes: 1234 }), TRAPS)).toBe('Finding lines… 1,234 positions');
    expect(statusText(v({ phase: 'solving', deep: true }), TRAPS)).toBe('Searching deeper…');
    expect(statusText(v({ phase: 'testing', intrs: [asIt('ash')], tested: 3, total: 9 }), TRAPS)).toBe(`Testing against ${trap('ash').short}… tested 3 of 9`);
    expect(statusText(v({ phase: 'done', ms: 2750, nodes: 5000, intrs: [asIt('ash')] }), TRAPS)).toBe(`2.8 s · 5,000 positions · tested against ${trap('ash').short}`);
    expect(statusText(v({ phase: 'error', message: 'boom' }), TRAPS)).toBe('The search failed (boom). Change a card or press Search deeper to retry.');
  });
  it('explains with the deck name, its protections and the draw effects', () => {
    const t = howItDecides('Some Deck', 40, { protections: [{ label: 'Guard (discard 1)' }, { label: 'Wall' }] as never }, TRAPS);
    expect(t[0]).toMatch(/of the 40 cards in the Some Deck deck file/);
    expect(t[0]).toMatch(/Guard and Wall answer their interruptions/);
    expect(t[1]).toMatch(new RegExp(`^${trap('fuwalos').short}, `));
    expect(t[t.length - 1]).toMatch(/about 2\.75 seconds \(about 6 with Search deeper\) and keeps the best 3 lines/);
  });
});
