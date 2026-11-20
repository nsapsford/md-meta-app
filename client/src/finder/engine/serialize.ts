// Plain data for the page (results cross a Worker boundary) and the Line Trainer export
// (GeneratedLine). Port of the reference's serializeLine / serialize / toGenerated / ledgerParts /
// cleanLed. Cards go out by id, except in the GeneratedLine, which names them in full.

import type { CompiledDeck } from '../deck/compile';
import type { Opponent } from './opponent';
import { ledObjs, type LedgerObj, type LedgerZone } from './record';
import type { LineEval } from './score';
import type { SolveResult } from './search';
import type { CardId, OppCard, StepRec, Tags } from './types';

// The server's Line Trainer types (server/src/services/lineGen/types.ts), re-declared.
export interface LedgerActivation { card: string; effect?: number; from?: LedgerZone }
export interface LedgerSummon { card: string; method: string; from?: LedgerZone; materials?: string[]; [k: string]: unknown }
export interface LedgerMove { card: string; from: LedgerZone; to: LedgerZone }
export interface PlanStep { text: string; activations?: LedgerActivation[]; summons?: LedgerSummon[]; moves?: LedgerMove[] }
export interface GeneratedLine { name: string; starters: string[][]; freeCards?: number; steps: PlanStep[]; endBoard: string[]; endBoardText?: string; notes?: string }

export interface SerializedStep {
  pathIdx: number; key: string | null; ev: boolean; mons: CardId[]; sts: CardId[]; oppPresent: OppCard['uid'][];
  summoned: boolean; extraSummon: boolean; draws: number; oppCount: number; text: string; tags: Tags;
  interrupted: string | null; summonsAfter: number; canNeg: boolean; wipeHere: boolean; firstDeckAdd: boolean;
  /** The `stepNote` of each protection ready before this step. */
  notes: string[];
  /** The effect's `lineNote`, if any. */
  lineNote: string | null;
}
export interface SerializedLine {
  tag: string; score: number; summary: LineEval['summary']; items: [string, number][]; sets: CardId[]; chokes: LineEval['chokes']; safest: boolean;
  path: string[]; steps: SerializedStep[]; summons: number; opening: string[]; drawFx: number;
  board: { mons: { id: CardId; uses: number; marks: string[] }[]; st: { id: CardId; up: boolean; endSet: boolean }[]; hand: Record<CardId, number>; lp: number; opp: string[] };
  generated: GeneratedLine; bait?: boolean;
}
export interface SerializedResult { lines: SerializedLine[]; safest: SerializedLine | null; frontier: SerializedLine[] | null; nodes: number; ms: number; width: number }

export interface Serializer {
  serializeLine(l: LineEval, hand: CardId[], tag: string): SerializedLine;
  serialize(r: Pick<SolveResult, 'lines' | 'safest' | 'frontier' | 'nodes' | 'ms' | 'width'>, hand: CardId[], k?: number): SerializedResult;
  toGenerated(l: LineEval, name: string, hand: CardId[]): GeneratedLine;
}

/**
 * `wipeAt`: the summon count at which a step is marked `wipeHere` (the first step to reach it),
 * the `param` of the hand-trap data's `wipeAtSummons` entry.
 */
export function createSerializer(deck: CompiledDeck, opp: Pick<Opponent, 'ready'>, o: { wipeAt?: number } = {}): Serializer {
  const wipeAt = o.wipeAt ?? 5;   // createEngine passes the hand-trap data's count (5 is its documented fallback)
  const { ids, props, UNK } = deck;
  const names = props.map((p, i) => (i === UNK ? '?' : p.name));
  const markNames = Object.keys(deck.markBit);
  const marksOf = (m: number) => markNames.filter((n) => (m >>> deck.markBit[n]) & 1);
  const toObj = (z: Uint8Array): Record<CardId, number> => { const out: Record<CardId, number> = {}; for (let i = 0; i < z.length; i++) if (z[i]) out[ids[i]] = z[i]; return out; };

  function cleanLed(led: { activations: LedgerActivation[]; summons: LedgerSummon[]; moves: LedgerMove[] }): Omit<PlanStep, 'text'> {
    const out: Omit<PlanStep, 'text'> = {};
    if (led.activations.length) out.activations = led.activations;
    if (led.summons.length) out.summons = led.summons;
    if (led.moves.length) out.moves = led.moves;
    return out;
  }
  // The app's ledger applies a step's activations, then summons, then moves. Split a step
  // where a summon needs a card that a move in the same step put in place.
  function ledgerParts(st: StepRec): PlanStep[] {
    type Part = { acts: LedgerActivation[]; sums: LedgerSummon[]; mvs: LedgerMove[] };
    const parts: Part[] = [];
    let cur: Part = { acts: [], sums: [], mvs: [] };
    for (const [k, v] of ledObjs(st, names, UNK) as LedgerObj[]) {
      if (k === 'a' && (cur.sums.length || cur.mvs.length)) { parts.push(cur); cur = { acts: [], sums: [], mvs: [] }; }
      if (k === 's') {
        const sv = v as LedgerSummon;
        const needs: [string, string][] = [[sv.card, sv.from || 'hand'], ...((sv.materials || []).map((m) => [m, (sv.materialsFrom as string) || 'field'] as [string, string]))];
        if (cur.mvs.some((m) => needs.some(([c, z]) => m.card === c && m.to === z))) { parts.push(cur); cur = { acts: [], sums: [], mvs: [] }; }
      }
      if (k === 'a') cur.acts.push(v as LedgerActivation); else if (k === 's') cur.sums.push(v as LedgerSummon); else cur.mvs.push(v as LedgerMove);
    }
    parts.push(cur);
    return parts.map((p, i) => ({
      text: i === 0 ? st.text : `(continued) ${p.sums.map((x) => `Special Summon ${x.card}`).join(', ') || 'resolve the rest'}.`,
      ...cleanLed({ activations: p.acts, summons: p.sums, moves: p.mvs }),
    }));
  }

  function toGenerated(line: LineEval, name: string, hand: CardId[]): GeneratedLine {
    const n = line.final;
    const steps: PlanStep[] = [];
    for (const st of line.state!.log) steps.push(...ledgerParts(st));
    for (const id of line.sets) steps.push({ text: `Set ${props[id].short}.`, moves: [{ card: names[id], from: 'hand', to: 'field' }] });
    const starters: string[][] = [];
    let free = 0;
    for (const id of hand) { if (id === 'UNK') free++; else starters.push([names[deck.ix[id]]]); }
    return {
      name, starters, freeCards: free, steps,
      endBoard: n.mons.map((m) => names[m.id]).concat(n.st.map((x) => names[x.id])),
      endBoardText: (line.items || []).filter((x) => x[1] >= 0.3).map((x) => x[0]).join('; '),
    };
  }

  function serializeLine(l: LineEval, hand: CardId[], tag: string): SerializedLine {
    const s = l.state!;
    const log = s.log;
    let wipeIdx = -1;
    log.forEach((st, i) => { const prev = i ? log[i - 1].summonsAfter : 0; if (wipeIdx < 0 && st.summonsAfter >= wipeAt && prev < wipeAt) wipeIdx = i; });
    const firstAdd = log.findIndex((st) => st.tags.deckAdd);
    const after = (i: number) => (log[i + 1] && log[i + 1].pre ? log[i + 1].pre! : s);
    const steps = log.map((st, i): SerializedStep => {
      const pre = st.pre;
      const notes: string[] = [];
      if (pre) for (const p of opp.ready(pre, st.tags)) if (p.stepNote) notes.push(p.stepNote);
      const rawKey = pre ? s.path[pre.path.length] : null;
      const a = after(i);
      return {
        pathIdx: pre ? pre.path.length : -1,
        key: rawKey ? (rawKey[0] === '~' ? rawKey.slice(1) : rawKey[0] === '!' ? JSON.parse(rawKey.slice(1)).k : rawKey[0] === '@' || rawKey[0] === '^' ? null : rawKey) : null,
        ev: !!st.ev, mons: a.mons.map((m) => ids[m.id]), sts: a.st.map((x) => ids[x.id]),
        oppPresent: pre && pre.opp ? pre.opp.mons.filter((m) => !m.faceDown).map((m) => m.uid).concat(pre.opp.st.map((x) => x.uid)) : [],
        summoned: st.ns > 0, extraSummon: st.xs > 0, draws: st.draws || 0,
        oppCount: pre && pre.opp ? pre.opp.mons.length + pre.opp.st.length : 0,
        text: st.text, tags: st.tags, interrupted: st.interrupted || null, summonsAfter: st.summonsAfter,
        canNeg: !!(st.act && st.act.neg), wipeHere: i === wipeIdx, firstDeckAdd: i === firstAdd, notes,
        lineNote: st.note ?? null,
      };
    });
    const n = l.final;
    return {
      tag, score: l.score, summary: l.summary, items: l.items || [], sets: l.sets.map((i) => ids[i]), chokes: l.chokes, safest: !!l.safest, path: s.path,
      steps, summons: s.summons, opening: s.opening || [], drawFx: s.drawFx,
      board: {
        mons: n.mons.map((m) => ({ id: ids[m.id], uses: m.uses, marks: marksOf(m.marks) })),
        st: n.st.map((x) => ({ id: ids[x.id], up: !!x.up, endSet: !!x.endSet })), hand: toObj(n.hand), lp: n.lp,
        opp: n.opp ? n.opp.mons.map((m) => m.name || 'monster').concat(n.opp.st.map((x) => x.name || 'Spell/Trap')) : [],
      },
      generated: toGenerated(l, tag, hand),
    };
  }

  function serialize(r: Pick<SolveResult, 'lines' | 'safest' | 'frontier' | 'nodes' | 'ms' | 'width'>, hand: CardId[], k?: number): SerializedResult {
    const lines = r.lines.slice(0, k || r.lines.length).map((l, i) => serializeLine(l, hand, 'Line ' + (i + 1)));
    let safest: SerializedLine | null = null;
    if (r.safest && !r.lines.includes(r.safest)) safest = serializeLine(r.safest, hand, 'Safest lethal');
    const frontier = r.frontier ? r.frontier.map((l) => serializeLine(l, hand, 'Trade')) : null;
    return { lines, safest, frontier, nodes: r.nodes, ms: r.ms, width: r.width };
  }

  return { serializeLine, serialize, toGenerated };
}
