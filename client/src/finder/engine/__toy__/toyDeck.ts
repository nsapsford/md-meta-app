// A made-up six-card deck for engine tests. Nothing here is a real card.
//
// SEEKER  Level 4. When Normal Summoned: add a card of group `spells` from the Deck.
// TUNER   Level 4 Tuner. Special Summon itself from hand while you control a monster (once per turn).
// BIG     Level 6, no effect.
// DRAWTWO Normal Spell. Discard 1 other card as cost, draw 2 (once per turn).
// WALL    Continuous Trap. Set at end of turn; worth 0.5 on the opponent's turn.
// SYNC    Level 8 Synchro (exactly one Tuner). Worth 1.0.

import type { CardFacts, DeckFile } from '../../deck/schema';
import type { CardId, Cfg } from '../types';

export const TOY_FILE: DeckFile = {
  vocab: 1,
  id: 'toy',
  name: 'Toy deck',
  cards: [
    {
      id: 'SEEKER', passcodes: [9000001], short: 'Seeker',
      effects: [{
        key: 'seeker-search', phase: 'main', from: 'field',
        trigger: { normalSummoned: true },
        cond: [{ addLockOff: true }],
        choose: [{ as: 'card', pick: { fromZone: { zone: 'deck', group: 'spells' } } }],
        do: [{ move: { what: 'card', to: 'hand' } }],
        tags: { deckTouch: true, deckAdd: true, fieldMon: true },
        ledger: { effect: 1 },
        text: 'Seeker: add {card}.', negText: "Seeker's search: negated.",
      }],
    },
    {
      id: 'TUNER', passcodes: [9000002], short: 'Tuner',
      effects: [{
        key: 'tuner-ss', phase: 'main', from: 'hand', limit: 'oncePerTurn',
        cond: [{ control: { kind: 'mon' } }, { monsterZoneFree: true }],
        do: [{ summon: { what: 'self' } }],
        tags: { inherent: true }, negatable: false,
        text: 'Tuner: Special Summon it from hand.',
      }],
    },
    { id: 'BIG', passcodes: [9000003], short: 'Big' },
    {
      id: 'DRAWTWO', passcodes: [9000004], short: 'Draw Two',
      effects: [{
        key: 'drawtwo', phase: 'main', from: 'hand', limit: 'oncePerTurn', activates: 'spell',
        choose: [{ as: 'card', pick: { otherHandCard: true } }],
        cost: [{ discard: { what: 'card' } }],
        do: [{ draw: 2 }],
        tags: { spell: true },
        ledger: { effect: 1 },
        text: 'Draw Two: discard {card}, draw 2.', negText: 'Draw Two (discard {card}): negated.',
      }],
    },
    { id: 'WALL', passcodes: [9000005], short: 'Wall' },
    { id: 'SYNC', passcodes: [9000006], short: 'Sync' },
  ],
  groups: { spells: ['DRAWTWO'] },
  extraDeck: [{ card: 'SYNC', method: 'synchro', level: 8, min: 2, max: 2, tuners: 'exactlyOne' }],
  endOfTurn: { setOrder: ['WALL'] },
  boardValue: [
    { id: 'wall', when: 'oppTurn', on: { control: { card: 'WALL', kind: 'st', faceUp: false } }, base: [{ value: 0.5, label: 'Wall: negate' }] },
    { id: 'sync', when: 'oppTurn', on: { control: { card: 'SYNC', kind: 'mon' } }, base: [{ value: 1.0, label: 'Sync on the field' }] },
  ],
};

const fact = (passcode: number, name: string, type: string, race: string | null, attr: string | null, level: number | null, atk: number | null, def: number | null): CardFacts =>
  ({ passcode, name, type, race, attr, level, link: null, atk, def, text: '' });

export const TOY_FACTS: CardFacts[] = [
  fact(9000001, 'Toy Seeker', 'Effect Monster', 'Spellcaster', 'DARK', 4, 1500, 1000),
  fact(9000002, 'Toy Tuner', 'Tuner Effect Monster', 'Spellcaster', 'LIGHT', 4, 1000, 1000),
  fact(9000003, 'Toy Big', 'Normal Monster', 'Dragon', 'DARK', 6, 2400, 2000),
  fact(9000004, 'Toy Draw Two', 'Spell Card', 'Normal', null, null, null, null),
  fact(9000005, 'Toy Wall', 'Trap Card', 'Continuous', null, null, null, null),
  fact(9000006, 'Toy Sync', 'Synchro Effect Monster', 'Dragon', 'DARK', 8, 3000, 2500),
];

const MAIN: CardId[] = ['SEEKER', 'TUNER', 'BIG', 'DRAWTWO', 'WALL'];

/** Going first: the Deck is 3 copies of each Main Deck card less the hand; Extra Deck 1 SYNC. */
export function toyCfg(hand: Record<CardId, number>): Cfg {
  const deck: Record<CardId, number> = {};
  for (const id of MAIN) { const n = 3 - (hand[id] ?? 0); if (n > 0) deck[id] = n; }
  return { mode: 'first', hand: { ...hand }, deck, extra: { SYNC: 1 } };
}
