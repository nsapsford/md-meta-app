// The opponent's side of a turn: their interruptions (hand traps and cards on their field), the
// draw effects that go live at the start of the turn, your protections that answer them, and
// events the player records. What an interruption does is one of MECHANISMS (a `kind` may join
// several with `+`); what answers it is the compiled deck's `protections`. Port of the
// reference's kindEligible / eligible / pickKind / protectionFor / consumeProtection / interrupt /
// startMul / applyEvent. Nothing here knows a card.

import type { CompiledDeck, CompiledProtection, Run } from '../deck/compile';
import type { Moves } from './moves';
import type { StateOps } from './state';
import { DRAW_BIT, done, step } from './record';
import type { Interruption, Move, State, StepView, Tags, TurnEvent } from './types';

export const MECHANISMS: string[] = [
  'negDeckTouch', 'negFieldMon', 'negGy', 'lockDeckAdds', 'wipeAtSummons', 'negMon', 'negST', 'negAny',
  'negSummon', 'pop', 'force', 'drawDeckExtraSummon', 'drawHandSummon', 'drawSpecialSummon',
];

const NOTAGS: Tags = Object.freeze({});

/** Mechanisms that negate the step they hit. */
const NEGATES = new Set(['negDeckTouch', 'negFieldMon', 'negGy', 'negMon', 'negST', 'negAny']);
/** Mechanisms that do not respond to an activation (a protection that only answers responses ignores them). */
const NOT_IN_RESPONSE = new Set(['lockDeckAdds', 'wipeAtSummons', 'pop', 'negSummon', 'force']);
/** The draw effects: once live, they draw for your summons for the rest of the turn. */
const DRAW: Record<string, number> = DRAW_BIT;
export const DRAW_TEXT: Record<string, string> = {
  drawDeckExtraSummon: 'they draw 1 each time you Special Summon from the Deck or Extra Deck',
  drawHandSummon: 'they draw 1 each time you Normal or Special Summon from your hand',
  drawSpecialSummon: 'they draw 1 each time you Special Summon',
};
/** The draw-effect bit of a mechanism, or 0. */
export const drawBit = (kind: string): number => DRAW[kind] || 0;

const KIND_CACHE: Record<string, string[]> = {};
export const kindsOf = (kind: string): string[] => KIND_CACHE[kind] || (KIND_CACHE[kind] = String(kind).split('+'));

function kindEligible(kind: string, v: Pick<StepView, 'canNeg' | 'summonsAfter' | 'summoned' | 'oppCount'>, t: Tags, it: Interruption): boolean {
  switch (kind) {
    case 'negDeckTouch': return !!t.deckTouch && v.canNeg;
    case 'negFieldMon': return !!t.fieldMon && v.canNeg;
    case 'negGy': return !!t.gy && v.canNeg;
    case 'lockDeckAdds': return !!t.deckAdd;
    case 'wipeAtSummons': return v.summonsAfter >= (it.param ?? Infinity);
    case 'negMon': return !!(t.fieldMon || t.handMon) && v.canNeg;
    case 'negST': return !!(t.spell || t.trap) && !t.noResp && v.canNeg;
    case 'negAny': return !!(t.fieldMon || t.handMon || t.spell || t.trap) && !t.noResp && v.canNeg;
    case 'negSummon': return !!t.inherent;
    case 'pop': return !!v.summoned;
    case 'force': return !!v.canNeg;
    case 'drawDeckExtraSummon': case 'drawHandSummon': return !v.oppCount;   // "If you control no cards"
    case 'drawSpecialSummon': return true;
    default: return false;
  }
}

/** Can `it` hit the step `v`? Needs no deck. */
export function eligible(v: StepView, it: Interruption): boolean {
  if (v.interrupted || v.ev) return false;
  if (it.src === 'board' && !(v.oppPresent || []).includes(it.uid!)) return false;
  const t = v.tags || NOTAGS;
  const ks = kindsOf(it.kind);
  for (let i = 0; i < ks.length; i++) if (kindEligible(ks[i], v, t, it)) return true;
  return false;
}

/** Which of a card's mechanisms applies to this move. */
function pickKind(it: Interruption, act: Move): string {
  const ks = kindsOf(it.kind);
  if (ks.length === 1) return ks[0];
  const view = { canNeg: act.neg, summonsAfter: 0, summoned: !!(act.tags && act.tags.inherent), oppCount: 0 };
  for (let i = 0; i < ks.length; i++) if (ks[i] !== 'pop' && kindEligible(ks[i], view, act.tags || NOTAGS, it)) return ks[i];
  return ks[ks.length - 1];
}

export interface Opponent {
  interrupt(pre: State, act: Move, it: Interruption): State;
  startDraw(s: State, it: Interruption): State;
  applyEvent(s: State, ev: TurnEvent): State;
  protectionFor(pre: State, it: Interruption, tags: Tags): CompiledProtection | null;
  /** The protections whose card is ready before a step with these tags (their `where` and `marks`; limits not read). */
  ready(pre: State, tags: Tags): CompiledProtection[];
}

export function createOpponent(deck: CompiledDeck, moves: Pick<Moves, 'gen' | 'exec' | 'oppRemove'>, so: StateOps): Opponent {
  const { gen, exec } = moves;
  const props = deck.props, prots = deck.protections;
  const S = (id: number) => props[id].short;
  const ixOf = (id: string): number => {
    const i = deck.ix[id];
    if (i === undefined) throw new Error('unknown card id: ' + id);
    return i;
  };

  /** The protection's card as its words see it: a monster on the field, else a Set copy, else any copy on the field. */
  function runOf(s: State, card: number): Run {
    let i = s.mons.findIndex((m) => m.id === card);
    if (i >= 0) return { self: card, at: { zone: 'mon', at: i, uid: s.mons[i].uid }, chosen: [] };
    i = s.st.findIndex((x) => x.id === card && !x.up);
    if (i < 0) i = s.st.findIndex((x) => x.id === card);
    if (i >= 0) return { self: card, at: { zone: 'st', at: i, uid: null }, chosen: [] };
    return { self: card, at: { zone: 'none', at: -1, uid: null }, chosen: [] };
  }
  const whereHolds = (s: State, p: CompiledProtection): boolean => { const r = runOf(s, p.card); return p.where.every((c) => c(s, r)); };
  const marksCovered = (p: CompiledProtection, tags: Tags): boolean => !p.covers.marks || !!((tags.marks || 0) & p.covers.marks);

  function protectionFor(pre: State, it: Interruption, tags: Tags): CompiledProtection | null {
    const isMon = it.src === 'hand' ? !!it.monster : it.cardKind === 'mon';
    const inResponse = !NOT_IN_RESPONSE.has(it.kind);
    for (const p of prots) {
      if (p.covers.monsterOnly && !isMon) continue;
      if (p.covers.inResponseOnly && !inResponse) continue;
      if (!marksCovered(p, tags)) continue;
      if (p.limit >= 0 && so.getOpt(pre, p.limit)) continue;
      if (whereHolds(pre, p)) return p;
    }
    return null;
  }

  function ready(pre: State, tags: Tags): CompiledProtection[] {
    return prots.filter((p) => marksCovered(p, tags) && whereHolds(pre, p));
  }

  /**
   * Spend a protection. Its cost is paid outside any step: it records nothing on the ledger and
   * sets off no trigger (as the reference). Destroying the interrupting card does (their monster goes to the GY).
   */
  function consume(pre: State, p: CompiledProtection, it: Interruption): State {
    const n = so.clone(pre);
    if (p.limit >= 0) so.setOpt(n, p.limit);
    const pend = n.pend;
    step(n, '');
    const r = runOf(n, p.card);
    for (const a of p.consume) a(n, r);
    n.cur = null; n.pend = pend;
    if (p.destroysSource && it.src === 'board' && n.opp && (n.opp.mons.some((m) => m.uid === it.uid) || n.opp.st.some((x) => x.uid === it.uid))) moves.oppRemove(n, it.uid!, 'destroy');
    return n;
  }

  function interrupt(pre: State, act: Move, it0: Interruption): State {
    const kind = pickKind(it0, act);
    const it = kind === it0.kind ? it0 : { ...it0, kind };
    const label = it.label;
    let n: State | null = null, note = '';
    let a: Move = act;
    const bit = drawBit(kind);
    if (bit) {
      // Chained to an activation: live before it resolves, and you are committed to that step.
      // In response to a summon that starts no chain: live from the next summon on.
      if (act.tags && act.tags.inherent) {
        n = exec(pre, act, false);
        const pr = it.force ? null : protectionFor(n, it, NOTAGS);
        if (pr) { n = consume(n, pr, it); note = `${label} in response to this summon; ${pr.label} negates it`; } else { n.drawFx |= bit; note = `${label} in response to this summon: ${DRAW_TEXT[kind]} from here on`; }
      } else {
        const pr = it.force ? null : protectionFor(pre, it, act.tags || NOTAGS);
        const c = pr ? consume(pre, pr, it) : so.clone(pre);
        if (!pr) c.drawFx |= bit;
        a = gen(c).find((x) => x.k === act.k) || act;
        n = exec(c, a, false);
        note = pr ? `${label} chained to this; ${pr.label} negates it` : `${label} chained to this: ${DRAW_TEXT[kind]}, this step included`;
      }
    }
    const p = n || kind === 'force' || it.force ? null : protectionFor(pre, it, act.tags || NOTAGS);
    if (p) {
      const c = consume(pre, p, it);
      const b = gen(c).find((x) => x.k === act.k);
      if (b) { a = b; n = exec(c, b, false); note = `${label} here; ${p.label} negates it`; }
    }
    if (!n) {
      a = act;
      if (kind === 'force') {
        n = exec(pre, act, true); note = it.label && it.label !== 'Negate' ? `Stopped by ${it.label}` : 'Negated here';
      } else if (NEGATES.has(kind)) {
        n = exec(pre, act, true); note = `${label} negates this`;
      } else {
        n = exec(pre, act, false);
        const before = new Set(pre.mons.map((m) => m.uid));
        const fresh = n.mons.filter((m) => !before.has(m.uid));
        if (kind === 'negSummon') {
          const gy = so.W(n, 'gy');
          for (const m of fresh) { n.mons.splice(n.mons.indexOf(m), 1); gy[m.id]++; }
          n.pend = n.pend.filter((x) => pre.pend.includes(x));
          note = `${label}: the summon is negated and the monster destroyed`;
        } else if (kind === 'lockDeckAdds') {
          n.addLock = true; note = `${it.short ?? label} resolves after this: no more adds from the Deck`;
        } else if (kind === 'wipeAtSummons') {
          const ids = n.mons.map((m) => m.id);
          const gy = so.W(n, 'gy');
          for (let i = n.mons.length - 1; i >= 0; i--) { const m = n.mons.splice(i, 1)[0]; gy[m.id]++; }
          n.pend = [];
          note = `${label} after this: ${ids.map(S).join(', ')} tributed`;
        } else if (kind === 'pop') {
          const tg = fresh.filter((m) => !props[m.id].immuneToRemoval).sort((x, y) => (props[y.id].atk || 0) - (props[x.id].atk || 0))[0];
          if (tg) { n.mons.splice(n.mons.indexOf(tg), 1); so.W(n, 'gy')[tg.id]++; note = `${label}: ${S(tg.id)} is removed`; } else note = `${label}: nothing it can hit`;
        }
      }
    }
    const last = n.log[n.log.length - 1];
    if (last && last !== pre.log[pre.log.length - 1]) {
      n.log = n.log.slice(0, -1).concat([{ ...last, interrupted: note, pre, act: a }]);
    }
    n.path = pre.path.concat(['!' + JSON.stringify({ k: act.k, it: it0 })]);
    return n;
  }

  function startDraw(s0: State, it: Interruption): State {
    const s = so.clone(s0);
    s.drawFx |= drawBit(it.kind);
    s.opening = (s.opening || []).concat([`${it.label} at the start of your turn: ${DRAW_TEXT[it.kind]}`]);
    s.path = s0.path.concat(['^' + JSON.stringify(it)]);
    return s;
  }

  function applyEvent(s0: State, ev: TurnEvent): State {
    const n = so.clone(s0);
    let text: string;
    if (ev.t === 'lose') {
      const id = ixOf(ev.id);
      let i = n.mons.findIndex((m) => m.id === id);
      if (i >= 0) n.mons.splice(i, 1);
      else { i = n.st.findIndex((x) => x.id === id); if (i < 0) throw new Error(S(id) + ' is not on your field at that point'); n.st.splice(i, 1); }
      if (ev.to === 'hand') so.W(n, props[id].ext ? 'extra' : 'hand')[id]++; else so.W(n, ev.to === 'ban' ? 'ban' : 'gy')[id]++;
      text = `Recorded: ${S(id)} ${ev.to === 'hand' ? 'went back to your hand' : ev.to === 'ban' ? 'was banished' : 'was sent to the GY'}${ev.by ? ' by ' + ev.by : ''}.`;
    } else if (ev.t === 'gain') {
      const id = ixOf(ev.id);
      if (!n.deck[id]) throw new Error('No ' + S(id) + ' left in the Deck at that point');
      so.W(n, 'deck')[id]--;
      const rep = !!ev.replace && n.hand[deck.UNK] > 0;
      if (rep) so.W(n, 'hand')[deck.UNK]--;
      so.W(n, 'hand')[id]++;
      text = `Recorded: ${S(id)} is in your hand${rep ? ' (it was the unknown card)' : ''}.`;
    } else if (ev.t === 'oppAdd') {
      if (!n.opp) { n.opp = { mons: [], st: [], lp: 8000, lp0: 8000, k: null, k2: 0 }; n.oppOwn = true; }
      const o = so.OW(n);
      o.mons.push(Object.assign({ kind: 'mon' as const, pos: 'atk' as const, attr: '?', race: '?', atk: 0, def: 0, intr: null, uid: 'e' + (o.mons.length + o.st.length), name: '' }, ev.mon, { ui: 40 + o.mons.length + o.st.length }));
      text = `Recorded: they summoned ${ev.mon.name || 'a monster'}.`;
    } else throw new Error('unknown event');
    step(n, text);
    n.cur!.ev = true;
    done(n);
    n.log[n.log.length - 1].pre = s0;
    n.path = s0.path.concat(['@' + JSON.stringify(ev)]);
    return n;
  }

  return { interrupt, startDraw, applyEvent, protectionFor, ready };
}
