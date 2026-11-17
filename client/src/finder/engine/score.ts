// Scoring: the value of a finished turn (evaluate, battle), a board's signature for de-duplicating
// lines (boardSig), and the heuristic that ranks partial lines (potential). Port of the
// reference's interruptions / battle / evaluate / boardSig / potential, number for number. What
// the board is worth comes from the deck file (deck.boardValue); a monster with no board-value
// entry is worth min(0.2, ATK / 15000) under its short name, and each held card (CardProps.heldValue)
// left in hand adds its value.

import type { CompiledDeck } from '../deck/compile';
import { DRAW_BIT } from './record';
import type { FinalBoard, State } from './types';

export interface LineEval {
  score: number;
  summary: Record<string, number | boolean>;
  items: [string, number][] | null;
  sets: number[];
  final: FinalBoard;
  chokes: { deckTouch: number; deckAdd: number; fieldMon: number } | null;
  state?: State;
  sig?: string;
  safest?: boolean;
}

export interface Score {
  evaluate(s: State, full: boolean): LineEval;
  battle(n: FinalBoard): number;
  boardSig(e: LineEval): string;
  potential(s: State): number;
}

/** Opponent draw effects the hand-size cap on opponent draw effects applies to (the reference's `mul & 3`). */
const CAPPED_DRAWS = DRAW_BIT.drawDeckExtraSummon | DRAW_BIT.drawHandSummon;

export function createScore(deck: CompiledDeck): Score {
  const props = deck.props, nCards = deck.ids.length, UNK = deck.UNK;
  // Per card: the default value of a monster with no board-value entry, or -1 when it has one.
  const monDefault = new Float64Array(nCards);
  const held = new Float64Array(nCards);
  const atk = new Float64Array(nCards);
  // potential: 0 skipped (UNK, held cards), 1 counts, 2 counts and is a Level 4 or lower monster.
  const potKind = new Uint8Array(nCards);
  for (let i = 0; i < nCards; i++) {
    const p = props[i];
    atk[i] = p.atk || 0;
    monDefault[i] = deck.hasBoardValue[i] ? -1 : Math.min(0.2, atk[i] / 15000);
    held[i] = p.heldValue || 0;
    if (i === UNK || held[i]) potKind[i] = 0;
    else potKind[i] = p.kind === 'M' && p.lv != null && p.lv <= 4 ? 2 : 1;
  }

  /** The board's value on their turn: deck entries, default monster values, held cards in hand. */
  function value(n: FinalBoard, full: boolean): { sum: number; items: [string, number][] | null } {
    const bv = deck.boardValue(n, full);
    let sum = bv.sum;
    const items = bv.items;
    for (let i = 0; i < n.mons.length; i++) {
      const id = n.mons[i].id, v = monDefault[id];
      if (v < 0) continue;
      sum += v;
      if (items) items.push([props[id].short, v]);
    }
    const hd = n.hand;
    for (let id = 0; id < nCards; id++) {
      const v = held[id];
      if (!v) continue;
      const k = hd[id];
      for (let i = 0; i < k; i++) { sum += v; if (items) items.push([`${props[id].short} in hand`, v]); }
    }
    return { sum, items };
  }

  function battle(n: FinalBoard): number {
    const ours: number[] = [];
    for (const m of n.mons) { const a = atk[m.id]; if (a > 0) ours.push(a); }
    ours.sort((a, b) => b - a);
    const theirs = n.opp ? n.opp.mons : [];
    const T = theirs.length;
    if (!T) return n.noDirect ? 0 : ours.reduce((t, a) => t + a, 0);
    const full = (1 << T) - 1;
    const memo = new Map<number, number>();
    const f = (i: number, mask: number): number => {
      if (i === ours.length) return 0;
      const key = i * 64 + mask;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      const a = ours[i];
      let best = f(i + 1, mask);
      if (mask === 0) { if (!n.noDirect) best = Math.max(best, a + f(i + 1, 0)); } else {
        for (let j = 0; j < T; j++) {
          if (!(mask & (1 << j))) continue;
          const t = theirs[j];
          const isAtk = (t.pos || 'atk') === 'atk';
          const val = isAtk ? (t.atk || 0) : (t.def || 0);
          if (a > val) best = Math.max(best, (isAtk ? a - val : 0) + f(i + 1, mask & ~(1 << j)));
        }
      }
      memo.set(key, best);
      return best;
    };
    return f(0, full);
  }

  function evaluate(s: State, full: boolean): LineEval {
    const { n, sets } = deck.finalize(s);
    const { sum: val, items } = value(n, full);
    const nlog = s.log.length;
    const draws = s.oppDraws;
    let eff = draws;
    // Hand-size cap: in the End Phase they shuffle back down to (cards you control + 6); going first they hold 4 after discarding the draw card.
    if (draws && (s.drawFx & CAPPED_DRAWS) && !(s.mode === 'second' && s.opp)) eff = Math.min(draws, n.mons.length + n.st.length + 2);
    const pen = eff * s.drawPenalty;
    let score: number, summary: Record<string, number | boolean>;
    if (s.mode === 'second' && s.opp) {
      const opp = n.opp!;
      const dmg = battle(n);
      const lethal = dmg >= opp.lp;
      let live = 0;
      for (let i = 0; i < opp.mons.length; i++) { const m = opp.mons[i]; if (m.intr && !m.faceDown) live++; }
      for (let i = 0; i < opp.st.length; i++) if (opp.st[i].intr) live++;
      score = lethal
        ? 1000 + Math.min(6, (dmg - opp.lp) / 500) + val * 0.5 - nlog * 0.5 - Math.max(0, s.summons - 4) * 0.5 - s.cDeckTouch * 0.6 - s.cDeckAdd * 0.3 - live * 2
        : 300 * (1 - Math.max(0, opp.lp - dmg) / opp.lp0) + 25 * s.removed + 12 * val - live * 15;
      const raw = score;
      if (!lethal) score -= pen;   // a dead opponent draws nothing useful
      summary = { lethal, battle: dmg, burn: s.burn, oppLp: opp.lp, removed: s.removed, defense: val, draws, eff, raw };
    } else {
      const raw = val * 100 - nlog * 1.5 - Math.max(0, nlog - 12) * 2.5 - s.cDeckTouch * 2 - Math.max(0, s.summons - 5) * 3;
      score = raw - pen;
      summary = { value: val, draws, eff, raw };
    }
    return { score, summary, items, sets, final: n, chokes: full ? { deckTouch: s.cDeckTouch, deckAdd: s.cDeckAdd, fieldMon: s.cFieldMon } : null };
  }

  function boardSig(e: LineEval): string {
    const n = e.final;
    return n.mons.map((m) => m.id).sort().join('+') + '|' + n.st.map((x) => x.id + (x.up ? '+' : '')).sort().join(',') + '|' + (e.summary.lethal ? 'L' : '')
      + (n.opp ? '|' + n.opp.mons.map((m) => m.uid).concat(n.opp.st.map((x) => x.uid)).join('.') : '') + (e.summary.draws ? '|d' + e.summary.draws : '');
  }

  // Heuristic for ranking partial lines: value now plus resources still unused.
  function potential(s: State): number {
    let h = 0, lowMon = false;
    const hd = s.hand;
    for (let i = 0; i < nCards; i++) {
      const c = hd[i];
      if (!c) continue;
      const k = potKind[i];
      if (!k) continue;
      h += 14 * c;
      if (k === 2) lowMon = true;
    }
    let setN = 0;
    for (let i = 0; i < s.st.length; i++) if (!s.st[i].up) setN++;
    h += 9 * s.mons.length + 6 * setN;
    if (!s.ns && lowMon) h += 20;
    h += 10 * s.pend.length;
    return h;
  }

  return { evaluate, battle, boardSig, potential };
}
