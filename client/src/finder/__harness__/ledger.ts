// The server's ledger checker run on the new engine's lines (harness only: the solver itself never
// imports server code). The DeckContext is the DM Azamina list (the reference's card list, for the
// copies and zones) with each card's facts from the deck files' card-facts files.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkLineLedger } from '../../../../server/src/services/lineGen/ledgerChecker';
import type { CheckIssue, DeckCard, DeckContext, GeneratedLine as LedgerLine } from '../../../../server/src/services/lineGen/types';
import type { Engine, LineEval } from '../engine';
import type { CardFacts } from '../deck/schema';
import type { RefCard } from './loadReference';
import { ACCEPTED_LEDGER } from './acceptedDiffs';

const readFacts = (name: string): CardFacts[] => JSON.parse(readFileSync(fileURLToPath(new URL('../deck/files/' + name, import.meta.url)), 'utf8'));

export function dmDeckContext(cards: RefCard[]): DeckContext {
  const facts = new Map([...readFacts('dm-azamina.cards.json'), ...readFacts('staples.cards.json')].map((f) => [f.name, f]));
  const row = (c: RefCard): DeckCard => {
    const f = facts.get(c.name);
    if (!f) throw new Error(`dmDeckContext: no card facts for "${c.name}"`);
    return {
      passcode: f.passcode, name: f.name, type: f.type, text: f.text, level: f.level, linkRating: f.link,
      attribute: f.attr, race: f.race, copies: c.count, zone: c.zone,
    };
  };
  return {
    deckName: 'DM Azamina', archetype: 'Dark Magician',
    main: cards.filter((c) => c.zone === 'main').map(row),
    extra: cards.filter((c) => c.zone === 'extra').map(row),
    metaInterruptions: [],
  };
}

/** `accepted`: errors that ACCEPTED_LEDGER entries explain (the checker's, not the line's). */
export interface LedgerResult { errors: CheckIssue[]; accepted: CheckIssue[]; warnings: CheckIssue[] }

/** A Line Trainer export through the ledger checker. */
export function checkGenerated(g: LedgerLine, ctx: DeckContext): LedgerResult {
  const issues = checkLineLedger(g, ctx);
  const isErr = (i: CheckIssue) => i.severity === 'error';
  const ok = (i: CheckIssue) => ACCEPTED_LEDGER.some((a) => a.test(i, g.steps));
  return { errors: issues.filter((i) => isErr(i) && !ok(i)), accepted: issues.filter((i) => isErr(i) && ok(i)), warnings: issues.filter((i) => !isErr(i)) };
}

/** The line as the Line Trainer export, through the ledger checker. */
export function ledgerOf(neu: Engine, line: LineEval, hand: string[], ctx: DeckContext): LedgerResult {
  return checkGenerated(neu.toGenerated(line, 'Line', hand) as LedgerLine, ctx);
}

export const showIssue = (i: CheckIssue): string => `${i.severity}${i.step != null ? ` (step ${i.step})` : ''}: ${i.message}`;
