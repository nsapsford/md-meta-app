// Lockstep differences that are real rule differences, not porting mistakes. Each entry needs a
// card-rule reason ("the reference throws here: …", "legal by the card text: …"); every entry is
// printed in the Task 19 report. Starts empty: Tasks 10–16 decide per card.

import type { MoveView, StepDiff } from './lockstep';

export interface AcceptedDiff { side: 'missing' | 'extra'; test(m: MoveView): boolean; reason: string }

export const ACCEPTED: AcceptedDiff[] = [
  {
    side: 'missing',
    // Key shape: souls1:<sorted members, h<id> or f<id><index>>, repeated keys numbered #1, #2...
    test: (m) => /^souls1:(?=.*\bf)(?=.*[+:]h).*#\d+$/.test(m.key),
    reason: "Magicians' Souls (field) sending a field Spell/Trap with a card from a hand holding two copies of it: the reference offers the same send once per copy (its de-duplication skips only hand-only sets), and both copies give the same position, draw and text. Which copy of a card in hand is sent is not a choice by the card rules, so the new engine offers it once.",
  },
];

/** The differences left once accepted ones are taken out (a step with nothing left is dropped). */
export function withoutAccepted(diffs: StepDiff[], accepted: readonly AcceptedDiff[] = ACCEPTED): StepDiff[] {
  const keep = (side: AcceptedDiff['side']) => (m: MoveView) => !accepted.some((a) => a.side === side && a.test(m));
  return diffs
    .map((d) => ({ ...d, missing: d.missing.filter(keep('missing')), extra: d.extra.filter(keep('extra')) }))
    .filter((d) => d.missing.length || d.extra.length || d.evalDiff || d.obsDiff);
}
