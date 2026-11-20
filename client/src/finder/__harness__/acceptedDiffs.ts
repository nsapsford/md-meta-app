// Lockstep differences that are real rule differences, not porting mistakes. Each entry needs a
// card-rule reason ("the reference throws here: …", "legal by the card text: …"); every entry is
// printed in the Task 19 report. Starts empty: Tasks 10–16 decide per card.

import type { MoveView, StepDiff } from './lockstep';

/**
 * `pairedWith`: the entry applies only when the same step's other side (extra for a missing
 * entry, missing for an extra one) has a move it pairs with.
 */
export interface AcceptedDiff { side: 'missing' | 'extra'; test(m: MoveView): boolean; pairedWith?(m: MoveView, other: MoveView): boolean; reason: string }

/** The card a Master of Chaos revive move brings back (DMG or DIA), or null. */
function mocRevive(m: MoveView): 'DMG' | 'DIA' | null {
  const x = /^moc1:(DMG|DIA)(#\d+)?$/.exec(m.key);
  return x && !m.negated ? (x[1] as 'DMG' | 'DIA') : null;
}
/** The revived card's own trigger (dmg1 for DMG, dia1 for DIA) is first in the result's pending list. */
const firstPending = (m: MoveView, c: 'DMG' | 'DIA') => (c === 'DMG' ? /"pend":\["dmg1"/ : /"pend":\["dia1"/).test(m.obs);
const baseKey = (k: string) => k.replace(/#\d+$/, '');
/** An extra (new engine) revive with its trigger pending first, matching a missing (reference) one by key and text. */
function mocPair(extra: MoveView, missing: MoveView): boolean {
  const c = mocRevive(extra);
  return c !== null && baseKey(extra.key) === baseKey(missing.key) && extra.text === missing.text
    && firstPending(extra, c) && !/"pend":\["(dmg1|dia1)"/.test(missing.obs);
}

export const ACCEPTED: AcceptedDiff[] = [
  {
    side: 'missing',
    // Key shape: souls1:<sorted members, h<id> or f<id><index>>, repeated keys numbered #1, #2...
    test: (m) => /^souls1:(?=.*\bf)(?=.*[+:]h).*#\d+$/.test(m.key),
    reason: "Magicians' Souls (field) sending a field Spell/Trap with a card from a hand holding two copies of it: the reference offers the same send once per copy (its de-duplication skips only hand-only sets), and both copies give the same position, draw and text. Which copy of a card in hand is sent is not a choice by the card rules, so the new engine offers it once.",
  },
  // Master of Chaos reviving DMG Apprentice or Diabellstar: both cards say "If this card is Normal or
  // Special Summoned", so their search / Set triggers (dmg1, dia1) start after the revive. The
  // reference queues them only after their own summon procedures, so its result lacks the trigger.
  {
    side: 'missing',
    test: (m) => mocRevive(m) !== null && !/"pend":\["(dmg1|dia1)"/.test(m.obs),
    pairedWith: (m, o) => mocPair(o, m),
    reason: "Master of Chaos reviving DMG Apprentice or Diabellstar: by the card text ('If this card is Normal or Special Summoned') its trigger starts; the reference queues it only after the card's own summon procedures. Accepted only with its new-engine counterpart at the same step (the same revive, with that trigger pending first).",
  },
  {
    side: 'extra',
    test: (m) => { const c = mocRevive(m); return c !== null && firstPending(m, c); },
    pairedWith: (m, o) => mocPair(m, o),
    reason: "The other half of the Master of Chaos revive entry above: the new engine's result has DMG Apprentice's search (dmg1) or Diabellstar's Set (dia1) pending first, as the card text says; accepted only with the reference's matching revive at the same step.",
  },
];

/** The differences left once accepted ones are taken out (a step with nothing left is dropped). */
export function withoutAccepted(diffs: StepDiff[], accepted: readonly AcceptedDiff[] = ACCEPTED): StepDiff[] {
  const keep = (side: AcceptedDiff['side'], other: MoveView[]) => (m: MoveView) =>
    !accepted.some((a) => a.side === side && a.test(m) && (!a.pairedWith || other.some((o) => a.pairedWith!(m, o))));
  return diffs
    .map((d) => ({ ...d, missing: d.missing.filter(keep('missing', d.extra)), extra: d.extra.filter(keep('extra', d.missing)) }))
    .filter((d) => d.missing.length || d.extra.length || d.evalDiff || d.obsDiff);
}

// ── Line Trainer export (toGenerated) differences, used by serialize.parity.test.ts ──

type ExportStep = { text: string; activations?: { card: string; from?: string }[]; summons?: unknown[]; moves?: { card: string; from: string; to: string }[] };
export interface AcceptedExportDiff { test(ref: ExportStep, neu: ExportStep): boolean; reason: string }

/** Export step differences accepted (none at present: steps must match exactly). */
export const ACCEPTED_EXPORT: AcceptedExportDiff[] = [];
export const ACCEPTED_EXPORT_TEXT = {
  /** The same text once the trailing "… in hand" parts are sorted. */
  test: (a: string, b: string): boolean => {
    const norm = (t: string) => { const p = t.split('; '); let k = p.length; while (k > 0 && p[k - 1].endsWith(' in hand')) k--; return p.slice(0, k).concat(p.slice(k).sort()).join('; '); };
    return norm(a) === norm(b);
  },
  reason: "End-board text lists hand traps held in hand: the reference in the order they entered the hand (its hand object's key order), the new engine in card-list order. Display order only.",
};

// ── Ledger checker errors that are the checker's, not the line's (ledger.ts) ──

type LedgerStep = { activations?: { card: string }[]; summons?: { card: string }[] };
export interface AcceptedLedgerError { test(issue: { severity: string; step: number | null; message: string }, steps: readonly LedgerStep[]): boolean; reason: string }

/** The 0-based indices of the steps before `before` that summon `name`. */
const summonSteps = (steps: readonly LedgerStep[], name: string, before: number) =>
  steps.slice(0, before).flatMap((s, i) => ((s.summons ?? []).some((x) => x.card === name) ? [i] : []));

export const ACCEPTED_LEDGER: AcceptedLedgerError[] = [
  {
    test: (issue, steps) => {
      const m = /^"(.+)" can't activate its effects this turn \(it was summoned under a restriction that stops it\)\.$/.exec(issue.message);
      if (issue.severity !== 'error' || !m || issue.step == null) return false;
      const at = summonSteps(steps, m[1], issue.step - 1);
      // Two copies summoned: the earlier one by another card's effect (restricted), the latest by its own procedure (no activation in that step).
      return at.length >= 2 && !(steps[at[at.length - 1]].activations?.length) && !!steps[at[0]].activations?.length;
    },
    reason: "The ledger checker records 'can't activate its effects this turn' by card name. When one copy is summoned under the restriction (Dark Magical Curtain: 'neither player can activate their effects this turn') and a second copy is then Special Summoned by its own procedure, the second copy may activate (Diabellstar the Black Witch's Set). Accepted only for an activation whose card was last summoned in a step with no activation, after an earlier restricted summon of the same name.",
  },
];
