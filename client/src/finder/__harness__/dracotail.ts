// The Branded Dracotail list (spec Appendix A) for the harness: the deck files compiled into an
// engine, the list by card id, seeded hands, and the ledger checker's DeckContext. There is no
// reference engine for this deck: its checks are the ledger (check 3) and the hands report the
// user judges (check 4).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../../utils/trainer';
import { createEngine, type Engine } from '../engine';
import { compileDeck } from '../deck/compile';
import { validateDeckFile, type CardFacts, type DeckFile, type HandTrapFile } from '../deck/schema';
import type { Cfg } from '../engine/types';
import type { DeckCard, DeckContext } from '../../../../server/src/services/lineGen/types';
import handTraps from '../deck/files/hand-traps.json';
import { FIELDS, oppField, SEED } from './situations';
import { toCfg } from './mapping';

const readJson = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL('../deck/files/' + name, import.meta.url)), 'utf8'));

/** Appendix A by deck-file card id: 41 Main Deck cards, 15 Extra Deck cards. */
export const BD_MAIN: Record<string, number> = {
  DROLL: 2, MAXX: 1, GHOST: 1, ASH: 3, MULULU: 2, ALBAZ: 1, ECCL: 2, CART: 2, FUWA: 3, PURU: 3, LUKIAS: 1, WHITE: 2, FAIMENA: 3, URGULA: 1,
  ALBION: 3, TTT: 1, BFUS: 1, KETU: 2, RAHU: 1, SPOLY: 2, HIGHSP: 1, FV: 2, FLAME: 1,
};
export const BD_EXTRA: Record<string, number> = { TITAN: 1, ALBRAND: 1, MIRROR: 1, LENATUS: 1, GRAN: 1, RIND: 1, KHAOS: 1, ARTH: 2, SECRET: 1, DOGMA: 1, MIXOU: 1, AEON: 1, EDD: 1, VERTE: 1 };
/** The Main Deck cards that start a line on their own (one report hand is built around each). */
export const BD_STARTERS = ['MULULU', 'ALBAZ', 'ECCL', 'CART', 'LUKIAS', 'WHITE', 'FAIMENA', 'ALBION', 'BFUS', 'KETU', 'RAHU', 'HIGHSP'];

export function loadDracotail(): { engine: Engine; file: DeckFile; facts: CardFacts[] } {
  const r = validateDeckFile(readJson('branded-dracotail.json'), { staples: readJson('staples.json') });
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.card ?? '-'} ${e.field}: ${e.message}`).join('\n'));
  const facts = [...(readJson('branded-dracotail.cards.json') as CardFacts[]), ...(readJson('staples.cards.json') as CardFacts[])];
  return { engine: createEngine(compileDeck(r.file, facts), { traps: handTraps as HandTrapFile }), file: r.file, facts };
}

export interface BdHand { id: string; cfg: Cfg; hand: string[] }

/** The Deck less the hand. */
export function cfgOf(hand: Record<string, number>, mode: 'first' | 'second', field?: number): Cfg {
  const deck = { ...BD_MAIN };
  for (const [id, k] of Object.entries(hand)) { deck[id] -= k; if (!deck[id]) delete deck[id]; }
  const cfg: Cfg = { mode, hand: { ...hand }, deck, extra: { ...BD_EXTRA } };
  if (field !== undefined) cfg.opp = toCfg({ mode, hand: {}, deck: {}, extra: {}, opp: oppField(FIELDS[field]) }).opp;
  return cfg;
}

const listOf = (hand: Record<string, number>) => Object.entries(hand).flatMap(([c, n]) => Array<string>(n).fill(c));

/** `n` hands of `size` drawn from the Main Deck with their own seeded stream; going second, against FIELDS in turn. */
export function bdHands(n: number, size: number, mode: 'first' | 'second', stream: number, prefix: string): BdHand[] {
  const rng = mulberry32(SEED + stream);
  const ids = Object.entries(BD_MAIN).flatMap(([id, k]) => Array<string>(k).fill(id));
  return Array.from({ length: n }, (_, i) => {
    const pool = [...ids], hand: Record<string, number> = {};
    for (let j = 0; j < size; j++) { const [id] = pool.splice(Math.floor(rng() * pool.length), 1); hand[id] = (hand[id] ?? 0) + 1; }
    return { id: `${prefix}-${String(i + 1).padStart(3, '0')}`, cfg: cfgOf(hand, mode, mode === 'second' ? i % FIELDS.length : undefined), hand: listOf(hand) };
  });
}

/** A hand of 5 with `starter` and 4 more seeded cards. */
export function starterHand(starter: string, stream: number): BdHand {
  const rng = mulberry32(SEED + stream);
  const pool = Object.entries(BD_MAIN).flatMap(([id, k]) => Array<string>(id === starter ? k - 1 : k).fill(id));
  const hand: Record<string, number> = { [starter]: 1 };
  for (let j = 0; j < 4; j++) { const [id] = pool.splice(Math.floor(rng() * pool.length), 1); hand[id] = (hand[id] ?? 0) + 1; }
  return { id: `starter-${starter}`, cfg: cfgOf(hand, 'first'), hand: listOf(hand) };
}

/** The ledger checker's view of the list: each card's facts, copies and zone. */
export function dracotailDeckContext(file: DeckFile, facts: CardFacts[]): DeckContext {
  const row = (id: string, copies: number, zone: 'main' | 'extra'): DeckCard => {
    const c = file.cards.find((x) => x.id === id)!;
    const f = facts.find((x) => c.passcodes.includes(x.passcode))!;
    return { passcode: f.passcode, name: f.name, type: f.type, text: f.text, level: f.level, linkRating: f.link, attribute: f.attr, race: f.race, copies, zone };
  };
  return {
    deckName: 'Branded Dracotail', archetype: 'Dracotail',
    main: Object.entries(BD_MAIN).map(([id, k]) => row(id, k, 'main')),
    extra: Object.entries(BD_EXTRA).map(([id, k]) => row(id, k, 'extra')),
    metaInterruptions: [],
  };
}
