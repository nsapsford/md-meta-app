// Branded Dracotail lines are possible (spec check 3; this deck has no reference engine): the best
// line at PIN for 200 seeded going-first hands of 5 and 100 going-second hands of 6 (against the
// 13 opponent fields in turn), with no move throwing, exported for the Line Trainer and run
// through the server's ledger checker. No issue of severity 'error' is allowed.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../engine';
import type { DeckContext } from '../../../../server/src/services/lineGen/types';
import { checkGenerated, showIssue } from './ledger';
import type { GeneratedLine as LedgerLine } from '../../../../server/src/services/lineGen/types';
import { bdHands, dracotailDeckContext, loadDracotail } from './dracotail';
import { PIN } from './situations';

describe('Branded Dracotail: the best lines pass the ledger checker', () => {
  const hands = [...bdHands(200, 5, 'first', 7000, 'first'), ...bdHands(100, 6, 'second', 8000, 'second')];
  let neu: Engine;
  let ctx: DeckContext;
  let warnings = 0, nodes = 0, steps = 0;
  beforeAll(() => { const l = loadDracotail(); neu = l.engine; ctx = dracotailDeckContext(l.file, l.facts); });
  afterAll(() => { console.info(`dracotail ledger: ${hands.length} lines, ${steps} steps, ${warnings} warnings, ${nodes} positions`); });

  it('checks 300 lines', () => { expect(hands).toHaveLength(300); });

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
      expect(res.errors.map(showIssue).join('\n')).toBe('');
    });
  }
});
