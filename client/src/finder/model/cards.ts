// The deck's cards as the Finder page shows them: frame, level band, stats, the picker's groups,
// copies left, type-to-find, and card names inside step text. Everything comes from the deck file,
// its card facts and the hand-trap data. Nothing here knows a card.

import type { CardFacts, DeckFile, HandTrapFile } from '../deck/schema';
import type { CardId } from '../engine/types';
import { BLANK, MAX_HAND, type FinderSnapshot, type ResolvedList } from './finderState';

export type Frame = 'normal' | 'effect' | 'ritual' | 'fusion' | 'synchro' | 'xyz' | 'link' | 'spell' | 'trap' | 'other';
export interface FinderCard {
  id: CardId; short: string; name: string; passcode: number | null; facts: CardFacts | null;
  frame: Frame; extra: boolean; handTrap: boolean; order: number;
}
export type Catalog = Map<CardId, FinderCard>;

const EXTRA_FRAMES: ReadonlySet<Frame> = new Set(['fusion', 'synchro', 'xyz', 'link']);

export function frameOf(f: Pick<CardFacts, 'type'> | null): Frame {
  const t = f?.type ?? '';
  if (/Spell/.test(t)) return 'spell';
  if (/Trap/.test(t)) return 'trap';
  if (/Fusion/.test(t)) return 'fusion';
  if (/Synchro/.test(t)) return 'synchro';
  if (/Xyz/.test(t)) return 'xyz';
  if (/Link/.test(t)) return 'link';
  if (/Ritual/.test(t)) return 'ritual';
  if (/Normal/.test(t)) return 'normal';
  if (/Monster/.test(t)) return 'effect';
  return 'other';
}

/** Every card of the (merged) deck file, with its facts and whether it is one of the hand traps. */
export function buildCatalog(file: Pick<DeckFile, 'cards'>, facts: CardFacts[], traps: Pick<HandTrapFile, 'traps'>): Catalog {
  const byCode = new Map(facts.map((f) => [f.passcode, f]));
  const trapCodes = new Set(traps.traps.flatMap((t) => t.passcodes));
  const out: Catalog = new Map();
  for (const c of file.cards) {
    const code = c.passcodes.find((p) => byCode.has(p)) ?? c.passcodes[0] ?? null;
    const f = code != null ? byCode.get(code) ?? null : null;
    const frame = frameOf(f);
    out.set(c.id, {
      id: c.id, short: c.short, name: f?.name ?? c.short, passcode: code, facts: f, frame,
      extra: EXTRA_FRAMES.has(frame), handTrap: c.passcodes.some((p) => trapCodes.has(p)), order: c.listOrder ?? Infinity,
    });
  }
  return out;
}

export const shortOf = (cat: Catalog) => (id: CardId): string => (id === BLANK ? 'Blank' : cat.get(id)?.short ?? id);

/** The small band on a card: level, Link rating or Spell/Trap kind. */
export function cardBand(c: FinderCard | undefined): string {
  if (!c) return 'Any';
  const f = c.facts;
  if (c.frame === 'spell') return f?.race === 'Quick-Play' ? 'Quick' : f?.race === 'Continuous' ? 'Cont.' : 'Spell';
  if (c.frame === 'trap') return 'Trap';
  if (c.frame === 'link') return `Link-${f?.link ?? f?.level ?? '?'}`;
  return f?.level != null ? `★ ${f.level}` : '';
}

/** ATK/DEF (a Link monster: ATK only); '' for Spells and Traps. */
export function cardStats(c: FinderCard | undefined): string {
  const f = c?.facts;
  if (!c || !f || f.atk == null) return '';
  return c.frame === 'link' || f.def == null ? String(f.atk) : `${f.atk}/${f.def}`;
}

/** The line under a card's name in its text view. */
export function factsLine(c: FinderCard): string {
  const f = c.facts;
  if (!f) return '';
  if (/Monster/.test(f.type)) {
    const lv = c.frame === 'link' ? `Link-${f.link ?? f.level ?? '?'}` : f.level != null ? `Level ${f.level}` : '';
    const stats = f.atk == null ? '' : `${f.atk}${c.frame !== 'link' && f.def != null ? ' / ' + f.def : ''}`;
    return [[f.attr, f.race].filter(Boolean).join(' '), lv, stats].filter(Boolean).join(' · ');
  }
  return `${f.race ?? ''} ${f.type.replace(' Card', '')}`.trim();
}

export const GROUP_LABELS = { mon: 'Starters and monsters', spell: 'Spells', trap: 'Traps', handTrap: 'Hand traps', other: 'Anything else' } as const;
export interface PickerGroup { label: string; ids: CardId[] }

const byOrder = (cat: Catalog) => (a: CardId, b: CardId) => {
  const x = cat.get(a)!, y = cat.get(b)!;
  return x.order - y.order || (a < b ? -1 : a > b ? 1 : 0);
};

/** The Main Deck cards of the list, grouped by kind, then a blank. */
export function pickerGroups(cat: Catalog, list: ResolvedList): PickerGroup[] {
  const ids = Object.keys(list.main).filter((id) => list.main[id] > 0 && cat.has(id)).sort(byOrder(cat));
  const pick = (f: (c: FinderCard) => boolean) => ids.filter((id) => f(cat.get(id)!));
  const groups: PickerGroup[] = [
    { label: GROUP_LABELS.mon, ids: pick((c) => !c.handTrap && c.frame !== 'spell' && c.frame !== 'trap') },
    { label: GROUP_LABELS.spell, ids: pick((c) => !c.handTrap && c.frame === 'spell') },
    { label: GROUP_LABELS.trap, ids: pick((c) => !c.handTrap && c.frame === 'trap') },
    { label: GROUP_LABELS.handTrap, ids: pick((c) => c.handTrap) },
    { label: GROUP_LABELS.other, ids: [BLANK] },
  ];
  return groups.filter((g) => g.ids.length);
}

/** Copies of `id` still in the deck (blanks never run out). */
export function copiesLeft(list: ResolvedList, hand: CardId[], id: CardId): number {
  if (id === BLANK) return Infinity;
  return (list.main[id] || 0) - hand.filter((h) => h === id).length;
}

/** How well `q` (lower case) finds a card: 4 short name starts with it … 1 contains it, 0 not at all. */
export function matchScore(c: FinderCard | undefined, id: CardId, q: string): number {
  if (!q) return 0;
  const s = (c ? c.short : 'blank').toLowerCase(), n = (c ? c.name : 'blank other unknown').toLowerCase();
  if (s.startsWith(q)) return 4;
  if (s.split(/[\s'-]+/).some((w) => w.startsWith(q)) || id.toLowerCase() === q) return 3;
  if (n.split(/[\s',:-]+/).some((w) => w.startsWith(q))) return 2;
  if (n.includes(q) || s.includes(q)) return 1;
  return 0;
}

/** The card Enter adds for `q`: the best match with a copy left. */
export function bestMatch(cat: Catalog, groups: PickerGroup[], list: ResolvedList, hand: CardId[], q: string): CardId | null {
  if (!q) return null;
  let best: CardId | null = null, bs = 0;
  for (const g of groups) for (const id of g.ids) {
    if (copiesLeft(list, hand, id) <= 0) continue;
    const sc = matchScore(cat.get(id), id, q);
    if (sc > bs) { bs = sc; best = id; }
  }
  return best;
}

export type AddResult = { snap: FinderSnapshot } | { error: string };
/** `id` added to the hand, if there is room and a copy left. */
export function addToHand(s: FinderSnapshot, list: ResolvedList, id: CardId, short: (id: CardId) => string): AddResult {
  if (s.hand.length >= MAX_HAND) return { error: 'Seven cards is the most this hand can hold.' };
  if (copiesLeft(list, s.hand, id) <= 0) return { error: `No copies of ${short(id)} left in the deck.` };
  return { snap: { ...s, hand: s.hand.concat([id]) } };
}
export function removeFromHand(s: FinderSnapshot, index: number): FinderSnapshot {
  if (index < 0 || index >= s.hand.length) return s;
  return { ...s, hand: s.hand.filter((_, i) => i !== index) };
}
/** Hand slots shown: 5 going first, 6 going second (more once the hand is bigger). */
export const handSlots = (s: Pick<FinderSnapshot, 'mode'>) => (s.mode === 'first' ? 5 : 6);

export interface TextPart { text: string; id?: CardId }
/** `text` split so each card name (full or short) in it can be tapped; longest names first. */
export function cardTokens(cat: Catalog): (text: string) => TextPart[] {
  const list: [string, CardId][] = [];
  for (const c of cat.values()) {
    list.push([c.name, c.id]);
    if (c.short && c.short !== c.name) list.push([c.short, c.id]);
  }
  list.sort((a, b) => b[0].length - a[0].length);
  const map = new Map(list);
  if (!list.length) return (text) => [{ text }];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[^A-Za-z])(' + list.map(([n]) => esc(n)).join('|') + ')(?![A-Za-z])', 'g');
  return (text) => {
    const out: TextPart[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      const at = m.index! + m[1].length;
      if (at > last) out.push({ text: text.slice(last, at) });
      out.push({ text: m[2], id: map.get(m[2]) });
      last = at + m[2].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  };
}
