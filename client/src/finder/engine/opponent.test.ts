import { describe, expect, it } from 'vitest';
import { compileDeck } from '../deck/compile';
import type { DeckFile } from '../deck/schema';
import { createEngine, type Engine } from './index';
import { eligible, MECHANISMS } from './opponent';
import type { Interruption, State, StepView } from './types';
import { TOY_FACTS, TOY_FILE, toyCfg } from './__toy__/toyDeck';

// The toy deck with Draw Two also touching the Deck, Seeker immune to removal when asked, and a Set Wall that answers any interruption.
const FILE: DeckFile = {
  ...TOY_FILE,
  cards: TOY_FILE.cards.map((c) => (c.id !== 'DRAWTWO' ? c : { ...c, effects: c.effects!.map((e) => ({ ...e, tags: { spell: true, deckTouch: true } })) })),
  protections: [{ id: 'wall', label: 'Wall', order: 1, card: 'WALL', where: [{ control: { card: 'WALL', kind: 'st', faceUp: false } }], consume: [{ move: { what: 'self', to: 'gy' } }], stepNote: 'wall' }],
};
const IMMUNE: DeckFile = { ...FILE, cards: FILE.cards.map((c) => (c.id === 'SEEKER' ? { ...c, immuneToRemoval: true } : c)) };

const eng = (f: DeckFile = FILE): Engine => createEngine(compileDeck(f, TOY_FACTS));
const hand = (e: Engine, s: State, id: string) => s.hand[e.deck.ix[id]];
const gy = (e: Engine, s: State, id: string) => s.gy[e.deck.ix[id]];
const move = (e: Engine, s: State, k: string) => { const a = e.gen(s).find((x) => x.k === k); if (!a) throw new Error('no move ' + k + ' in ' + e.gen(s).map((x) => x.k).join(' ')); return a; };
const IT = (kind: string, o: Partial<Interruption> = {}): Interruption => ({ kind, src: 'hand', label: 'Trap', monster: true, ...o });
const V = (o: Partial<StepView> = {}): StepView => ({ tags: {}, canNeg: true, summonsAfter: 1, summoned: false, oppCount: 0, oppPresent: [], ...o });
const note = (s: State) => s.log[s.log.length - 1].interrupted;

describe('eligible', () => {
  it('knows every mechanism', () => { expect(MECHANISMS).toHaveLength(14); });
  it('applies each mechanism rule', () => {
    const cases: [string, Partial<StepView>, boolean][] = [
      ['negDeckTouch', { tags: { deckTouch: true } }, true], ['negDeckTouch', { tags: { deckTouch: true }, canNeg: false }, false], ['negDeckTouch', { tags: { fieldMon: true } }, false],
      ['negFieldMon', { tags: { fieldMon: true } }, true], ['negFieldMon', { tags: { handMon: true } }, false],
      ['negGy', { tags: { gy: true } }, true], ['negGy', { tags: { gy: true }, canNeg: false }, false],
      ['lockDeckAdds', { tags: { deckAdd: true }, canNeg: false }, true], ['lockDeckAdds', {}, false],
      ['negMon', { tags: { handMon: true } }, true], ['negMon', { tags: { spell: true } }, false],
      ['negST', { tags: { trap: true } }, true], ['negST', { tags: { spell: true, noResp: true } }, false],
      ['negAny', { tags: { fieldMon: true } }, true], ['negAny', { tags: { spell: true, noResp: true } }, false], ['negAny', { tags: { inherent: true } }, false],
      ['negSummon', { tags: { inherent: true }, canNeg: false }, true], ['negSummon', { tags: { spell: true } }, false],
      ['pop', { summoned: true }, true], ['pop', {}, false],
      ['force', {}, true], ['force', { canNeg: false }, false],
      ['drawDeckExtraSummon', {}, true], ['drawDeckExtraSummon', { oppCount: 1 }, false],
      ['drawHandSummon', {}, true], ['drawHandSummon', { oppCount: 2 }, false],
      ['drawSpecialSummon', { oppCount: 2, canNeg: false }, true],
    ];
    for (const [k, v, want] of cases) expect([k, v, eligible(V(v), IT(k))]).toEqual([k, v, want]);
  });
  it('wipeAtSummons needs param summons', () => {
    expect(eligible(V({ summonsAfter: 4 }), IT('wipeAtSummons', { param: 5 }))).toBe(false);
    expect(eligible(V({ summonsAfter: 5 }), IT('wipeAtSummons', { param: 5 }))).toBe(true);
    expect(eligible(V({ summonsAfter: 9 }), IT('wipeAtSummons'))).toBe(false);
  });
  it('joins mechanisms with +, skips interrupted and recorded steps, and needs a board card present', () => {
    expect(eligible(V({ tags: { spell: true } }), IT('negSummon+negST'))).toBe(true);
    expect(eligible(V({ tags: { spell: true }, interrupted: 'x' }), IT('negST'))).toBe(false);
    expect(eligible(V({ ev: true }), IT('force'))).toBe(false);
    expect(eligible(V(), IT('force', { src: 'board', uid: 'o1' }))).toBe(false);
    expect(eligible(V({ oppPresent: ['o1'] }), IT('force', { src: 'board', uid: 'o1' }))).toBe(true);
  });
});

describe('interrupt', () => {
  const e = eng();
  const root = e.newState(toyCfg({ SEEKER: 1, DRAWTWO: 1, BIG: 1 }));

  it('negDeckTouch negates the step and keeps its cost paid', () => {
    const n = e.interrupt(root, move(e, root, 'drawtwo:BIG'), IT('negDeckTouch', { label: 'Negator' }));
    expect([hand(e, n, 'DRAWTWO'), hand(e, n, 'BIG'), gy(e, n, 'BIG'), hand(e, n, 'UNK')]).toEqual([0, 0, 1, 0]);
    expect(note(n)).toBe('Negator negates this');
    expect(n.log[n.log.length - 1].text).toBe('Draw Two (discard Big): negated.');
    expect(n.path).toEqual(['!' + JSON.stringify({ k: 'drawtwo:BIG', it: IT('negDeckTouch', { label: 'Negator' }) })]);
  });

  it('lockDeckAdds sets addLock and the search is no longer offered', () => {
    const n = e.interrupt(root, move(e, root, 'ns:SEEKER'), IT('lockDeckAdds', { short: 'Lock' }));
    expect(n.addLock).toBe(true);
    expect(note(n)).toBe('Lock resolves after this: no more adds from the Deck');
    expect(e.gen(n).map((a) => a.k)).toEqual(['dec:seeker-search']);
  });

  it('wipeAtSummons sends every monster to the GY and clears pending triggers', () => {
    const n = e.interrupt(root, move(e, root, 'ns:SEEKER'), IT('wipeAtSummons', { label: 'Wipe', param: 5 }));
    expect([n.mons.length, n.pend.length, gy(e, n, 'SEEKER')]).toEqual([0, 0, 1]);
    expect(note(n)).toBe('Wipe after this: Seeker tributed');
  });

  it('negSummon sends the new monster to the GY and drops its triggers', () => {
    const n = e.interrupt(root, move(e, root, 'ns:SEEKER'), IT('negSummon', { label: 'Counter' }));
    expect([n.mons.length, n.pend.length, gy(e, n, 'SEEKER')]).toEqual([0, 0, 1]);
    expect(note(n)).toBe('Counter: the summon is negated and the monster destroyed');
  });

  it('pop removes the new monster unless it is immune to removal', () => {
    const n = e.interrupt(root, move(e, root, 'ns:SEEKER'), IT('pop', { label: 'Popper' }));
    expect([n.mons.length, note(n)]).toEqual([0, 'Popper: Seeker is removed']);
    const im = eng(IMMUNE), r2 = im.newState(toyCfg({ SEEKER: 1 }));
    const m = im.interrupt(r2, move(im, r2, 'ns:SEEKER'), IT('pop', { label: 'Popper' }));
    expect([m.mons.length, note(m)]).toEqual([1, 'Popper: nothing it can hit']);
  });

  it('draw mechanisms set their bit, in response to a summon or chained to an activation', () => {
    const a = e.interrupt(root, move(e, root, 'ns:SEEKER'), IT('drawSpecialSummon', { label: 'Drawer' }));
    expect([a.drawFx, note(a)]).toEqual([4, 'Drawer in response to this summon: they draw 1 each time you Special Summon from here on']);
    const b = e.interrupt(root, move(e, root, 'drawtwo:BIG'), IT('drawHandSummon', { label: 'Purr' }));
    expect([b.drawFx, note(b)]).toEqual([2, 'Purr chained to this: they draw 1 each time you Normal or Special Summon from your hand, this step included']);
    const c = e.startDraw(root, IT('drawDeckExtraSummon', { label: 'Fuwa' }));
    expect([c.drawFx, c.opening, c.path[0][0]]).toEqual([1, ['Fuwa at the start of your turn: they draw 1 each time you Special Summon from the Deck or Extra Deck'], '^']);
  });

  it('a protection answers the interruption: it is consumed and the step resolves', () => {
    const s = e.newState(toyCfg({ DRAWTWO: 1, BIG: 1 }));
    s.st.push({ id: e.deck.ix.WALL, up: false, now: false });
    const p = e.protectionFor(s, IT('negST'), { spell: true });
    expect(p?.id).toBe('wall');
    const n = e.interrupt(s, move(e, s, 'drawtwo:BIG'), IT('negST', { label: 'Spell Negator' }));
    expect([n.st.length, gy(e, n, 'WALL'), hand(e, n, 'UNK'), n.log.length]).toEqual([0, 1, 2, 1]);
    expect(note(n)).toBe('Spell Negator here; Wall negates it');
    expect(e.protectionFor(n, IT('negST'), { spell: true })).toBeNull();
  });
});

describe('applyEvent', () => {
  const e = eng();
  const root = e.newState({ ...toyCfg({ SEEKER: 1 }), hand: { SEEKER: 1, UNK: 1 } });
  const s1 = e.exec(root, move(e, root, 'ns:SEEKER'), false);
  const s = e.exec(s1, move(e, s1, 'dec:seeker-search'), false);

  it('lose: a card leaves your field', () => {
    const n = e.applyEvent(s, { t: 'lose', id: 'SEEKER', to: 'gy', by: 'a removal' });
    expect([n.mons.length, gy(e, n, 'SEEKER')]).toEqual([0, 1]);
    expect(n.log[n.log.length - 1].text).toBe('Recorded: Seeker was sent to the GY by a removal.');
    expect(n.log[n.log.length - 1].ev).toBe(true);
    expect(n.path[n.path.length - 1][0]).toBe('@');
    expect(() => e.applyEvent(s, { t: 'lose', id: 'BIG', to: 'gy' })).toThrow('Big is not on your field at that point');
  });

  it('gain: a card from the Deck, replacing the unknown card or not', () => {
    const a = e.applyEvent(s, { t: 'gain', id: 'BIG' });
    expect([hand(e, a, 'BIG'), hand(e, a, 'UNK'), a.log[a.log.length - 1].text]).toEqual([1, 1, 'Recorded: Big is in your hand.']);
    const b = e.applyEvent(s, { t: 'gain', id: 'BIG', replace: true });
    expect([hand(e, b, 'BIG'), hand(e, b, 'UNK'), b.log[b.log.length - 1].text]).toEqual([1, 0, 'Recorded: Big is in your hand (it was the unknown card).']);
    expect(() => e.applyEvent(s, { t: 'gain', id: 'SYNC' })).toThrow('No Sync left in the Deck at that point');
  });

  it('oppAdd: they summon a monster', () => {
    const n = e.applyEvent(s, { t: 'oppAdd', mon: { uid: 'x1', name: 'Blocker', atk: 1000 } });
    expect(n.opp!.mons.map((m) => [m.uid, m.name, m.atk])).toEqual([['x1', 'Blocker', 1000]]);
    expect(n.log[n.log.length - 1].text).toBe('Recorded: they summoned Blocker.');
    expect(() => e.applyEvent(s, { t: 'nope' } as never)).toThrow('unknown event');
  });
});
