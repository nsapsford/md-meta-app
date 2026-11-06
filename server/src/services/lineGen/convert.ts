// Turns a generated (checkable) line into a Line Trainer line.
import { randomUUID } from 'node:crypto';
import type { LineInput } from '../comboLineService.js';
import { normName } from './ledgerChecker.js';
import type { CheckReport, DeckContext, GeneratedLine } from './types.js';

export interface StoredChecks extends CheckReport {
  generator: string;      // model id, or "pasted" for the paste-in flow
  checkedAt: number;
  repairs: number;
}

export function toTrainerLine(
  gen: GeneratedLine, ctx: DeckContext, rank: number, newId: () => string = randomUUID,
): LineInput {
  const byName = new Map(ctx.main.map((c) => [normName(c.name), c.passcode]));
  const starters = gen.starters
    .map((slot) => [...new Set(slot.map((n) => byName.get(normName(n))).filter((p): p is number => p != null))])
    .filter((slot) => slot.length > 0);
  const endBoard = gen.endBoardText?.trim()
    ? `${gen.endBoard.join(' + ')}${gen.endBoard.length ? ' — ' : ''}${gen.endBoardText.trim()}`
    : gen.endBoard.join(' + ');
  const steps = gen.steps.map((s) => ({
    id: newId(),
    text: s.text.slice(0, 500),
    branches: (s.branches ?? []).slice(0, 10).map((b) => ({
      id: newId(),
      interruption: b.interruption.slice(0, 80),
      response: b.response.slice(0, 500),
    })),
  }));
  if (gen.notes?.trim() && steps.length < 60) {
    steps.push({ id: newId(), text: `Note: ${gen.notes.trim()}`.slice(0, 500), branches: [] });
  }
  return {
    name: gen.name.slice(0, 120),
    rank,
    status: 'draft',
    source: 'ai-draft',
    starters,
    steps,
    end_board: endBoard ? endBoard.slice(0, 500) : null,
  };
}
