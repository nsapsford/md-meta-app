// What the Finder's results side says about a line, in words: the headline number, the verdict,
// the marks and what-if options on each step, what can be recorded after a step, the status line
// and "How it decides". Port of the artifact's headline / boardShort / verdictHtml / stepHtml /
// recTypes / commitEvent / renderStatus / renderBranch titles. Nothing here knows a card: names
// come from the hand-trap data, the deck file and the lines themselves.

import type { IndexCard } from '../data/cardIndex';
import type { DeckFile, HandTrapFile, HandTrapEntry } from '../deck/schema';
import { DRAW_TEXT, drawBit, eligible } from '../engine/opponent';
import type { SerializedLine, SerializedStep } from '../engine/serialize';
import type { CardId, Interruption, OppCard, TurnEvent } from '../engine/types';
import {
  DEEP_BUDGET_MS, DEFAULT_BUDGET_MS, DEFAULT_DRAW_PENALTY, TOP_LINES, intrNames,
  type RecordedEvent, type SessionView, type ViewLine,
} from './solveSession';

type Mode = 'first' | 'second';
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const n = (x: unknown) => (typeof x === 'number' ? x : 0);

export const hardCount = (l: Pick<SerializedLine, 'items'>) => l.items.filter((x) => x[1] >= 0.9).length;
export const softCount = (l: Pick<SerializedLine, 'items'>) => l.items.filter((x) => x[1] >= 0.3 && x[1] < 0.9).length;

export interface Headline { big: string; small: string; tone: 'good' | 'warn' | 'plain' }
/** The big number of a line: hard interruptions going first; lethal or LP left going second. */
export function headline(l: Pick<SerializedLine, 'items' | 'summary'>, mode: Mode): Headline {
  if (mode === 'second') {
    const s = l.summary;
    if (s.lethal) return { big: 'Lethal', small: `${fmt(n(s.battle) + n(s.burn))} dmg`, tone: 'good' };
    return { big: fmt(Math.max(0, n(s.oppLp) - n(s.battle))), small: 'LP left', tone: 'warn' };
  }
  const h = hardCount(l);
  return { big: String(h), small: h === 1 ? 'interruption' : 'interruptions', tone: 'plain' };
}
/** The board in a few words. */
export function boardShort(l: Pick<SerializedLine, 'items' | 'summary'>, mode: Mode): string {
  if (mode === 'second') { const h = headline(l, mode); return `${h.big} ${h.small}`; }
  const sf = softCount(l);
  return `${plural(hardCount(l), 'interruption')}${sf ? ` + ${sf} soft` : ''}`;
}

/** The verdict panel's title and pills. */
export function verdictText(l: SerializedLine, mode: Mode): { title: string; pills: { text: string; soft: boolean }[] } {
  const hardItems = l.items.filter((x) => x[1] >= 0.9), soft = l.items.filter((x) => x[1] >= 0.3 && x[1] < 0.9);
  if (mode === 'second') {
    const s = l.summary;
    const title = s.lethal ? `${fmt(n(s.battle))} battle damage${n(s.burn) ? ` + ${fmt(n(s.burn))} burn` : ''} into ${fmt(n(s.oppLp) + n(s.burn))} LP` : `${fmt(n(s.battle) + n(s.burn))} damage this turn, then you pass`;
    return { title, pills: [{ text: `Removes ${plural(n(s.removed), 'card')}`, soft: false }, ...hardItems.map((x) => ({ text: x[0].split(':')[0], soft: true }))] };
  }
  return {
    title: `hard ${hardCount(l) === 1 ? 'interruption' : 'interruptions'} on their turn`,
    pills: [...hardItems.map((x) => ({ text: x[0].split(':')[0], soft: false })), ...soft.map((x) => ({ text: x[0].split(/[:(]/)[0].trim(), soft: true }))],
  };
}

/** Steps, summons, steps that touch the Deck, and where a wipe-at-summons hand trap could land. */
export function lineFacts(l: SerializedLine, traps: Pick<HandTrapFile, 'traps'>): string[] {
  const out = [plural(l.steps.length, 'step'), plural(l.summons, 'summon'), `${l.steps.filter((s) => s.tags.deckTouch).length} from the Deck`];
  const wipe = traps.traps.find((t) => t.mechanism === 'wipeAtSummons');
  if (wipe) {
    const at = l.steps.findIndex((s) => s.wipeHere);
    out.push(at >= 0 ? `${wipe.short} from step ${at + 1}` : `No ${wipe.short} window`);
  }
  return out;
}

/** Under a live draw effect: what this board costs. */
export function tradeNote(l: SerializedLine, drawFx: number, traps: Pick<HandTrapFile, 'traps'>): { title: string; sub: string; tone: 'good' | 'warn' } | null {
  if (!drawFx) return null;
  const d = n(l.summary.draws), eff = n(l.summary.eff);
  const rules = traps.traps.filter((t) => drawFx & drawBit(t.mechanism)).map((t) => `${t.short}: ${DRAW_TEXT[t.mechanism]}.`).join(' ');
  return {
    title: d ? `They draw ${plural(d, 'card')} for this board` : 'They draw nothing for this board',
    sub: rules + (eff < d ? ` They keep ${eff} of them after the End Phase hand limit.` : ''),
    tone: d ? 'warn' : 'good',
  };
}

/** What the worst case was: their best play, and the interruptions with nothing left to hit. */
export function worstDetail(v: Pick<ViewLine, 'line' | 'worst'>): { sub: string; hasLine: boolean; firstHit: { step: number; label: string } | null } | null {
  const w = v.worst;
  if (!w) return null;
  const hurt = w.score < v.line.score - 0.5;
  const used = w.applied.filter((a) => a.step != null);
  const where = (a: { step: number | null }) => (a.step! < 0 ? 'at the start of your turn' : `on step ${a.step! + 1}`);
  const at = used.length ? `${used[0].it.label} ${where(used[0])}${used.length > 1 ? ', then ' + used.slice(1).map((a) => a.it.label).join(' and ') : ''}` : '';
  const dead = [...new Set(w.applied.filter((a) => a.step == null).map((a) => a.it.label))];
  const sub = hurt
    ? [at ? `Their best play: ${at}.` : '', dead.length ? `${dead.join(', ')} has nothing left to hit.` : ''].filter(Boolean).join(' ')
    : at ? `Even with ${at}, you have another route to the same result.` : '';
  const first = hurt ? used.find((a) => a.step != null && a.step >= 0) : undefined;
  return { sub, hasLine: !!at, firstHit: first ? { step: first.step!, label: first.it.label } : null };
}

export interface Protection { label: string; stepNote?: string }
export interface StepMark { text: string; tone: 'on' | 'safe' | 'hit' | 'draw'; title?: string }
const itKey = (it: Interruption) => `${it.kind}|${it.src}|${it.uid ?? ''}`;
const uniq = (intrs: Interruption[]) => { const seen = new Set<string>(); return intrs.filter((it) => { const k = itKey(it); if (seen.has(k)) return false; seen.add(k); return true; }); };
const shortName = (it: Interruption) => it.short ?? it.label;

/** The marks on a step: the worst-case hit, their draws, which chosen interruptions can hit it, and the answers you have ready. */
export function stepMarks(s: SerializedStep, intrs: Interruption[], protections: Protection[], hit?: string): StepMark[] {
  const out: StepMark[] = [];
  if (hit) out.push({ text: `Worst case: ${hit}`, tone: 'hit' });
  if (s.draws) out.push({ text: `They draw ${s.draws}`, tone: 'draw', title: 'A summon that their draw effect counts' });
  const can = [...new Set(uniq(intrs).filter((it) => !drawBit(it.kind) && eligible(s, it)).map(shortName))];
  for (const c of can) out.push({ text: c, tone: 'on', title: `${c} can hit this step` });
  if (s.tags.noResp) out.push({ text: 'No response possible', tone: 'safe' });
  if (can.length) {
    for (const note of s.notes) {
      const p = protections.find((x) => x.stepNote === note);
      const label = p ? p.label.replace(/\s*\(.*\)$/, '') : note;
      out.push({ text: `${label} can answer`, tone: 'safe', title: 'You have an answer ready at this point' });
    }
  }
  return out;
}

/** The generic negation for "Negated here" and "This step was stopped". */
export const NEGATE: Interruption = { kind: 'force', src: 'hand', label: 'Negate' };

/** "What if they … here": the chosen interruptions that can hit this step, and a plain negation. */
export function whatIfOptions(s: SerializedStep, intrs: Interruption[]): { label: string; it: Interruption }[] {
  if (s.ev || s.interrupted || !s.key) return [];
  const out: { label: string; it: Interruption }[] = [];
  if (s.canNeg) out.push({ label: 'Negated here', it: NEGATE });
  for (const it of uniq(intrs)) if (eligible(s, it)) out.push({ label: `${shortName(it)} here`, it });
  return out;
}

/** The title of the branch view. */
export function branchTitle(step: number, it: Interruption, s: SerializedStep | undefined): string {
  const name = shortName(it);
  if (drawBit(it.kind)) return s?.tags.inherent ? `If they answer step ${step + 1} with ${name}` : `If they chain ${name} to step ${step + 1}`;
  if (it.kind === 'force') return `If step ${step + 1} is negated`;
  return `If they use ${name} on step ${step + 1}`;
}

const NEGATIONS = new Set(['negDeckTouch', 'negFieldMon', 'negGy', 'negMon', 'negST', 'negAny']);
export const trapIt = (t: HandTrapEntry, force = false): Interruption => {
  const it: Interruption = { kind: t.mechanism, src: 'hand', label: t.label, short: t.short, monster: t.monster };
  if (t.param !== undefined) it.param = t.param;
  if (force) it.force = true;
  return it;
};

export type RecordType = 'stop' | 'lose' | 'gain' | 'oppAdd' | `trap:${string}`;
/** What can be recorded after a step (the artifact's recTypes; hand traps from the data). */
export function recordOptions(s: SerializedStep, traps: Pick<HandTrapFile, 'traps'>): { type: RecordType; label: string }[] {
  const t: { type: RecordType; label: string }[] = [];
  if (s.canNeg) t.push({ type: 'stop', label: 'This step was stopped (negated or destroyed)' });
  for (const h of traps.traps) {
    if (NEGATIONS.has(h.mechanism) || !s.key) continue;
    if (eligible(s, trapIt(h))) t.push({ type: `trap:${h.id}`, label: `${h.label} resolved ${h.mechanism === 'wipeAtSummons' ? 'after' : 'on'} this step` });
  }
  if (s.mons.length + s.sts.length) t.push({ type: 'lose', label: 'I lost a card from my field after this step' });
  t.push({ type: 'gain', label: 'I drew or added a card after this step' });
  t.push({ type: 'oppAdd', label: 'They summoned a monster after this step' });
  return t;
}
/** Hand traps that could have stopped a step: the negations, for "By which card?". */
export const stopCards = (traps: Pick<HandTrapFile, 'traps'>) => traps.traps.filter((h) => NEGATIONS.has(h.mechanism));

/** A monster they summoned, from the index when its name is known (only a floodgate is kept as what it does). */
export function oppAddMon(name: string, hit: IndexCard | undefined, uid: string): Partial<OppCard> {
  if (hit && hit.mon) {
    const intr = hit.intr && hit.intr.startsWith('flood') ? hit.intr : null;
    return { uid, name: hit.name, atk: hit.atk ?? 0, def: hit.def ?? 0, attr: hit.attr || '?', race: hit.race || '?', ext: (hit.kind ?? 'main') !== 'main', intr };
  }
  return { uid, name: name.trim() || 'a monster' };
}

/** A recorded event in words. */
export function eventText(ev: RecordedEvent, short: (id: CardId) => string): string {
  if (ev.t === 'hit') return ev.it.kind === 'force' ? `Step ${ev.step + 1} stopped${ev.it.label !== NEGATE.label ? ' by ' + ev.it.label : ''}` : `${ev.it.label} on step ${ev.step + 1}`;
  const e = ev as TurnEvent;
  if (e.t === 'lose') return `Lost ${short(e.id)}${e.to === 'ban' ? ' (banished)' : e.to === 'hand' ? ' (back to hand or Extra Deck)' : ''}`;
  if (e.t === 'gain') return `${short(e.id)} in hand${e.replace ? ' (the unknown card)' : ''}`;
  return `They summoned ${e.mon.name || 'a monster'}`;
}

/** The draw effects of `bits`, by short name. */
export function drawNames(bits: number, traps: Pick<HandTrapFile, 'traps'>): string {
  return traps.traps.filter((t) => bits & drawBit(t.mechanism)).map((t) => t.short).join(' + ');
}

/** The status line above the lines. */
export function statusText(v: SessionView, traps: Pick<HandTrapFile, 'traps'>): string {
  switch (v.phase) {
    case 'idle': return 'Add the cards in your hand to see lines.';
    case 'solving': return `${v.deep ? 'Searching deeper…' : 'Finding lines…'}${v.nodes ? ` ${fmt(v.nodes)} positions` : ''}`;
    case 'testing': return `Testing against ${intrNames(v.intrs)}… tested ${v.tested} of ${v.total}`;
    case 'done': return `${(v.ms / 1000).toFixed(1)} s · ${fmt(v.nodes)} positions${v.drawFx ? ` · under ${drawNames(v.drawFx, traps)}` : ''}${v.intrs.length ? ` · tested against ${intrNames(v.intrs)}` : ''}`;
    case 'error': return `The search failed (${v.message}). Change a card or press Search deeper to retry.`;
  }
}

export interface ResultTab { v: ViewLine; label: string; badge: string | null }
/**
 * The line tabs: under a draw effect every trade-off option; otherwise up to three lines (plus the
 * one selected and the one that held up best, if they are further down), then "Safest lethal".
 */
export function resultTabs(v: Pick<SessionView, 'lines' | 'safest' | 'selected' | 'better' | 'drawFx'>, max = TOP_LINES): ResultTab[] {
  const badge = (l: ViewLine) => l.badges[0] ?? null;
  if (v.drawFx) return v.lines.map((l, i) => ({ v: l, label: `Line ${i + 1}`, badge: badge(l) }));
  const safe = v.safest?.key ?? null;
  const rest = v.lines.filter((l) => l.key !== safe);
  const shown = rest.slice(0, max);
  for (const k of [v.selected, v.better]) { const l = rest.find((x) => x.key === k); if (l && !shown.includes(l)) shown.push(l); }
  const out: ResultTab[] = shown.map((l) => ({ v: l, label: `Line ${rest.indexOf(l) + 1}`, badge: badge(l) }));
  if (v.safest) out.push({ v: v.safest, label: 'Safest lethal', badge: null });
  return out;
}

/** "How it decides", with the deck's name, its card count, its protections and the draw effects from the data. */
export function howItDecides(deckName: string, cardCount: number, file: Pick<DeckFile, 'protections'>, traps: Pick<HandTrapFile, 'traps'>): string[] {
  const prot = [...new Set((file.protections ?? []).map((p) => p.label.replace(/\s*\(.*\)$/, '')))];
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const draws = traps.traps.filter((t) => drawBit(t.mechanism)).map((t) => t.short);
  const out = [
    `The solver plays your Main Phase 1 from the card texts of the ${cardCount} cards in the ${deckName} deck file and scores the end position: interruptions for their turn going first, damage and removal going second. With interruptions set, it also looks for lines that bait them out, then replays every candidate with each interruption used on your worst step and re-solves what you do next.${prot.length ? ` ${list(prot)} answer their interruptions where the card text allows.` : ''}`,
  ];
  if (draws.length) out.push(`${list(draws)}: once one is live, every summon it counts gives them a card, and a card for them is weighed at a bit over half an interruption (${DEFAULT_DRAW_PENALTY} points, where one hard interruption is 100) when the suggested line is picked. The other lines show the best board for more or fewer draws, so you can choose a different trade. Chained to one of your activations it counts that step; in answer to a summon that starts no chain it counts from the next one.`);
  out.push('Against one interruption the worst case is exact: every step it could hit is tried. Against two or more it is close but can be slightly optimistic, because they are spent one after another, each where it hurts most. What a card on their field can do is a best guess from its text when you pick it by name: check the "on your turn" setting.');
  out.push(`Each search runs for about ${(DEFAULT_BUDGET_MS / 1000).toFixed(2).replace(/0$/, '')} seconds (about ${DEEP_BUDGET_MS / 1000} with Search deeper) and keeps the best ${TOP_LINES} lines. It doesn't model what their cards do when destroyed, or their own turn.`);
  return out;
}
