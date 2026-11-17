// Move generation: the moves every deck has (Normal Summon, Tribute Summon, declining a pending
// trigger) plus the compiled deck's own, filtered by the opponent's floodgates, with repeated keys
// numbered. `exec` runs a move and records its key on the line's path. Port of the reference's
// gen preamble (push, floodgates, Normal/Tribute Summon), genPending's decline, and exec. The card
// moves themselves (place, monToGy, ...) are the compiled deck's ops (ops.ts), re-exported here.

import type { CompiledDeck } from '../deck/compile';
import type { StateOps } from './state';
import type { Ops, PlaceOpts } from './ops';
import { step, done, L } from './record';
import type { Move, State, Tags } from './types';

export type { PlaceOpts };

/** Move classes the floodgates read (a bitmask). */
export const MOVE_SPELL = 1;
export const MOVE_EXTRA = 2;

/**
 * The engine's own push: like the deck's `Push`, plus the move's class (MOVE_SPELL / MOVE_EXTRA).
 * Engine-generated moves (Task 7's Synchro/Link/Fusion summons) push with their class directly.
 */
export type EnginePush = (key: string, tags: Tags, run: Move['run'], negatable: boolean, cls: number) => void;

export interface Moves {
  gen(s: State): Move[];
  exec(s: State, a: Move, neg: boolean): State;
  place: Ops['place'];
  monToGy: Ops['monToGy'];
  stToGy: Ops['stToGy'];
  oppTargets: Ops['oppTargets'];
  oppRemove: Ops['oppRemove'];
}

interface Flood { extra: boolean; spell: boolean; mon: boolean }

const INHERENT: Tags = Object.freeze({ inherent: true });
const NOTAGS: Tags = Object.freeze({});

/** Their face-up floodgates: no Extra Deck summons / no Spell activations / no monster effects on the field. */
export function floodgates(s: State): Flood {
  const f: Flood = { extra: false, spell: false, mon: false };
  if (!s.opp) return f;
  for (const list of [s.opp.mons, s.opp.st]) for (const c of list) {
    if (c.faceDown) continue;
    if (c.intr === 'floodExtra') f.extra = true;
    if (c.intr === 'floodSpell') f.spell = true;
    if (c.intr === 'floodMon') f.mon = true;
  }
  return f;
}

export function createMoves(deck: CompiledDeck, so: StateOps = deck.state): Moves {
  const ops = deck.ops, props = deck.props;

  // A deck move's class comes from its effect: the key is `<effect key>` or `<effect key>:<choice>…`.
  const classOf = new Map<string, number>();
  for (const e of deck.effects) {
    if (!e.key) continue;
    classOf.set(e.key, (e.activates === 'spell' ? MOVE_SPELL : 0) | (e.fromExtra ? MOVE_EXTRA : 0));
  }
  function deckClass(k: string): number {
    for (let i = k.indexOf(':'); ; i = k.indexOf(':', i + 1)) {
      const c = classOf.get(i < 0 ? k : k.slice(0, i));
      if (c !== undefined) return c;
      if (i < 0) return 0;
    }
  }

  function gen(s: State): Move[] {
    const A: Move[] = [];
    const seen = new Map<string, number>();
    const flood = floodgates(s);
    const anyFlood = flood.extra || flood.spell;
    const push: EnginePush = (k0, tags, run, neg, cls) => {
      if (flood.extra && (cls & MOVE_EXTRA)) return;
      if (flood.spell && (cls & MOVE_SPELL)) return;
      if (flood.mon && tags && tags.fieldMon) return;
      const c = seen.get(k0) || 0; seen.set(k0, c + 1);
      A.push({ k: c ? k0 + '#' + c : k0, tags, neg, run });
    };
    const deckPush = (k: string, tags: Tags, run: Move['run'], neg = true) => push(k, tags, run, neg, anyFlood ? deckClass(k) : 0);

    if (s.pend.length) {
      const p = s.pend[0];
      push('dec:' + deck.effects[p.e].key, NOTAGS, decline, false, 0);
      deck.genPending(s, deckPush);
      return A;
    }

    // Normal Summon (Level 4 or lower) / Tribute Summon a Level 5-6 with one Tribute.
    if (!s.ns && ops.monFree(s) > 0) {
      for (let id = 0; id < s.hand.length; id++) {
        if (!s.hand[id]) continue;
        const p = props[id];
        if (p.kind !== 'M' || p.sub === 'Ritual') continue;
        const lv = p.lv ?? 0;
        if (lv <= 4) {
          if (!p.normalSummon) continue;
          push('ns:' + p.id, INHERENT, (s0) => normalSummon(s0, id), false, 0);
        } else if (lv <= 6 && s.mons.length) {
          s.mons.forEach((t, i) => {
            if (s.mons.findIndex((x) => x.id === t.id) !== i) return;
            push('tri:' + p.id + ':' + props[t.id].id, INHERENT, (s0) => tributeSummon(s0, id, i), false, 0);
          });
        }
      }
    }

    deck.genMain(s, deckPush);
    return A;
  }

  function decline(s0: State): State {
    const n = so.clone(s0);
    n.pend = n.pend.slice(1);
    return n;
  }

  function normalSummon(s0: State, id: number): State {
    const n = so.clone(s0);
    step(n, `Normal Summon ${props[id].short}.`, INHERENT);
    so.W(n, 'hand')[id]--; n.ns = true;
    L.sum(n, id, 'normal');
    ops.place(n, id, { special: false, from: 'hand' });
    return done(n);
  }

  function tributeSummon(s0: State, id: number, i: number): State {
    const n = so.clone(s0);
    step(n, `Tribute ${props[n.mons[i].id].short} to Tribute Summon ${props[id].short}.`, INHERENT);
    so.W(n, 'hand')[id]--; n.ns = true;
    const m = ops.monToGy(n, i, false);
    L.sum(n, id, 'tribute', 'hand', [m.id]);
    ops.place(n, id, { special: false, from: 'hand' });
    return done(n);
  }

  /** Run a move and record its key on the line's path (`~key` when negated). */
  function exec(s: State, a: Move, neg: boolean): State {
    const n = a.run(s, neg);
    if (n) { const pt = s.path.slice(); pt.push(neg ? '~' + a.k : a.k); n.path = pt; }
    return n;
  }

  return { gen, exec, place: ops.place, monToGy: ops.monToGy, stToGy: ops.stToGy, oppTargets: ops.oppTargets, oppRemove: ops.oppRemove };
}
