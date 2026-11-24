// Step recording: each move opens a step (text, interruption tags), writes ledger entries as it
// moves cards, and closes the step onto the line's log. Port of the reference's step / done / L.

import type { CardId, State, StepRec, Tags } from './types';

const NOTAGS: Tags = Object.freeze({});

/**
 * Opponent draw effects (`Cfg.drawFx` is a mask of these). Each live one gives the opponent a draw
 * on a step that summons the way it names: Special from the Deck or Extra Deck, Normal or Special
 * from the hand, any Special.
 */
export const DRAW_BIT = { drawDeckExtraSummon: 1, drawHandSummon: 2, drawSpecialSummon: 4 } as const;

/** Open a step on `s` (a fresh clone the move owns). */
export function step(s: State, text: string, tags?: Tags): StepRec {
  s.cur = { text, tags: tags || NOTAGS, seq: null, ns: 0, xs: 0, summonsAfter: 0, interrupted: null, pre: null, act: null, fD: false, fH: false, fS: false, draws: 0 };
  return s.cur;
}

/**
 * Close the open step: count the interruption chokes it passed, give the opponent a draw for each
 * live draw effect its summons set off, and append it to the log.
 */
export function done(s: State): State {
  const c = s.cur;
  if (!c) throw new Error('done() without an open step');
  const t = c.tags;
  c.summonsAfter = s.summons;
  if (t.deckTouch) s.cDeckTouch++;
  if (t.deckAdd) s.cDeckAdd++;
  if (t.fieldMon) s.cFieldMon++;
  if (s.drawFx) {
    let d = 0;
    if ((s.drawFx & DRAW_BIT.drawDeckExtraSummon) && c.fD) d++;
    if ((s.drawFx & DRAW_BIT.drawHandSummon) && c.fH) d++;
    if ((s.drawFx & DRAW_BIT.drawSpecialSummon) && c.fS) d++;
    if (d) { c.draws = d; s.oppDraws += d; }
  }
  const lg = s.log.slice(); lg.push(c); s.log = lg;
  s.cur = null;
  return s;
}

/** Ledger zone names (the app's rule checker spells the banished zone in full). */
export type LedgerZone = 'hand' | 'deck' | 'extra' | 'gy' | 'banished' | 'field';

function open(s: State): StepRec {
  if (!s.cur) throw new Error('ledger entry without an open step');
  return s.cur;
}

/**
 * Ledger entries for the app's rule checker, kept as tuples (card indices) until a line is
 * exported: ['a', card, effect, from] activation, ['s', card, method, from, mats, extra] summon,
 * ['m', card, from, to] move. Each needs an open step (see `step`).
 */
export const L = {
  act(s: State, id: number, effect?: number, from?: LedgerZone | null): void {
    const c = open(s);
    (c.seq || (c.seq = [])).push(['a', id, effect || 0, from || null]);
  },
  sum(s: State, id: number, method: string, from?: LedgerZone | null, mats?: number[] | null, extra?: Record<string, unknown> | null): void {
    const c = open(s);
    c.ns++; if (from === 'extra') c.xs++;
    const special = method !== 'normal' && method !== 'tribute', origin = from || 'hand';
    if (special) c.fS = true;
    if (origin === 'hand') c.fH = true; else if (special && (origin === 'deck' || origin === 'extra')) c.fD = true;
    (c.seq || (c.seq = [])).push(['s', id, method, from || null, mats || null, extra || null]);
  },
  mv(s: State, id: number, from: LedgerZone, to: LedgerZone): void {
    const c = open(s);
    (c.seq || (c.seq = [])).push(['m', id, from, to]);
  },
};

export type LedgerObj =
  | ['a', { card: CardId; effect?: number; from?: LedgerZone }]
  | ['s', { card: CardId; method: string; from?: LedgerZone; materials?: CardId[] } & Record<string, unknown>]
  | ['m', { card: CardId; from: LedgerZone; to: LedgerZone }];

/** A step's ledger as the app's rule checker reads it: card ids, an unknown card as '?'. */
export function ledObjs(st: StepRec, ids: readonly CardId[], UNK: number): LedgerObj[] {
  const N = (i: number) => ids[i];
  return ((st.seq || []) as unknown[][]).map((t): LedgerObj => {
    if (t[0] === 'a') {
      const [, id, effect, from] = t as ['a', number, number, LedgerZone | null];
      return ['a', { card: N(id), ...(effect ? { effect } : {}), ...(from ? { from } : {}) }];
    }
    if (t[0] === 's') {
      const [, id, method, from, mats, extra] = t as ['s', number, string, LedgerZone | null, number[] | null, Record<string, unknown> | null];
      return ['s', { card: N(id), method, ...(from ? { from } : {}), ...(mats && mats.length ? { materials: mats.map(N) } : {}), ...(extra || {}) }];
    }
    const [, id, from, to] = t as ['m', number, LedgerZone, LedgerZone];
    return ['m', { card: id === UNK ? '?' : N(id), from, to }];
  });
}
