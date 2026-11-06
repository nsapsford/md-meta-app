// Line Trainer: validation for user-authored combo lines, and conversion of
// AI pilot-dossier text into unverified draft lines. Pure (no DB) so the
// rules are unit-tested; routes/lines.ts does the persistence.

export const LINE_STATUSES = ['draft', 'verified'] as const;
export const LINE_SOURCES = ['manual', 'ai-draft', 'guide', 'solver'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];
export type LineSource = (typeof LINE_SOURCES)[number];

export interface LineBranch {
  id: string;
  interruption: string;
  response: string;
}

export interface LineStep {
  id: string;
  text: string;
  branches: LineBranch[];
}

export interface LineInput {
  name: string;
  rank: number;
  status: LineStatus;
  source: LineSource;
  /** Each slot lists interchangeable passcodes; every slot needs its own card in hand. */
  starters: number[][];
  steps: LineStep[];
  end_board: string | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const LIMITS = {
  name: 120,
  slots: 6,
  slotCards: 20,
  steps: 60,
  stepText: 500,
  branches: 10,
  interruption: 80,
  response: 500,
  endBoard: 500,
  id: 64,
  rankMax: 10_000,
};

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= max ? s : null;
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= LIMITS.id && /^[A-Za-z0-9_-]+$/.test(v);
}

function parseStarters(v: unknown): number[][] | string {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return 'starters must be an array of slots';
  if (v.length > LIMITS.slots) return `at most ${LIMITS.slots} starter slots`;
  const slots: number[][] = [];
  for (const slot of v) {
    if (!Array.isArray(slot) || slot.length === 0) return 'each starter slot must be a non-empty array of passcodes';
    if (slot.length > LIMITS.slotCards) return `at most ${LIMITS.slotCards} cards per starter slot`;
    const codes = slot.map(Number);
    if (!codes.every((n) => Number.isInteger(n) && n > 0)) return 'starter passcodes must be positive integers';
    slots.push([...new Set(codes)]);
  }
  return slots;
}

function parseSteps(v: unknown): LineStep[] | string {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return 'steps must be an array';
  if (v.length > LIMITS.steps) return `at most ${LIMITS.steps} steps`;
  const ids = new Set<string>();
  const steps: LineStep[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') return 'each step must be an object';
    const { id, text, branches } = raw as Record<string, unknown>;
    if (!isId(id)) return 'each step needs an id (letters, digits, - or _)';
    if (ids.has(id)) return `duplicate id "${id}"`;
    ids.add(id);
    const cleanText = cleanString(text, LIMITS.stepText);
    if (!cleanText) return `step text must be 1-${LIMITS.stepText} characters`;

    const parsedBranches: LineBranch[] = [];
    if (branches !== undefined && branches !== null) {
      if (!Array.isArray(branches)) return 'branches must be an array';
      if (branches.length > LIMITS.branches) return `at most ${LIMITS.branches} branches per step`;
      for (const b of branches) {
        if (!b || typeof b !== 'object') return 'each branch must be an object';
        const br = b as Record<string, unknown>;
        if (!isId(br.id)) return 'each branch needs an id (letters, digits, - or _)';
        if (ids.has(br.id)) return `duplicate id "${br.id}"`;
        ids.add(br.id);
        const interruption = cleanString(br.interruption, LIMITS.interruption);
        if (!interruption) return `branch interruption must be 1-${LIMITS.interruption} characters`;
        const response = cleanString(br.response, LIMITS.response);
        if (!response) return `branch response must be 1-${LIMITS.response} characters`;
        parsedBranches.push({ id: br.id, interruption, response });
      }
    }
    steps.push({ id, text: cleanText, branches: parsedBranches });
  }
  return steps;
}

export function validateLineInput(body: unknown): ValidationResult<LineInput> {
  if (!body || typeof body !== 'object') return fail('body must be an object');
  const b = body as Record<string, unknown>;

  const name = cleanString(b.name, LIMITS.name);
  if (!name) return fail(`name must be 1-${LIMITS.name} characters`);

  const rank = b.rank === undefined || b.rank === null ? 100 : Number(b.rank);
  if (!Number.isInteger(rank) || rank < 0 || rank > LIMITS.rankMax) return fail(`rank must be an integer 0-${LIMITS.rankMax}`);

  const status = b.status ?? 'draft';
  if (!(LINE_STATUSES as readonly unknown[]).includes(status)) return fail(`status must be one of ${LINE_STATUSES.join(', ')}`);

  const source = b.source ?? 'manual';
  if (!(LINE_SOURCES as readonly unknown[]).includes(source)) return fail(`source must be one of ${LINE_SOURCES.join(', ')}`);

  const starters = parseStarters(b.starters);
  if (typeof starters === 'string') return fail(starters);

  const steps = parseSteps(b.steps);
  if (typeof steps === 'string') return fail(steps);

  let end_board: string | null = null;
  if (b.end_board !== undefined && b.end_board !== null && b.end_board !== '') {
    end_board = cleanString(b.end_board, LIMITS.endBoard);
    if (!end_board) return fail(`end_board must be at most ${LIMITS.endBoard} characters`);
  }

  // A line you can't draw into or can't walk through can't be "verified".
  if (status === 'verified' && (starters.length === 0 || steps.length === 0)) {
    return fail('a verified line needs at least one starter slot and one step');
  }

  return {
    ok: true,
    value: { name, rank, status: status as LineStatus, source: source as LineSource, starters, steps, end_board },
  };
}

/** Drill item keys that belong to a line — used to clear review history when a line is deleted. */
export function lineItemKeyPrefix(lineId: number): { line: string; branchPrefix: string } {
  return { line: `line:${lineId}`, branchPrefix: `branch:${lineId}:` };
}

const STEP_SEPARATOR = /\s*(?:→|->|=>|;|\n)\s*|\.\s+(?=[A-Z0-9"'(])/;

/**
 * Turn one free-text AI combo line into ordered steps. AI lines usually chain
 * actions with arrows or sentences; anything unsplittable becomes one step.
 */
export function splitLineText(text: string): string[] {
  const parts = text
    .split(STEP_SEPARATOR)
    .map((p) => p.trim().replace(/\.$/, '').trim())
    .filter((p) => p.length > 0)
    .map((p) => (p.length > LIMITS.stepText ? p.slice(0, LIMITS.stepText) : p));
  return parts.slice(0, LIMITS.steps);
}

function draftName(text: string, index: number): string {
  const firstStep = splitLineText(text)[0] ?? text;
  const base = firstStep.length > 60 ? `${firstStep.slice(0, 57).trimEnd()}...` : firstStep;
  return `AI draft ${index + 1}: ${base}`.slice(0, LIMITS.name);
}

/**
 * AI pilot-dossier combo lines -> unverified draft lines. Starters are left
 * empty on purpose: the user has to say which cards the line actually needs,
 * which is the first act of checking it.
 */
export function draftsFromAiLines(comboLines: string[], newId: () => string): LineInput[] {
  return comboLines
    .filter((t) => typeof t === 'string' && t.trim().length > 0)
    .map((text, i) => ({
      name: draftName(text, i),
      rank: 100 + i,
      status: 'draft' as const,
      source: 'ai-draft' as const,
      starters: [],
      steps: splitLineText(text).map((s) => ({ id: newId(), text: s, branches: [] })),
      end_board: null,
    }))
    .filter((d) => d.steps.length > 0);
}
