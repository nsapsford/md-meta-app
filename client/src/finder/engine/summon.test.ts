import { describe, it, expect } from 'vitest';
import { compileDeck } from '../deck/compile';
import { validateDeckFile, type CardFacts, type DeckFile, type ExtraRule } from '../deck/schema';
import { createMoves } from './moves';
import { ledObjs } from './record';
import { fieldPool, fusionOptions } from './summon';
import type { CardId, Cfg, OppCard, State } from './types';
import { TOY_FACTS, TOY_FILE, toyCfg } from './__toy__/toyDeck';

// Extra Deck monsters for these tests (made up): two Link-2s, a Link-3 and a Fusion.
const linkFact = (passcode: number, name: string, link: number): CardFacts =>
  ({ passcode, name, type: 'Link Effect Monster', race: 'Cyberse', attr: 'DARK', level: null, link, atk: 1500, def: 0, text: '' });
const FACTS: CardFacts[] = [
  ...TOY_FACTS,
  linkFact(9000101, 'Toy Link A', 2),
  linkFact(9000102, 'Toy Link B', 2),
  linkFact(9000103, 'Toy Link C', 3),
  { passcode: 9000104, name: 'Toy Fusion', type: 'Fusion Effect Monster', race: 'Fiend', attr: 'DARK', level: 8, link: null, atk: 2800, def: 2000, text: '' },
];
const EXTRA_CARDS = [
  { id: 'LINKA', passcodes: [9000101], short: 'Link A' },
  { id: 'LINKB', passcodes: [9000102], short: 'Link B' },
  { id: 'LINKC', passcodes: [9000103], short: 'Link C' },
  { id: 'FUS', passcodes: [9000104], short: 'Fusion' },
];

type Cards = DeckFile['cards'];
function setup(rules: ExtraRule[] = TOY_FILE.extraDeck!, cards: (c: Cards) => Cards = (c) => c) {
  const file: DeckFile = { ...TOY_FILE, cards: cards([...TOY_FILE.cards, ...EXTRA_CARDS]), extraDeck: rules };
  const v = validateDeckFile(file, {});
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  const deck = compileDeck(file, FACTS);
  const mv = createMoves(deck);
  const so = deck.state;
  const state = (field: CardId[], extra: Partial<Cfg> = {}, emz: CardId[] = []): State => {
    const s = so.newState({ ...toyCfg({}), extra: { SYNC: 1, LINKA: 1, LINKB: 1, LINKC: 1, FUS: 1 }, ...extra }, deck.ix);
    for (const id of [...field, ...emz]) {
      const i = deck.ix[id];
      s.mons.push({ id: i, nm: i, emz: emz.includes(id), noEff: false, uses: 0, lvl: deck.props[i].lv ?? 0, marks: 0, uid: s.uid++ });
    }
    return s;
  };
  const keys = (s: State, prefix: string) => mv.gen(s).map((m) => m.k).filter((k) => k.startsWith(prefix));
  const run = (s: State, key: string) => {
    const m = mv.gen(s).find((x) => x.k === key);
    if (!m) throw new Error(`no move ${key}; offered: ${mv.gen(s).map((x) => x.k).join(', ')}`);
    return mv.exec(s, m, false);
  };
  return { deck, mv, so, state, keys, run };
}

const synchro = (tuners: 'exactlyOne' | 'atMostOne', level = 8): ExtraRule => ({ card: 'SYNC', method: 'synchro', level, min: 2, max: 3, tuners });
const link = (card: CardId, rating: number, min: number, max: number, more: Partial<ExtraRule> = {}): ExtraRule => ({ card, method: 'link', rating, min, max, ...more } as ExtraRule);

describe('Synchro Summons', () => {
  it('a Tuner and a non-Tuner whose Levels add up offer the Synchro', () => {
    const t = setup();
    expect(t.keys(t.state(['TUNER', 'SEEKER']), 'syn:')).toEqual(['syn:SYNC:SEEKER+TUNER']);
  });

  it('sends the materials to the GY and summons the monster from the Extra Deck', () => {
    const t = setup();
    const n = t.run(t.state(['TUNER', 'SEEKER']), 'syn:SYNC:SEEKER+TUNER');
    expect(n.mons.map((m) => t.deck.ids[m.id])).toEqual(['SYNC']);
    expect(n.gy[t.deck.ix.TUNER]).toBe(1);
    expect(n.gy[t.deck.ix.SEEKER]).toBe(1);
    expect(n.extra[t.deck.ix.SYNC]).toBe(0);
    expect(n.summons).toBe(1);
    const rec = n.log[n.log.length - 1];
    expect(rec.text).toBe('Synchro Summon Sync with Tuner + Seeker.');
    expect(rec.tags).toEqual({ inherent: true });
    expect(ledObjs(rec, t.deck.ids, t.deck.UNK)).toEqual([['s', { card: 'SYNC', method: 'synchro', from: 'extra', materials: ['SEEKER', 'TUNER'] }]]);
    expect(n.path).toEqual(['syn:SYNC:SEEKER+TUNER']);
  });

  it('two non-Tuners offer nothing under exactlyOne, and one move under atMostOne', () => {
    const t1 = setup();
    expect(t1.keys(t1.state(['SEEKER', 'SEEKER']), 'syn:')).toEqual([]);
    const t = setup([synchro('atMostOne')]);
    expect(t.keys(t.state(['SEEKER', 'SEEKER']), 'syn:')).toEqual(['syn:SYNC:SEEKER+SEEKER']);
  });

  it('Levels that add up to something else offer nothing', () => {
    const t = setup();
    expect(t.keys(t.state(['TUNER', 'BIG']), 'syn:')).toEqual([]);   // 4 + 6 = 10
  });

  it('reads the current Level of the monster on the field', () => {
    const t = setup();
    const s = t.state(['TUNER', 'BIG']);
    s.mons[1] = { ...s.mons[1], lvl: 4 };
    expect(t.keys(s, 'syn:')).toEqual(['syn:SYNC:BIG+TUNER']);
  });

  it('applies the rule\'s material condition to every material', () => {
    const t = setup([{ ...synchro('exactlyOne'), mats: { attribute: ['LIGHT'] } } as ExtraRule]);
    expect(t.keys(t.state(['TUNER', 'SEEKER']), 'syn:')).toEqual([]);   // Seeker is DARK
  });

  it('is not offered without the monster in the Extra Deck, or under the Extra Deck floodgate', () => {
    const t = setup();
    expect(t.keys(t.state(['TUNER', 'SEEKER'], { extra: {} }), 'syn:')).toEqual([]);
    const opp = { lp: 8000, mons: [], st: [{ uid: 'f', kind: 'st', name: 'Gate', intr: 'floodExtra' } as OppCard] };
    expect(t.keys(t.state(['TUNER', 'SEEKER'], { opp }), 'syn:')).toEqual([]);
  });
});

describe('Link Summons', () => {
  it('a Link rule with rating 2 takes exactly two monsters', () => {
    const t = setup([link('LINKA', 2, 2, 3)]);
    expect(t.keys(t.state(['SEEKER', 'TUNER', 'BIG']), 'link:')).toEqual(['link:LINKA:SEEKER+TUNER', 'link:LINKA:BIG+SEEKER', 'link:LINKA:BIG+TUNER']);
  });

  it('offers each material set once: two copies on the field, or two rules for one card', () => {
    const t = setup([link('LINKA', 2, 2, 3)]);
    expect(t.keys(t.state(['SEEKER', 'SEEKER', 'TUNER']), 'link:')).toEqual(['link:LINKA:SEEKER+SEEKER', 'link:LINKA:SEEKER+TUNER']);
    const t2 = setup([link('LINKA', 2, 2, 2), link('LINKA', 2, 2, 3)]);
    expect(t2.keys(t2.state(['SEEKER', 'TUNER']), 'link:')).toEqual(['link:LINKA:SEEKER+TUNER']);
  });

  it('a Link-2 material counts as 1 or 2 toward a rating of 3', () => {
    const t = setup([link('LINKC', 3, 2, 3)]);
    const ks = t.keys(t.state(['SEEKER', 'TUNER'], {}, ['LINKB']), 'link:');
    expect(ks).toContain('link:LINKC:LINKB+SEEKER');         // 2 + 1
    expect(ks).toContain('link:LINKC:LINKB+SEEKER+TUNER');   // 1 + 1 + 1
    expect(ks).not.toContain('link:LINKC:SEEKER+TUNER');     // 1 + 1
  });

  it('summons to the Extra Monster Zone, with the materials in the ledger', () => {
    const t = setup([link('LINKA', 2, 2, 2)]);
    const n = t.run(t.state(['SEEKER', 'TUNER']), 'link:LINKA:SEEKER+TUNER');
    expect(n.mons).toHaveLength(1);
    expect(n.mons[0]).toMatchObject({ id: t.deck.ix.LINKA, emz: true });
    expect(n.gy[t.deck.ix.SEEKER] + n.gy[t.deck.ix.TUNER]).toBe(2);
    const rec = n.log[n.log.length - 1];
    expect(rec.text).toBe('Link Summon Link A with Seeker + Tuner.');
    expect(ledObjs(rec, t.deck.ids, t.deck.UNK)).toEqual([['s', { card: 'LINKA', method: 'link', from: 'extra', materials: ['TUNER', 'SEEKER'] }]]);
  });

  it('refuses a second Link when the Extra Monster Zone is taken and its Link has no bottom arrows', () => {
    const t = setup([link('LINKA', 2, 2, 2), link('LINKB', 2, 2, 2)]);
    const ks = t.keys(t.state(['SEEKER', 'TUNER'], {}, ['LINKA']), 'link:LINKB:');
    expect(ks).not.toContain('link:LINKB:SEEKER+TUNER');
    expect(ks).toContain('link:LINKB:LINKA+SEEKER');   // the Link in the Extra Monster Zone is a material
    const t2 = setup([link('LINKA', 2, 2, 2, { bottomArrows: true }), link('LINKB', 2, 2, 2)]);
    const s2 = t2.state(['SEEKER', 'TUNER'], {}, ['LINKA']);
    expect(t2.keys(s2, 'link:LINKB:')).toContain('link:LINKB:SEEKER+TUNER');
    const n = t2.run(s2, 'link:LINKB:SEEKER+TUNER');
    expect(n.mons.find((m) => m.id === t2.deck.ix.LINKB)!.emz).toBe(false);
  });

  it('applies the rule\'s material condition to every material', () => {
    const t = setup([link('LINKC', 3, 2, 3, { mats: { not: { frame: ['Link'] } } })]);
    expect(t.keys(t.state(['SEEKER', 'TUNER', 'BIG', 'LINKB']), 'link:')).toEqual(['link:LINKC:BIG+SEEKER+TUNER']);
  });
});

describe('fusionOptions', () => {
  const sameAttrDiffRace = (slots: Record<string, unknown>[] = [{ lpAbove: 0 }, { lpAbove: 0 }]): ExtraRule => ({ card: 'FUS', method: 'fusion', slots, relations: ['sameAttr', 'differentRace'] });

  it('returns only the pairs that satisfy every relation', () => {
    const t = setup([sameAttrDiffRace()]);
    const s = t.state(['SEEKER', 'TUNER', 'BIG']);   // DARK Spellcaster, LIGHT Spellcaster, DARK Dragon
    const opts = fusionOptions(s, fieldPool(s, t.deck.props, t.deck.UNK), t.deck.extra);
    expect(opts.map((o) => ({ card: t.deck.ids[o.card], mats: o.mats.map((m) => t.deck.ids[m.id]) }))).toEqual([{ card: 'FUS', mats: ['SEEKER', 'BIG'] }]);
  });

  it("can use an opponent's monster as a material", () => {
    const t = setup([sameAttrDiffRace([{ race: ['Dragon'] }, { race: ['Spellcaster'] }])]);
    const opp = { lp: 8000, mons: [{ uid: 'o1', kind: 'mon', name: 'Foe', race: 'Dragon', attr: 'LIGHT' } as OppCard, { uid: 'o2', kind: 'mon', name: 'Hidden', race: 'Dragon', attr: 'LIGHT', faceDown: true } as OppCard], st: [] };
    const s = t.state(['TUNER'], { opp });
    const pool = fieldPool(s, t.deck.props, t.deck.UNK);
    expect(pool.map((m) => m.side)).toEqual(['me', 'opp']);   // a face-down monster is not in the pool
    const opts = fusionOptions(s, pool, t.deck.extra);
    expect(opts).toHaveLength(1);
    expect(opts[0].mats.map((m) => (m.side === 'opp' ? m.uid : t.deck.ids[m.id]))).toEqual(['TUNER', 'o1']);
  });

  it('returns options in (order, card id) rule order, whatever the file order', () => {
    const fus = (card: CardId, order?: number): ExtraRule => ({ card, method: 'fusion', slots: [{ lpAbove: 0 }, { lpAbove: 0 }], ...(order === undefined ? {} : { order }) });
    const cardsOf = (rules: ExtraRule[]) => {
      const t = setup(rules);
      const s = t.state(['SEEKER', 'BIG']);
      return fusionOptions(s, fieldPool(s, t.deck.props, t.deck.UNK), t.deck.extra).map((o) => t.deck.ids[o.card]);
    };
    expect(cardsOf([fus('LINKA'), fus('FUS')])).toEqual(['FUS', 'LINKA']);
    expect(cardsOf([fus('FUS'), fus('LINKA')])).toEqual(['FUS', 'LINKA']);
    expect(cardsOf([fus('FUS'), fus('LINKA', -1)])).toEqual(['LINKA', 'FUS']);
  });

  it('differentNames / differentRace over three materials: every pair must differ', () => {
    const three = (relations: string[]): ExtraRule => ({ card: 'FUS', method: 'fusion', slots: [{ lpAbove: 0 }, { lpAbove: 0 }, { lpAbove: 0 }], relations } as ExtraRule);
    const mats = (rel: string[], field: CardId[]) => {
      const t = setup([three(rel)]);
      const s = t.state(field);
      return fusionOptions(s, fieldPool(s, t.deck.props, t.deck.UNK), t.deck.extra).map((o) => o.mats.map((m) => t.deck.ids[m.id]));
    };
    // SEEKER, TUNER: Spellcasters; BIG: Dragon.
    expect(mats(['differentNames'], ['SEEKER', 'TUNER', 'BIG'])).toEqual([['SEEKER', 'TUNER', 'BIG']]);
    expect(mats(['differentNames'], ['SEEKER', 'TUNER', 'SEEKER'])).toEqual([]);
    expect(mats(['differentRace'], ['SEEKER', 'TUNER', 'BIG'])).toEqual([]);
  });

  it('needs the Fusion Monster in the Extra Deck', () => {
    const t = setup([sameAttrDiffRace()]);
    const s = t.state(['SEEKER', 'BIG'], { extra: {} });
    expect(fusionOptions(s, fieldPool(s, t.deck.props, t.deck.UNK), t.deck.extra)).toEqual([]);
  });
});

describe('then', () => {
  it("queues the rule's then effect after the summon", () => {
    const t = setup([{ ...synchro('exactlyOne'), then: 'sync-arrive' } as ExtraRule], (cards) => cards.map((c) => (c.id === 'SYNC'
      ? { ...c, effects: [{ key: 'sync-arrive', phase: 'end', from: 'field', do: [{ draw: 1 }], tags: {}, text: 'Sync: draw 1.' }] }
      : c)));
    const n = t.run(t.state(['TUNER', 'SEEKER']), 'syn:SYNC:SEEKER+TUNER');
    const e = t.deck.effects.findIndex((x) => x.key === 'sync-arrive');
    expect(n.pend).toEqual([{ e, a: n.mons[0].uid }]);
    expect(t.mv.gen(n).map((m) => m.k)).toEqual(['dec:sync-arrive', 'sync-arrive']);
    expect(t.run(n, 'sync-arrive').hand[t.deck.UNK]).toBe(1);
  });

  it('thenIf: then is queued only when a material matches the filter', () => {
    const arrive = (cards: Cards) => cards.map((c) => (c.id === 'SYNC'
      ? { ...c, effects: [{ key: 'sync-arrive', phase: 'end' as const, from: 'field' as const, do: [{ draw: 1 }], tags: {}, text: 'Sync: draw 1.' }] }
      : c));
    for (const [race, queued] of [['Spellcaster', 1], ['Dragon', 0]] as const) {
      const t = setup([{ ...synchro('exactlyOne'), then: 'sync-arrive', thenIf: { all: [{ tuner: true }, { race: [race] }] } } as ExtraRule], arrive);
      const n = t.run(t.state(['TUNER', 'SEEKER']), 'syn:SYNC:SEEKER+TUNER');
      expect(n.pend.length).toBe(queued);
    }
  });
});
