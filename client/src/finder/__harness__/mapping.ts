// The only place the reference's names meet the new engine's: step tags, interruption kinds and
// the situation config. Card ids need no mapping (the deck file's card ids are the reference's
// NAMES keys).

import type { Cfg, Interruption, OppCard, Tags } from '../engine/types';
import type { RefCfg, RefIntr } from './loadReference';

/** Reference step tag → new tag. The reference tag `dm` is the deck mark 'dm' (see refTags). */
export const TAG_MAP = { ash: 'deckTouch', droll: 'deckAdd', field: 'fieldMon', handEff: 'handMon', gy: 'gy', spell: 'spell', trap: 'trap', noResp: 'noResp', inherent: 'inherent', removal: 'removal', dig: 'dig' } as const;   // reference tag `dm` → deck mark 'dm'
export const KIND_MAP = { ash: 'negDeckTouch', imperm: 'negFieldMon', veiler: 'negFieldMon', belle: 'negGy', droll: 'lockDeckAdds', nibiru: 'wipeAtSummons', negMon: 'negMon', negST: 'negST', negAny: 'negAny', negSummon: 'negSummon', pop: 'pop', force: 'force', fuwalos: 'drawDeckExtraSummon', purulia: 'drawHandSummon', maxxc: 'drawSpecialSummon' } as const;

/**
 * Reference pending-trigger name (`pend[].t`) → the DM Azamina deck file's effect key. Tasks 11–16
 * add a row for each trigger their cards bring. The observation names a pending trigger by the
 * new key; a name in neither table's column throws (see observe.ts).
 */
export const PEND_MAP: Record<string, string> = {
  rod: 'rod', circ2: 'circ2', tali3: 'tali3',   // group 2
  dmg: 'dmg1',   // group 4
};

/**
 * Reference once-per-turn slot (`OPT_NAMES`) → the deck file's limit name (an effect key with
 * `limit: 'oncePerTurn'`, or a `{ shared }` limit name). Tasks 11–16 add rows as above.
 */
export const OPT_MAP: Record<string, string> = {
  rod1: 'rod', circ1: 'circ1', circ2: 'circ2', curt: 'curt', tali3: 'tali3', ssrv2: 'ssrv2',   // group 2
  souls1: 'souls1', souls2: 'souls2', serv: 'serv', ioc1: 'ioc',   // group 3
  sarc1: 'sarc1', fsil: 'fsil', dmgP: 'dmg', dmg1: 'dmg1', dmbm1: 'dmbm', gand1: 'gand', gand2: 'gand2',   // group 4
};

/** Map reference names through `table`, throwing on any it doesn't hold. */
export function mapRefNames(names: readonly string[], table: Record<string, string>, what: string): string[] {
  return names.map((n) => {
    if (!Object.prototype.hasOwnProperty.call(table, n)) throw new Error(`mapping: unmapped reference ${what} "${n}" (add it to ${what === 'trigger' ? 'PEND_MAP' : 'OPT_MAP'} in mapping.ts)`);
    return table[n];
  });
}

/** Check new-engine names against `table`'s values, throwing on any no reference name maps to. */
export function checkNewNames(names: readonly string[], table: Record<string, string>, what: string): string[] {
  const known = new Set(Object.values(table));
  for (const n of names) if (!known.has(n)) throw new Error(`mapping: unmapped new-engine ${what} "${n}" (add it to ${what === 'trigger' ? 'PEND_MAP' : 'OPT_MAP'} in mapping.ts)`);
  return names.slice();
}

/** Reference marks that are deck marks in the new engine (tag name = mark name). */
const REF_MARKS = new Set(['dm']);

const kind = (k: string): string => (KIND_MAP as Record<string, string>)[k] ?? k;

/** The situation in the new engine's terms: mul → drawFx (same bits), dpen → drawPenalty, opponent card kinds through KIND_MAP. */
export function toCfg(ref: RefCfg): Cfg {
  const out: Cfg = { mode: ref.mode, hand: { ...ref.hand }, deck: { ...ref.deck }, extra: { ...ref.extra } };
  if (ref.opp) {
    const card = (c: any): OppCard => ({ ...c, intr: c.intr == null ? c.intr : kind(c.intr) });
    out.opp = { lp: ref.opp.lp, mons: ref.opp.mons.map(card), st: ref.opp.st.map(card) };
  }
  if (ref.mul != null) out.drawFx = ref.mul;
  if (ref.dpen != null) out.drawPenalty = ref.dpen;
  if (ref.base) out.base = ref.base.slice();
  return out;
}

export function toIntr(ref: RefIntr): Interruption {
  const out: Interruption = { kind: kind(ref.kind), src: ref.src, label: ref.label ?? ref.kind };
  if (ref.uid !== undefined) out.uid = ref.uid;
  if (ref.cardKind !== undefined) out.cardKind = ref.cardKind;
  if (ref.force !== undefined) out.force = ref.force;
  return out;
}

/**
 * Reference tags that nothing in the reference reads (not kindEligible, protectionFor, the Spell or
 * monster floodgates, done, or the line notes), so they mean no tag: dropped. `hand` is on Pharaoh's
 * Servant's hand move only (its step has `handEff`).
 */
const UNREAD_REF_TAGS = new Set(['hand']);

/** A reference step's tags as sorted new names (an unknown tag keeps its name behind a `?`). */
export function refTags(tags: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  for (const k in tags ?? {}) {
    if (!tags![k] || UNREAD_REF_TAGS.has(k)) continue;
    out.push(REF_MARKS.has(k) ? k : (TAG_MAP as Record<string, string>)[k] ?? '?' + k);
  }
  return out.sort();
}

/** A new step's tags as sorted names, its marks decoded through the deck's mark bits. */
export function newTags(tags: Tags | null | undefined, markBit: Record<string, number>): string[] {
  const out: string[] = [];
  if (!tags) return out;
  for (const k of Object.keys(tags) as (keyof Tags)[]) if (k !== 'marks' && tags[k]) out.push(k);
  const m = tags.marks ?? 0;
  for (const name of Object.keys(markBit)) if ((m >>> markBit[name]) & 1) out.push(name);
  return out.sort();
}
