// What the Finder's setup holds (your hand, their hand traps and field), as plain data that can be
// saved on the device and restored against a deck list. Port of the artifact's snapshot / restore
// / setMode. Nothing here knows a card: the hand traps come from the hand-trap data.

import handTrapData from '../deck/files/hand-traps.json';
import type { DeckList } from '../deck/match';
import type { DeckFile, HandTrapFile } from '../deck/schema';
import { drawBit } from '../engine/opponent';
import type { CardId } from '../engine/types';

export type MonKind = 'main' | 'fusion' | 'synchro' | 'xyz' | 'link';
export interface OppMonInput { uid: string; name: string; atk: number; def: number; pos: 'atk' | 'def' | 'set'; attr: string; race: string; kind: MonKind; intr: string; uses: number; noDestroy: boolean; noTarget: boolean }
export interface OppStInput { uid: string; name: string; intr: string; uses: number; noDestroy: boolean; noTarget: boolean; stype: 'S' | 'T' }
export interface FinderSnapshot {
  v: 1; mode: 'first' | 'second';
  /** Card ids; 'UNK' is a blank (a card the line does not use). */
  hand: CardId[];
  /** Hand-trap ids switched on. */
  hts: string[];
  /** Hand-trap ids of draw effects already live this turn. */
  live: string[];
  /** Cards in their hand, or null when unknown. */
  oppHand: number | null;
  /** What an unnamed Set card of theirs is assumed to do (a `boardOptions` kind). */
  setAssume: string;
  opp: { lp: number; mons: OppMonInput[]; st: OppStInput[] };
}
/** A deck list in deck-file card ids. Unknown Main Deck cards are blanks (`blanks` is only shown). */
export interface ResolvedList { main: Record<CardId, number>; extra: Record<CardId, number>; blanks: number; unknown: number[] }

export const BLANK: CardId = 'UNK';
export const MAX_HAND = 7;
export const DEFAULT_LP = 8000;
/** Cards in their hand going first. */
export const OPP_HAND_FIRST = 5;

// The first hand trap in the data is switched on by default.
const DEFAULT_HT = (handTrapData as HandTrapFile).traps[0].id;

export const DEFAULT_SNAPSHOT: FinderSnapshot = Object.freeze({
  v: 1, mode: 'first', hand: [], hts: [DEFAULT_HT], live: [], oppHand: OPP_HAND_FIRST, setAssume: '', opp: { lp: DEFAULT_LP, mons: [], st: [] },
}) as FinderSnapshot;

const fresh = (): FinderSnapshot => JSON.parse(JSON.stringify(DEFAULT_SNAPSHOT));

/** Every passcode a card lists counts as that card. */
export function resolveList(list: DeckList, file: Pick<DeckFile, 'cards'>): ResolvedList {
  const byCode = new Map<number, CardId>();
  for (const c of file.cards) for (const p of c.passcodes) byCode.set(p, c.id);
  const out: ResolvedList = { main: {}, extra: {}, blanks: 0, unknown: [] };
  const add = (zone: Record<CardId, number>, rows: DeckList['main'], blanks: boolean) => {
    for (const { passcode, count } of rows) {
      if (!(count > 0)) continue;
      const id = byCode.get(passcode);
      if (id) { zone[id] = (zone[id] || 0) + count; continue; }
      if (blanks) out.blanks += count;
      if (!out.unknown.includes(passcode)) out.unknown.push(passcode);
    }
  };
  add(out.main, list.main, true);
  add(out.extra, list.extra, false);
  return out;
}

export function setMode(s: FinderSnapshot, mode: 'first' | 'second'): FinderSnapshot {
  return { ...s, mode, oppHand: mode === 'first' ? OPP_HAND_FIRST : null };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, d = '') => (typeof x === 'string' ? x : d);
const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const KINDS: readonly MonKind[] = ['main', 'fusion', 'synchro', 'xyz', 'link'];
const POS = ['atk', 'def', 'set'] as const;

/**
 * A saved snapshot, checked against the deck list and the hand-trap data: hand cards the list no
 * longer has (or has fewer copies of) are dropped, and anything malformed falls back to the default.
 */
export function restoreSnapshot(raw: unknown, list: ResolvedList, traps: Pick<HandTrapFile, 'traps' | 'boardOptions'>): FinderSnapshot {
  if (!isObj(raw) || raw.v !== 1) return fresh();
  if (raw.hand !== undefined && !Array.isArray(raw.hand)) return fresh();
  try {
    const s = fresh();
    s.mode = raw.mode === 'second' ? 'second' : 'first';
    const left: Record<CardId, number> = { ...list.main };
    for (const id of (raw.hand as unknown[] | undefined) ?? []) {
      if (s.hand.length >= MAX_HAND) break;
      if (id === BLANK) s.hand.push(BLANK);
      else if (typeof id === 'string' && left[id] > 0) { left[id]--; s.hand.push(id); }
    }
    const ids = new Set(traps.traps.map((t) => t.id));
    const drawIds = new Set(traps.traps.filter((t) => drawBit(t.mechanism)).map((t) => t.id));
    const strings = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((k): k is string => typeof k === 'string'))] : null);
    s.hts = (strings(raw.hts) ?? s.hts).filter((k) => ids.has(k));
    s.live = (strings(raw.live) ?? []).filter((k) => drawIds.has(k));
    s.oppHand = 'oppHand' in raw
      ? (raw.oppHand === null ? null : Math.max(0, Math.floor(num(raw.oppHand, OPP_HAND_FIRST))))
      : (s.mode === 'first' ? OPP_HAND_FIRST : null);
    const kinds = new Set(traps.boardOptions.map((o) => o.kind));
    const kind = (x: unknown) => { const k = str(x); return kinds.has(k) ? k : ''; };
    s.setAssume = kind(raw.setAssume);
    const o = isObj(raw.opp) ? raw.opp : {};
    let uid = 1;
    s.opp.lp = num(o.lp, 0) > 0 ? num(o.lp, DEFAULT_LP) : DEFAULT_LP;
    const common = (x: Record<string, unknown>) => ({
      name: str(x.name), intr: kind(x.intr), uses: Math.max(1, Math.floor(num(x.uses, 1))), noDestroy: x.noDestroy === true, noTarget: x.noTarget === true,
    });
    s.opp.mons = (Array.isArray(o.mons) ? o.mons : []).filter(isObj).map((x): OppMonInput => {
      const c = common(x);
      return {
        uid: 'o' + uid++, name: c.name, atk: Math.max(0, num(x.atk, 0)), def: Math.max(0, num(x.def, 0)),
        pos: POS.includes(x.pos as typeof POS[number]) ? (x.pos as OppMonInput['pos']) : 'atk',
        attr: str(x.attr, '?') || '?', race: str(x.race), kind: KINDS.includes(x.kind as MonKind) ? (x.kind as MonKind) : 'main',
        intr: c.intr, uses: c.uses, noDestroy: c.noDestroy, noTarget: c.noTarget,
      };
    });
    s.opp.st = (Array.isArray(o.st) ? o.st : []).filter(isObj).map((x): OppStInput => ({ uid: 'o' + uid++, ...common(x), stype: x.stype === 'S' ? 'S' : 'T' }));
    return s;
  } catch {
    return fresh();
  }
}
