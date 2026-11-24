// Editing their field going second: new rows, rows from the card index, the position cycle and
// the short words for what a card does on your turn. Port of the artifact's newMon / newST /
// fromIndex / acSearch row filling. Nothing here knows a card.

import type { IndexCard } from '../data/cardIndex';
import type { HandTrapFile } from '../deck/schema';
import type { FinderSnapshot, OppMonInput, OppStInput } from './finderState';

/** The next free row id ('o1', 'o2', …). */
export function nextUid(s: Pick<FinderSnapshot, 'opp'>): string {
  let n = 0;
  for (const r of [...s.opp.mons, ...s.opp.st]) { const k = /^o(\d+)$/.exec(r.uid); if (k) n = Math.max(n, +k[1]); }
  return 'o' + (n + 1);
}

export const newMon = (uid: string, o: Partial<OppMonInput> = {}): OppMonInput => ({
  uid, name: '', atk: 0, def: 0, pos: 'atk', attr: '?', race: '', kind: 'main', intr: '', uses: 1, noDestroy: false, noTarget: false, ...o,
});
export const newSt = (uid: string, o: Partial<OppStInput> = {}): OppStInput => ({
  uid, name: '', intr: '', uses: 1, noDestroy: false, noTarget: false, stype: 'T', ...o,
});

/** A row filled from the card index: stats, Attribute, Type, kind and what it does on your turn. */
export function rowFromIndex(c: IndexCard, uid: string): { mon: OppMonInput } | { st: OppStInput } {
  if (c.mon) return { mon: newMon(uid, { name: c.name, atk: c.atk ?? 0, def: c.def ?? 0, attr: c.attr || '?', race: c.race || '', kind: c.kind ?? 'main', intr: c.intr ?? '' }) };
  return { st: newSt(uid, { name: c.name, intr: c.intr ?? '', stype: c.st ?? 'T' }) };
}

/** Their card added from the index, at the end of its row. */
export function addFromIndex(s: FinderSnapshot, c: IndexCard): FinderSnapshot {
  const r = rowFromIndex(c, nextUid(s));
  return 'mon' in r ? { ...s, opp: { ...s.opp, mons: s.opp.mons.concat([r.mon]) } } : { ...s, opp: { ...s.opp, st: s.opp.st.concat([r.st]) } };
}

/**
 * A monster row whose name was typed in full: when the index knows it and nothing has been typed
 * into its stats, the rest is filled in (position and id kept). Otherwise the row as it is.
 */
export function fillMonByName(m: OppMonInput, hit: IndexCard | undefined): OppMonInput {
  if (!hit || !hit.mon || m.atk || m.def) return m;
  const r = rowFromIndex(hit, m.uid) as { mon: OppMonInput };
  return { ...r.mon, pos: m.pos, uses: m.uses, noDestroy: m.noDestroy, noTarget: m.noTarget };
}
export function fillStByName(x: OppStInput, hit: IndexCard | undefined): OppStInput {
  if (!hit || hit.mon || x.intr) return x;
  const r = rowFromIndex(hit, x.uid) as { st: OppStInput };
  return { ...r.st, uses: x.uses, noDestroy: x.noDestroy, noTarget: x.noTarget };
}

export const nextPos = (p: OppMonInput['pos']): OppMonInput['pos'] => (p === 'atk' ? 'def' : p === 'def' ? 'set' : 'atk');
export const POS_LABEL: Record<OppMonInput['pos'], string> = { atk: 'ATK', def: 'DEF', set: 'SET' };

/** The label of a board kind ('' does nothing). */
export function boardLabel(traps: Pick<HandTrapFile, 'boardOptions'>, kind: string): string {
  return (traps.boardOptions.find((o) => o.kind === kind) ?? traps.boardOptions[0])?.label ?? '';
}
/** A board kind in a few lower-case words, for the suggestion list. */
export function boardShort(traps: Pick<HandTrapFile, 'boardOptions'>, kind: string): string {
  if (!kind) return '';
  return boardLabel(traps, kind).replace(/^Negates /, 'negates ').replace(/^Removes /, 'removes ').replace(/^Floodgate: /, '');
}
/** What an unknown Set card can be assumed to do: the board options that are not floodgates, in lower case. */
export function setAssumeOptions(traps: Pick<HandTrapFile, 'boardOptions'>): { kind: string; label: string }[] {
  const verb = (l: string) => l.replace(/^Negates /, 'negate ').replace(/^Removes /, 'remove ');
  return traps.boardOptions.filter((o) => !o.kind.startsWith('flood')).map((o) => ({ kind: o.kind, label: o.kind ? verb(o.label) : 'do nothing' }));
}

/** The note under "What you can't see". */
export function unseenNote(s: Pick<FinderSnapshot, 'oppHand' | 'hts' | 'live'>): string {
  const on = s.hts.filter((k) => !s.live.includes(k)).length;
  if (s.oppHand == null) return 'Hand size unknown: every hand trap switched on can be used.';
  if (on > s.oppHand) return `They hold ${s.oppHand}, so at most ${s.oppHand} of the ${on} hand traps switched on are used against a line.`;
  return `They hold ${s.oppHand}. Recording a hand trap they used lowers this.`;
}

export const ATTRS = ['?', 'DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'] as const;
export const MON_KINDS: [OppMonInput['kind'], string][] = [['main', 'Main Deck'], ['fusion', 'Fusion'], ['synchro', 'Synchro'], ['xyz', 'Xyz'], ['link', 'Link']];
