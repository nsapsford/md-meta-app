// Line Trainer logic: drawing hands, deciding which stored lines a hand can
// play, judging the user's pick, opening-hand coverage, and building the
// spaced-repetition queue. Pure and deterministic given an RNG, so it is
// unit-tested in src/test/trainer.test.ts.
import type { ComboLine, DrillReview, LineBranch } from '../api/lines';

export type Rng = () => number;

/** Small seeded PRNG (mulberry32): repeatable draws for tests and coverage. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function expandDeck(rows: Array<{ passcode: number; count: number }>): number[] {
  return rows.flatMap((r) => Array<number>(r.count).fill(Number(r.passcode)));
}

/** Draw `size` distinct cards (partial Fisher–Yates; the deck is not mutated). */
export function drawHand(deck: number[], size: number, rng: Rng): number[] {
  const pool = [...deck];
  const n = Math.min(size, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * Assign a distinct hand card to every starter slot (bipartite matching).
 * Returns the hand index used for each slot, or null if the hand can't fill
 * them all — e.g. one copy of a card that two slots both need.
 */
export function assignSlots(slots: number[][], hand: number[]): number[] | null {
  const owner: Array<number | null> = hand.map(() => null); // hand index -> slot
  const tryAssign = (slot: number, seen: boolean[]): boolean => {
    for (let h = 0; h < hand.length; h++) {
      if (seen[h] || !slots[slot].includes(hand[h])) continue;
      seen[h] = true;
      const prev = owner[h];
      if (prev === null || tryAssign(prev, seen)) {
        owner[h] = slot;
        return true;
      }
    }
    return false;
  };
  for (let s = 0; s < slots.length; s++) {
    if (!tryAssign(s, hand.map(() => false))) return null;
  }
  const bySlot = slots.map(() => -1);
  owner.forEach((slot, h) => { if (slot !== null) bySlot[slot] = h; });
  return bySlot;
}

/** A line with no starters can't be drawn into, so it is never playable. */
export function isPlayable(line: Pick<ComboLine, 'starters'>, hand: number[]): boolean {
  return line.starters.length > 0 && assignSlots(line.starters, hand) !== null;
}

const byRank = (a: ComboLine, b: ComboLine) => a.rank - b.rank || a.id - b.id;

export function playableLines(lines: ComboLine[], hand: number[]): ComboLine[] {
  return lines.filter((l) => isPlayable(l, hand)).sort(byRank);
}

/** The best-ranked line this hand can play, or null for "no known line". */
export function bestLine(lines: ComboLine[], hand: number[]): ComboLine | null {
  return playableLines(lines, hand)[0] ?? null;
}

export type PickVerdict =
  | 'best'            // picked the best playable line
  | 'playable-worse'  // picked a playable line, but a better-ranked one was available
  | 'not-playable'    // picked a line this hand can't start
  | 'correct-none'    // said "no line" and there wasn't one
  | 'missed-line';    // said "no line" but one was playable

export function judgePick(lines: ComboLine[], hand: number[], pickedId: number | null): { verdict: PickVerdict; best: ComboLine | null } {
  const best = bestLine(lines, hand);
  if (pickedId === null) return { verdict: best ? 'missed-line' : 'correct-none', best };
  if (best && best.id === pickedId) return { verdict: 'best', best };
  const picked = lines.find((l) => l.id === pickedId);
  if (picked && isPlayable(picked, hand)) return { verdict: 'playable-worse', best };
  return { verdict: 'not-playable', best };
}

/** Starter slots with no matching card in the hand at all (for "why not?" feedback). */
export function missingSlots(line: Pick<ComboLine, 'starters'>, hand: number[]): number[][] {
  return line.starters.filter((slot) => !slot.some((p) => hand.includes(p)));
}

/** Passcodes a line's starters reference that are no longer in the deck. */
export function startersNotInDeck(line: Pick<ComboLine, 'starters'>, deck: number[]): number[] {
  const inDeck = new Set(deck);
  return [...new Set(line.starters.flat())].filter((p) => !inDeck.has(p));
}

export interface CoverageResult {
  trials: number;
  /** Share of hands where at least one stored line is playable. */
  any: number;
  perLine: Array<{ id: number; playable: number; best: number }>;
}

/** Monte-Carlo opening-hand coverage for the given lines. */
export function coverage(lines: ComboLine[], deck: number[], handSize: number, trials: number, seed = 1): CoverageResult {
  const rng = mulberry32(seed);
  const sorted = [...lines].sort(byRank);
  const playable = new Map<number, number>(sorted.map((l) => [l.id, 0]));
  const best = new Map<number, number>(sorted.map((l) => [l.id, 0]));
  let any = 0;
  for (let t = 0; t < trials; t++) {
    const hand = drawHand(deck, handSize, rng);
    let first: ComboLine | null = null;
    for (const l of sorted) {
      if (isPlayable(l, hand)) {
        playable.set(l.id, playable.get(l.id)! + 1);
        if (!first) first = l;
      }
    }
    if (first) {
      any++;
      best.set(first.id, best.get(first.id)! + 1);
    }
  }
  return {
    trials,
    any: trials ? any / trials : 0,
    perLine: sorted.map((l) => ({
      id: l.id,
      playable: trials ? playable.get(l.id)! / trials : 0,
      best: trials ? best.get(l.id)! / trials : 0,
    })),
  };
}

export interface DrillItem {
  key: string;
  kind: 'line' | 'branch';
  line: ComboLine;
  /** For branch items: the step the interruption hits, and the branch itself. */
  stepIndex?: number;
  branch?: LineBranch;
  /** Epoch seconds; 0 for never-reviewed items (due immediately). */
  dueAt: number;
  isNew: boolean;
}

export const lineKey = (lineId: number) => `line:${lineId}`;
export const branchKey = (lineId: number, branchId: string) => `branch:${lineId}:${branchId}`;

/** Every drillable item for these lines: one per line with steps, one per branch. */
export function drillItems(lines: ComboLine[], reviews: DrillReview[]): DrillItem[] {
  const due = new Map(reviews.map((r) => [r.item_key, r.due_at]));
  const items: DrillItem[] = [];
  for (const line of [...lines].sort(byRank)) {
    if (line.steps.length === 0) continue;
    const k = lineKey(line.id);
    items.push({ key: k, kind: 'line', line, dueAt: due.get(k) ?? 0, isNew: !due.has(k) });
    line.steps.forEach((step, stepIndex) => {
      for (const branch of step.branches) {
        const bk = branchKey(line.id, branch.id);
        items.push({ key: bk, kind: 'branch', line, stepIndex, branch, dueAt: due.get(bk) ?? 0, isNew: !due.has(bk) });
      }
    });
  }
  return items;
}

/** Items due now, most overdue first (new items, dueAt 0, come first in line order). */
export function dueItems(items: DrillItem[], now: number): DrillItem[] {
  return items.filter((i) => i.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

/** Stable id for a new step or branch (drill history is keyed on it). */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
