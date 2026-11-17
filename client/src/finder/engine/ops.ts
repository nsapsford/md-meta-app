// Card moves on a state the caller owns (a clone): Deck order, draws, putting a monster on the
// field, and cards leaving it. The deck's reactions (triggers on a summon, on leaving the field,
// on an opponent's monster going to the GY) come in through `OpsHooks`, so nothing here knows a
// card. Port of the reference's shuffle / fromDeck / draw / place / monToGY / stToGY /
// oppTargets / oppRemove. moves.ts (Task 6) builds Normal and Tribute Summons on these.

import type { Mon, OppCard, OppCardState, ST, State } from './types';
import type { StateOps } from './state';
import { L, type LedgerZone } from './record';

export interface PlaceOpts { special?: boolean; emz?: boolean; nm?: number; noEff?: boolean; uses?: number; lvl?: number; marks?: number; ownProc?: boolean; from?: LedgerZone }

export interface OpsHooks {
  /** Index of the unknown card (what a draw from an unknown Deck gives). */
  UNK: number;
  /** Level a monster has when it is placed. */
  level(id: number): number;
  /** Name a monster has on the field, unless the summon gives one. */
  fieldName(s: State, id: number, ownProc: boolean): number;
  onPlace(s: State, m: Mon, special: boolean, from?: LedgerZone): void;
  onLeaveField(s: State, id: number, kind: 'mon' | 'st', wasFaceUp: boolean, to?: LedgerZone): void;
  onOppMonsterToGy(s: State): void;
}

export interface Ops {
  /** Known cards on top of the Deck go back in (the Deck is shuffled). */
  shuffle(s: State): void;
  /** Take a card out of the Deck (a search or send), which shuffles it. */
  fromDeck(s: State, id: number): void;
  /** Draw n: known top cards first, then unknown cards. Returns what was drawn. */
  draw(s: State, n: number): number[];
  monFree(s: Pick<State, 'mons'>): number;
  stFree(s: Pick<State, 'st'>): number;
  /** Put a monster on the field (counts a summon) and let the deck queue its triggers. */
  place(s: State, id: number, o?: PlaceOpts): Mon;
  /** A monster leaves the field for the GY (cost, material, Tribute). */
  monToGy(s: State, idx: number, ledger?: boolean): Mon;
  /** A Spell/Trap leaves the field for the GY. */
  stToGy(s: State, idx: number): ST;
  oppTargets(s: State): OppCardState[];
  oppRemove(s: State, uid: OppCard['uid'], how: 'destroy' | 'banish' | 'material'): OppCardState | null;
}

export function createOps(so: StateOps, h: OpsHooks): Ops {
  const { W, OW } = so;

  function shuffle(s: State): void {
    if (!s.top.length) return;
    const d = W(s, 'deck');
    for (const id of s.top) d[id]++;
    s.top = [];
  }

  function fromDeck(s: State, id: number): void {
    const d = W(s, 'deck');
    if (!d[id]) throw new Error('missing card index ' + id + ' in deck');
    d[id]--;
    shuffle(s);
  }

  function draw(s: State, n: number): number[] {
    const got: number[] = [];
    for (let i = 0; i < n; i++) {
      const id = s.top.length ? s.top.shift()! : h.UNK;
      W(s, 'hand')[id]++;
      L.mv(s, id, 'deck', 'hand');
      got.push(id);
    }
    return got;
  }

  function monFree(s: Pick<State, 'mons'>): number {
    let used = 0;
    for (const m of s.mons) if (!m.emz) used++;
    return 5 - used;
  }

  function stFree(s: Pick<State, 'st'>): number { return 5 - s.st.length; }

  function place(s: State, id: number, o: PlaceOpts = {}): Mon {
    const m: Mon = {
      id, emz: !!o.emz, nm: o.nm ?? h.fieldName(s, id, !!o.ownProc), noEff: !!o.noEff,
      uses: o.uses || 0, lvl: o.lvl || h.level(id), marks: o.marks || 0, uid: s.uid++,
    };
    s.mons.push(m);
    s.summons++;
    h.onPlace(s, m, o.special !== false, o.from);
    return m;
  }

  function monToGy(s: State, idx: number, ledger = true): Mon {
    const m = s.mons.splice(idx, 1)[0];
    W(s, 'gy')[m.id]++;
    if (ledger) L.mv(s, m.id, 'field', 'gy');
    h.onLeaveField(s, m.id, 'mon', true, 'gy');
    return m;
  }

  function stToGy(s: State, idx: number): ST {
    const x = s.st.splice(idx, 1)[0];
    W(s, 'gy')[x.id]++;
    L.mv(s, x.id, 'field', 'gy');
    h.onLeaveField(s, x.id, 'st', x.up, 'gy');
    return x;
  }

  function oppTargets(s: State): OppCardState[] {
    if (!s.opp) return [];
    const out: OppCardState[] = [];
    for (const m of s.opp.mons) if (!m.noTarget) out.push(m);
    for (const x of s.opp.st) if (!x.noTarget) out.push(x);
    return out;
  }

  function oppRemove(s: State, uid: OppCard['uid'], how: 'destroy' | 'banish' | 'material'): OppCardState | null {
    const o = OW(s);
    let i = o.mons.findIndex((m) => m.uid === uid);
    if (i >= 0) {
      const m = o.mons.splice(i, 1)[0];
      s.removed++;
      if (how === 'destroy' || how === 'material') h.onOppMonsterToGy(s);
      return m;
    }
    i = o.st.findIndex((x) => x.uid === uid);
    if (i >= 0) { s.removed++; return o.st.splice(i, 1)[0]; }
    return null;
  }

  return { shuffle, fromDeck, draw, monFree, stFree, place, monToGy, stToGy, oppTargets, oppRemove };
}
