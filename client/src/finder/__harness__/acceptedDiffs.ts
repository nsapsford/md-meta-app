// Lockstep differences that are real rule differences, not porting mistakes. Each entry needs a
// card-rule reason ("the reference throws here: …", "legal by the card text: …"); every entry is
// printed in the Task 19 report. Starts empty: Tasks 10–16 decide per card.

import type { MoveView, StepDiff } from './lockstep';

export interface AcceptedDiff { side: 'missing' | 'extra'; test(m: MoveView): boolean; reason: string }

export const ACCEPTED: AcceptedDiff[] = [];

/** The differences left once accepted ones are taken out (a step with nothing left is dropped). */
export function withoutAccepted(diffs: StepDiff[], accepted: readonly AcceptedDiff[] = ACCEPTED): StepDiff[] {
  const keep = (side: AcceptedDiff['side']) => (m: MoveView) => !accepted.some((a) => a.side === side && a.test(m));
  return diffs
    .map((d) => ({ ...d, missing: d.missing.filter(keep('missing')), extra: d.extra.filter(keep('extra')) }))
    .filter((d) => d.missing.length || d.extra.length || d.evalDiff || d.obsDiff);
}
