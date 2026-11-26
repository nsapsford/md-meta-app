// The Synchron list for the harness: the deck files compiled into an engine, the list by card id,
// seeded hands, and the ledger checker's DeckContext. There is no reference engine for this deck:
// its checks are the ledger (synchron.ledger.parity.test.ts) and the hands report the user judges
// (synchron.hands.report.test.ts).

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

/** The list by deck-file card id: 40 Main Deck cards, 15 Extra Deck cards. */
export const SY_MAIN: Record<string, number> = {
  DROLL: 2, JET: 1, PSI: 1, SCRAP: 1, JARM: 1, MAXX: 1, ASYN: 1, FSW: 1, ASW: 3, JUNK: 1, SDSYN: 1, ASH: 3, SJS: 1, TRAIL: 1,
  FUWA: 3, MEIST: 3, ASENT: 1, FYD: 3, ETELE: 3, FELLOW: 2, AZONE: 1, ROTA: 1, JSIG: 1, SEMER: 3,
};
export const SY_EXTRA: Record<string, number> = {
  KUD: 1, SCRAPW: 1, TGHL: 1, JSPD: 1, MALONG: 1, BRD: 1, SD: 1, ACCEL: 1, VOID: 1, MAJ: 1, BAR: 1, DIS: 1, CLERIC: 1, CRIM: 1, QUETZ: 1,
};
/** The Main Deck cards that start a line on their own (one report hand is built around each). */
export const SY_STARTERS = ['JUNK', 'JET', 'ASYN', 'SJS', 'MEIST', 'FELLOW', 'ASW', 'ETELE', 'PSI', 'ROTA', 'SDSYN', 'ASENT', 'AZONE', 'FSW'];

export function loadSynchron(): { engine: Engine; file: DeckFile; facts: CardFacts[] } {
  const r = validateDeckFile(readJson('synchron.json'), { staples: readJson('staples.json') });
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.card ?? '-'} ${e.field}: ${e.message}`).join('\n'));
  const facts = [...(readJson('synchron.cards.json') as CardFacts[]), ...(readJson('staples.cards.json') as CardFacts[])];
  return { engine: createEngine(compileDeck(r.file, facts), { traps: handTraps as HandTrapFile }), file: r.file, facts };
}

export interface SyHand { id: string; cfg: Cfg; hand: string[] }

/** The Deck less the hand. */
export function cfgOf(hand: Record<string, number>, mode: 'first' | 'second', field?: number): Cfg {
  const deck = { ...SY_MAIN };
  for (const [id, k] of Object.entries(hand)) { deck[id] -= k; if (!deck[id]) delete deck[id]; }
  const cfg: Cfg = { mode, hand: { ...hand }, deck, extra: { ...SY_EXTRA } };
  if (field !== undefined) cfg.opp = toCfg({ mode, hand: {}, deck: {}, extra: {}, opp: oppField(FIELDS[field]) }).opp;
  return cfg;
}

const listOf = (hand: Record<string, number>) => Object.entries(hand).flatMap(([c, n]) => Array<string>(n).fill(c));

/** `n` hands of `size` drawn from the Main Deck with their own seeded stream; going second, against FIELDS in turn. */
export function syHands(n: number, size: number, mode: 'first' | 'second', stream: number, prefix: string): SyHand[] {
  const rng = mulberry32(SEED + stream);
  const ids = Object.entries(SY_MAIN).flatMap(([id, k]) => Array<string>(k).fill(id));
  return Array.from({ length: n }, (_, i) => {
    const pool = [...ids], hand: Record<string, number> = {};
    for (let j = 0; j < size; j++) { const [id] = pool.splice(Math.floor(rng() * pool.length), 1); hand[id] = (hand[id] ?? 0) + 1; }
    return { id: `${prefix}-${String(i + 1).padStart(3, '0')}`, cfg: cfgOf(hand, mode, mode === 'second' ? i % FIELDS.length : undefined), hand: listOf(hand) };
  });
}

/** A hand of 5 with `starter` and 4 more seeded cards. */
export function starterHand(starter: string, stream: number): SyHand {
  const rng = mulberry32(SEED + stream);
  const pool = Object.entries(SY_MAIN).flatMap(([id, k]) => Array<string>(id === starter ? k - 1 : k).fill(id));
  const hand: Record<string, number> = { [starter]: 1 };
  for (let j = 0; j < 4; j++) { const [id] = pool.splice(Math.floor(rng() * pool.length), 1); hand[id] = (hand[id] ?? 0) + 1; }
  return { id: `starter-${starter}`, cfg: cfgOf(hand, 'first'), hand: listOf(hand) };
}

/** A going-first hand of exactly these cards (by id, copies repeated). */
export function fixedHand(cards: string[], id: string): SyHand {
  const hand: Record<string, number> = {};
  for (const c of cards) hand[c] = (hand[c] ?? 0) + 1;
  return { id, cfg: cfgOf(hand, 'first'), hand: listOf(hand) };
}

/** The ledger checker's view of the list: each card's facts, copies and zone. */
export function synchronDeckContext(file: DeckFile, facts: CardFacts[]): DeckContext {
  const row = (id: string, copies: number, zone: 'main' | 'extra'): DeckCard => {
    const c = file.cards.find((x) => x.id === id)!;
    const f = facts.find((x) => c.passcodes.includes(x.passcode))!;
    return { passcode: f.passcode, name: f.name, type: f.type, text: f.text, level: f.level, linkRating: f.link, attribute: f.attr, race: f.race, copies, zone };
  };
  return {
    deckName: 'Synchron', archetype: 'Synchron',
    main: Object.entries(SY_MAIN).map(([id, k]) => row(id, k, 'main')),
    extra: Object.entries(SY_EXTRA).map(([id, k]) => row(id, k, 'extra')),
    metaInterruptions: [],
  };
}
