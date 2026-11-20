// Lines are possible: the new engine's best line (at PIN) for the 200 `first` and 65 `second`
// situations, plus 40 more seeded going-first hands, exported for the Line Trainer and run through
// the server's ledger checker. No issue of severity 'error' is allowed.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../../utils/trainer';
import type { Engine } from '../engine';
import { loadDeckFiles } from './groupParity';
import { dmDeckContext, ledgerOf, showIssue } from './ledger';
import { loadReference, refFullDeck, type RefCfg } from './loadReference';
import { handOf, solveNew } from './runSituation';
import { buildSituations, PIN, SEED, type Situation } from './situations';

/** 40 more going-first hands of 5 from their own stream (not one of situations.ts's). */
export function extraHands(full: { deck: Record<string, number>; extra: Record<string, number> }, n = 40): Situation[] {
  const rng = mulberry32(SEED + 5000);
  const ids = Object.entries(full.deck).flatMap(([id, k]) => Array<string>(k).fill(id));
  return Array.from({ length: n }, (_, i) => {
    const pool = [...ids], hand: Record<string, number> = {};
    for (let j = 0; j < 5; j++) { const [id] = pool.splice(Math.floor(rng() * pool.length), 1); hand[id] = (hand[id] ?? 0) + 1; }
    const deck = { ...full.deck };
    for (const [id, k] of Object.entries(hand)) deck[id] -= k;
    const cfg: RefCfg = { mode: 'first', hand, deck, extra: { ...full.extra } };
    return { id: `extra-${String(i + 1).padStart(3, '0')}`, group: 'first', cfg };
  });
}

describe('ledger: the new engine\'s lines pass the ledger checker', () => {
  const { engine: ref, cards } = loadReference();
  const sits = [...buildSituations(ref, cards).filter((s) => s.group === 'first' || s.group === 'second'), ...extraHands(refFullDeck(ref, cards))];
  const ctx = dmDeckContext(cards);
  let neu: Engine;
  let warnings = 0, accepted = 0;
  beforeAll(() => { const l = loadDeckFiles(); if (!l.ok) throw new Error(l.errors); neu = l.engine; });
  afterAll(() => { console.info(`ledger: ${sits.length} lines checked, ${warnings} warnings, ${accepted} errors explained by ACCEPTED_LEDGER`); });

  it('checks 305 lines', () => { expect(sits).toHaveLength(305); });

  for (const sit of sits) {
    it(sit.id, () => {
      const line = solveNew(ref, neu, sit, { ...PIN, strict: true }).lines[0];
      const r = ledgerOf(neu, line, handOf(sit), ctx);
      warnings += r.warnings.length;
      accepted += r.accepted.length;
      expect(r.errors.map(showIssue).join('\n')).toBe('');
    });
  }
});
