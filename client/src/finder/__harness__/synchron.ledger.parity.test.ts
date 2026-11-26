// Synchron lines are possible (this deck has no reference engine): the best line at PIN for 200
// seeded going-first hands of 5 and 100 going-second hands of 6 (against the 13 opponent fields in
// turn), with no move throwing, exported for the Line Trainer and run through the server's ledger
// checker. No issue of severity 'error' is allowed, except the checker's own limits that
// ACCEPTED_LEDGER explains (Levels changed on the field, Tokens, Synchro Fellowship's additional
// Normal Summon).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../engine';
import type { DeckContext } from '../../../../server/src/services/lineGen/types';
import { checkGenerated, showIssue } from './ledger';
import type { GeneratedLine as LedgerLine } from '../../../../server/src/services/lineGen/types';
import { loadSynchron, synchronDeckContext, syHands } from './synchron';
import { PIN } from './situations';

const N_FIRST = Number(process.env.SY_FIRST ?? 200), N_SECOND = Number(process.env.SY_SECOND ?? 100);

describe('Synchron: the best lines pass the ledger checker', () => {
  const hands = [...syHands(N_FIRST, 5, 'first', 7100, 'first'), ...syHands(N_SECOND, 6, 'second', 8100, 'second')];
  let neu: Engine;
  let ctx: DeckContext;
  let warnings = 0, accepted = 0, nodes = 0, steps = 0;
  beforeAll(() => { const l = loadSynchron(); neu = l.engine; ctx = synchronDeckContext(l.file, l.facts); });
  afterAll(() => { console.info(`synchron ledger: ${hands.length} lines, ${steps} steps, ${warnings} warnings, ${accepted} accepted checker errors, ${nodes} positions`); });

  it('checks 300 lines', () => { expect(hands).toHaveLength(N_FIRST + N_SECOND); });

  for (const h of hands) {
    it(h.id, () => {
      const r = neu.solveBeam(neu.newState(h.cfg), { ...PIN, strict: true });
      expect(r.errors).toBe(0);
      nodes += r.nodes;
      const line = r.lines[0];
      steps += line.state?.log.length ?? 0;
      const g = neu.toGenerated(line, 'Line', h.hand) as LedgerLine;
      const res = checkGenerated(g, ctx);
      warnings += res.warnings.length;
      accepted += res.accepted.length;
      expect(res.errors.map(showIssue).join('\n')).toBe('');
    });
  }
});
