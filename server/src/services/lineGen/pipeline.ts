// Generate → check → repair → critique → repair → final check.
//
// Verifiers are pluggable: today the rule-based ledger checker (and, when a
// model is available, a model critique pass). A rules-engine verifier
// (ocgcore replaying the plan) slots in as another LineVerifier later
// without changing callers.
import { checkLineLedger } from './ledgerChecker.js';
import {
  buildCritiquePrompt, buildLinePrompt, buildOpenersPrompt, buildRepairPrompt, extractJson, parseGeneratedLine,
} from './prompts.js';
import type { LineModel } from './providers.js';
import type { CheckIssue, CheckReport, DeckContext, GeneratedLine } from './types.js';

export interface LineVerifier {
  readonly name: string;
  verify(line: GeneratedLine, ctx: DeckContext): Promise<CheckIssue[]>;
}

export const ledgerVerifier: LineVerifier = {
  name: 'ledger',
  verify: async (line, ctx) => checkLineLedger(line, ctx),
};

export function critiqueVerifier(model: LineModel): LineVerifier {
  return {
    name: 'critique',
    async verify(line, ctx) {
      const raw = await model.complete(buildCritiquePrompt(ctx, line));
      const parsed = extractJson(raw) as { issues?: Array<{ step?: number; severity?: string; message?: string }> };
      return (parsed.issues ?? [])
        .filter((i) => typeof i.message === 'string' && i.message.trim())
        .map((i) => ({
          severity: i.severity === 'error' ? 'error' as const : 'warning' as const,
          step: Number.isInteger(i.step) ? i.step! : null,
          source: 'critique',
          message: i.message!.trim(),
        }));
    },
  };
}

export async function runVerifiers(line: GeneratedLine, ctx: DeckContext, verifiers: LineVerifier[]): Promise<CheckReport> {
  const issues: CheckIssue[] = [];
  const ran: string[] = [];
  for (const v of verifiers) {
    try {
      issues.push(...await v.verify(line, ctx));
      ran.push(v.name);
    } catch (e: any) {
      issues.push({ severity: 'warning', step: null, source: v.name, message: `${v.name} check couldn't run: ${e?.message ?? e}` });
    }
  }
  return { ok: !issues.some((i) => i.severity === 'error'), issues, verifiers: ran };
}

export interface GeneratedResult {
  line: GeneratedLine;
  report: CheckReport;
  repairs: number;
}

const MAX_REPAIRS = 2;

async function askForLine(model: LineModel, prompt: string): Promise<GeneratedLine> {
  const parsed = extractJson(await model.complete(prompt)) as { line?: unknown };
  const r = parseGeneratedLine(parsed.line ?? parsed);
  if (!r.ok) throw new Error(r.error);
  return r.line;
}

/** Ledger-check and repair a line with a model until it passes or repairs run out. */
export async function refineLine(
  model: LineModel, ctx: DeckContext, line: GeneratedLine, opts: { critique: boolean },
): Promise<GeneratedResult> {
  let current = line;
  let repairs = 0;
  const verifiers = opts.critique ? [ledgerVerifier, critiqueVerifier(model)] : [ledgerVerifier];

  // Cheap rule checks first; only spend a critique call on a line that passes them.
  let report = await runVerifiers(current, ctx, [ledgerVerifier]);
  while (!report.ok && repairs < MAX_REPAIRS) {
    current = await askForLine(model, buildRepairPrompt(ctx, current, report.issues));
    repairs++;
    report = await runVerifiers(current, ctx, [ledgerVerifier]);
  }
  if (report.ok && opts.critique) {
    report = await runVerifiers(current, ctx, verifiers);
    if (!report.ok && repairs < MAX_REPAIRS + 1) {
      const fixed = await askForLine(model, buildRepairPrompt(ctx, current, report.issues.filter((i) => i.severity === 'error')));
      repairs++;
      const recheck = await runVerifiers(fixed, ctx, verifiers);
      // Keep the repair only if it isn't worse.
      if (recheck.issues.filter((i) => i.severity === 'error').length <= report.issues.filter((i) => i.severity === 'error').length) {
        current = fixed; report = recheck;
      }
    }
  }
  return { line: current, report, repairs };
}

export type Progress = (msg: string) => void;

/** Full server-side run: pick openers, then generate and refine one line per opener. */
export async function generateLines(
  model: LineModel, ctx: DeckContext, opts: { maxLines?: number; critique?: boolean; onProgress?: Progress } = {},
): Promise<GeneratedResult[]> {
  const progress = opts.onProgress ?? (() => {});
  progress('Finding your starters');
  const openersRaw = extractJson(await model.complete(buildOpenersPrompt(ctx, opts.maxLines ?? 8))) as {
    openers?: Array<{ starters?: unknown; freeCards?: number; goal?: string }>;
  };
  const openers = (openersRaw.openers ?? [])
    .filter((o) => Array.isArray(o.starters) && o.starters.length > 0)
    .slice(0, opts.maxLines ?? 8) as Array<{ starters: string[][]; freeCards?: number; goal?: string }>;
  if (openers.length === 0) throw new Error('The model found no starters for this deck');

  const results: GeneratedResult[] = [];
  for (const [i, opener] of openers.entries()) {
    progress(`Line ${i + 1} of ${openers.length}: ${opener.starters.map((s) => s.join(' / ')).join(' + ')}`);
    try {
      const first = await askForLine(model, buildLinePrompt(ctx, opener));
      results.push(await refineLine(model, ctx, first, { critique: opts.critique ?? true }));
    } catch (e: any) {
      progress(`Line ${i + 1} failed: ${e?.message ?? e}`);
    }
  }
  return results;
}
