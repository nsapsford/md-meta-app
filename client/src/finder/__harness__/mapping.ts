// The only place the reference's names meet the new engine's: step tags, interruption kinds and
// the situation config. Card ids need no mapping (the deck file's card ids are the reference's
// NAMES keys).

import type { Cfg, Interruption, OppCard, Tags } from '../engine/types';
import type { RefCfg, RefIntr } from './loadReference';

/** Reference step tag → new tag. The reference tag `dm` is the deck mark 'dm' (see refTags). */
export const TAG_MAP = { ash: 'deckTouch', droll: 'deckAdd', field: 'fieldMon', handEff: 'handMon', gy: 'gy', spell: 'spell', trap: 'trap', noResp: 'noResp', inherent: 'inherent', removal: 'removal', dig: 'dig' } as const;   // reference tag `dm` → deck mark 'dm'
export const KIND_MAP = { ash: 'negDeckTouch', imperm: 'negFieldMon', veiler: 'negFieldMon', belle: 'negGy', droll: 'lockDeckAdds', nibiru: 'wipeAtSummons', negMon: 'negMon', negST: 'negST', negAny: 'negAny', negSummon: 'negSummon', pop: 'pop', force: 'force', fuwalos: 'drawDeckExtraSummon', purulia: 'drawHandSummon', maxxc: 'drawSpecialSummon' } as const;

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

/** A reference step's tags as sorted new names (an unknown tag keeps its name behind a `?`). */
export function refTags(tags: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  for (const k in tags ?? {}) {
    if (!tags![k]) continue;
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
