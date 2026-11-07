import { randomUUID } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';
import {
  validateLineInput, draftsFromAiLines, lineItemKeyPrefix, type LineInput,
} from '../services/comboLineService.js';
import { schedule, newReviewState, isGrade, type ReviewState } from '../services/srsService.js';
import { getLatestDossier } from '../services/dossierService.js';
import { config } from '../config.js';
import { loadDeckContext } from '../services/lineGen/deckContext.js';
import { buildPastePrompt, buildRepairPrompt, extractJson, parseGeneratedLine } from '../services/lineGen/prompts.js';
import { checkLineLedger } from '../services/lineGen/ledgerChecker.js';
import { toTrainerLine, type StoredChecks } from '../services/lineGen/convert.js';
import { getLineModel } from '../services/lineGen/providers.js';
import { generateLines } from '../services/lineGen/pipeline.js';
import type { CheckIssue, GeneratedLine } from '../services/lineGen/types.js';

// Line Trainer: the user's own combo lines for a saved deck, and the
// spaced-repetition state for drilling them.
const router = Router();

const NOW = () => Math.floor(Date.now() / 1000);

function toLine(row: any) {
  return {
    id: row.id,
    deck_id: row.deck_id,
    name: row.name,
    rank: row.rank,
    status: row.status,
    source: row.source,
    starters: JSON.parse(row.starters_json),
    steps: JSON.parse(row.steps_json),
    end_board: row.end_board,
    plan: row.plan_json ? JSON.parse(row.plan_json) : null,
    checks: row.check_json ? JSON.parse(row.check_json) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function deckExists(deckId: number): Promise<boolean> {
  return !!(await queryOne(getPool(), 'SELECT 1 FROM user_decks WHERE id = $1', [deckId]));
}

async function insertLine(deckId: number, line: LineInput, extra: { plan?: GeneratedLine; checks?: StoredChecks } = {}) {
  const now = NOW();
  const row = await queryOne(getPool(),
    `INSERT INTO combo_lines (deck_id, name, rank, status, source, starters_json, steps_json, end_board, plan_json, check_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING *`,
    [deckId, line.name, line.rank, line.status, line.source,
      JSON.stringify(line.starters), JSON.stringify(line.steps), line.end_board,
      extra.plan ? JSON.stringify(extra.plan) : null, extra.checks ? JSON.stringify(extra.checks) : null, now]
  );
  return toLine(row);
}

// GET /api/lines?deck_id= -> lines for the deck, best rank first
router.get('/', async (req: Request, res: Response) => {
  const deckId = parseId(req.query.deck_id);
  if (!deckId) return res.status(400).json({ error: 'deck_id is required' });
  try {
    const rows = await queryAll(getPool(),
      'SELECT * FROM combo_lines WHERE deck_id = $1 ORDER BY rank ASC, id ASC', [deckId]);
    res.json(rows.map(toLine));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lines { deck_id, name, rank?, status?, source?, starters?, steps?, end_board? }
router.post('/', async (req: Request, res: Response) => {
  const deckId = parseId(req.body?.deck_id);
  if (!deckId) return res.status(400).json({ error: 'deck_id is required' });
  const parsed = validateLineInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    if (!(await deckExists(deckId))) return res.status(404).json({ error: 'Deck not found' });
    res.status(201).json(await insertLine(deckId, parsed.value));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/lines/:id — full replacement of the line's editable fields
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const parsed = validateLineInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const line = parsed.value;
  try {
    const pool = getPool();
    const row = await queryOne(pool,
      // An edited line no longer matches what was checked, so its checks are dropped.
      `UPDATE combo_lines SET name=$1, rank=$2, status=$3, source=$4, starters_json=$5, steps_json=$6, end_board=$7, updated_at=$8,
         check_json = CASE WHEN starters_json = $5 AND steps_json = $6 THEN check_json ELSE NULL END
       WHERE id=$9 RETURNING *`,
      [line.name, line.rank, line.status, line.source,
        JSON.stringify(line.starters), JSON.stringify(line.steps), line.end_board, NOW(), id]
    );
    if (!row) return res.status(404).json({ error: 'Line not found' });

    // Branches that were removed take their drill history with them.
    const keep = line.steps.flatMap((s) => s.branches.map((b) => `branch:${id}:${b.id}`));
    await run(pool,
      `DELETE FROM drill_reviews WHERE item_key LIKE $1 AND NOT (item_key = ANY($2::text[]))`,
      [`${lineItemKeyPrefix(id).branchPrefix}%`, keep]
    );
    res.json(toLine(row));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lines/:id -> also clears the line's drill history
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  try {
    const pool = getPool();
    const { line, branchPrefix } = lineItemKeyPrefix(id);
    await run(pool, 'DELETE FROM drill_reviews WHERE item_key = $1 OR item_key LIKE $2', [line, `${branchPrefix}%`]);
    await run(pool, 'DELETE FROM combo_lines WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lines/import-ai/:deckId -> turns the latest pilot dossier's combo
// lines into unverified drafts. Re-importing skips drafts already present.
router.post('/import-ai/:deckId', async (req: Request, res: Response) => {
  const deckId = parseId(req.params.deckId);
  if (!deckId) return res.status(400).json({ error: 'invalid deck id' });
  try {
    const pool = getPool();
    if (!(await deckExists(deckId))) return res.status(404).json({ error: 'Deck not found' });
    const dossier = await getLatestDossier(pool, 'pilot', null, deckId);
    const comboLines: unknown = dossier?.content_json?.comboLines;
    if (!Array.isArray(comboLines) || comboLines.length === 0) {
      return res.status(404).json({ error: 'No AI pilot guide with combo lines for this deck yet — generate one in Duel Mode first' });
    }

    const existing = await queryAll<{ name: string }>(pool,
      `SELECT name FROM combo_lines WHERE deck_id = $1 AND source = 'ai-draft'`, [deckId]);
    const existingNames = new Set(existing.map((r) => r.name));

    const drafts = draftsFromAiLines(comboLines.filter((l): l is string => typeof l === 'string'), randomUUID);
    const created = [];
    let skipped = 0;
    for (const d of drafts) {
      if (existingNames.has(d.name)) { skipped++; continue; }
      created.push(await insertLine(deckId, d));
    }
    res.status(201).json({ created, skipped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lines/reviews?deck_id= -> spaced-repetition state for the deck's drill items
router.get('/reviews', async (req: Request, res: Response) => {
  const deckId = parseId(req.query.deck_id);
  if (!deckId) return res.status(400).json({ error: 'deck_id is required' });
  try {
    res.json(await queryAll(getPool(),
      'SELECT item_key, ease, interval_days, reps, lapses, due_at, last_grade, updated_at FROM drill_reviews WHERE deck_id = $1',
      [deckId]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const ITEM_KEY = /^(?:line:(\d+)|branch:(\d+):([A-Za-z0-9_-]{1,64}))$/;

// POST /api/lines/reviews { deck_id, item_key, grade } -> the item's new schedule
router.post('/reviews', async (req: Request, res: Response) => {
  const deckId = parseId(req.body?.deck_id);
  const itemKey = req.body?.item_key;
  const grade = req.body?.grade;
  if (!deckId) return res.status(400).json({ error: 'deck_id is required' });
  if (!isGrade(grade)) return res.status(400).json({ error: 'grade must be again, hard, good or easy' });
  const match = typeof itemKey === 'string' ? ITEM_KEY.exec(itemKey) : null;
  if (!match) return res.status(400).json({ error: 'item_key must be line:<id> or branch:<lineId>:<branchId>' });
  const lineId = Number(match[1] ?? match[2]);
  const branchId = match[3];

  try {
    const pool = getPool();
    const lineRow = await queryOne(pool, 'SELECT deck_id, steps_json FROM combo_lines WHERE id = $1', [lineId]);
    if (!lineRow || lineRow.deck_id !== deckId) return res.status(404).json({ error: 'Line not found for this deck' });
    if (branchId) {
      const steps: Array<{ branches: Array<{ id: string }> }> = JSON.parse(lineRow.steps_json);
      if (!steps.some((s) => s.branches.some((b) => b.id === branchId))) {
        return res.status(404).json({ error: 'Branch not found on this line' });
      }
    }

    const now = NOW();
    const prevRow = await queryOne(pool, 'SELECT ease, interval_days, reps, lapses, due_at FROM drill_reviews WHERE item_key = $1', [itemKey]);
    const prev: ReviewState = prevRow
      ? { ease: Number(prevRow.ease), interval_days: Number(prevRow.interval_days), reps: prevRow.reps, lapses: prevRow.lapses, due_at: prevRow.due_at }
      : newReviewState(now);
    const next = schedule(prev, grade, now);

    const row = await queryOne(pool,
      `INSERT INTO drill_reviews (item_key, deck_id, ease, interval_days, reps, lapses, due_at, last_grade, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (item_key) DO UPDATE SET
         ease = EXCLUDED.ease, interval_days = EXCLUDED.interval_days, reps = EXCLUDED.reps,
         lapses = EXCLUDED.lapses, due_at = EXCLUDED.due_at, last_grade = EXCLUDED.last_grade, updated_at = EXCLUDED.updated_at
       RETURNING item_key, ease, interval_days, reps, lapses, due_at, last_grade, updated_at`,
      [itemKey, deckId, next.ease, next.interval_days, next.reps, next.lapses, next.due_at, grade, now]
    );
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/lines/:id/status { status } — one-tap verify / back to draft
router.patch('/:id/status', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const status = req.body?.status;
  if (!id) return res.status(400).json({ error: 'invalid id' });
  if (status !== 'draft' && status !== 'verified') return res.status(400).json({ error: 'status must be draft or verified' });
  try {
    const row = await queryOne(getPool(),
      `UPDATE combo_lines SET status = $1, updated_at = $2 WHERE id = $3
         AND ($1 = 'draft' OR (starters_json <> '[]' AND steps_json <> '[]')) RETURNING *`,
      [status, NOW(), id]);
    if (!row) return res.status(409).json({ error: 'Line not found, or it has no starters/steps to verify' });
    res.json(toLine(row));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Line generator ──

function isAdmin(req: Request): boolean {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  return !!config.adminToken && token === config.adminToken;
}

// GET /api/lines/generator -> which server-side model (if any) can generate lines
router.get('/generator', (_req: Request, res: Response) => {
  res.json({ serverModel: getLineModel()?.id ?? null });
});

// GET /api/lines/generate-prompt/:deckId -> a self-contained prompt to run in Claude Code / claude.ai
router.get('/generate-prompt/:deckId', async (req: Request, res: Response) => {
  const deckId = parseId(req.params.deckId);
  if (!deckId) return res.status(400).json({ error: 'invalid deck id' });
  try {
    const { ctx, missing } = await loadDeckContext(getPool(), deckId);
    res.json({ prompt: buildPastePrompt(ctx), missing });
  } catch (err: any) {
    res.status(err.message?.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

/** Save generated lines as drafts with their check reports. Same-named drafts are replaced. */
async function saveGenerated(
  deckId: number, items: Array<{ line: GeneratedLine; issues: CheckIssue[]; verifiers: string[]; repairs: number }>, generator: string,
) {
  const pool = getPool();
  const { ctx } = await loadDeckContext(pool, deckId);
  const existing = await queryAll<{ id: number; name: string; status: string; rank: number }>(pool,
    'SELECT id, name, status, rank FROM combo_lines WHERE deck_id = $1', [deckId]);
  let rank = existing.reduce((m, l) => Math.max(m, l.rank), 0);
  const saved = [];
  for (const item of items) {
    const checks: StoredChecks = {
      ok: !item.issues.some((i) => i.severity === 'error'),
      issues: item.issues, verifiers: item.verifiers, generator, checkedAt: NOW(), repairs: item.repairs,
    };
    const replace = existing.find((l) => l.name === item.line.name.slice(0, 120) && l.status === 'draft');
    const trainer = toTrainerLine(item.line, ctx, replace ? replace.rank : (rank += 10));
    if (replace) {
      const row = await queryOne(pool,
        `UPDATE combo_lines SET starters_json=$1, steps_json=$2, end_board=$3, plan_json=$4, check_json=$5, source='ai-draft', updated_at=$6
         WHERE id=$7 RETURNING *`,
        [JSON.stringify(trainer.starters), JSON.stringify(trainer.steps), trainer.end_board,
          JSON.stringify(item.line), JSON.stringify(checks), NOW(), replace.id]);
      await run(pool, 'DELETE FROM drill_reviews WHERE item_key = $1 OR item_key LIKE $2',
        [`line:${replace.id}`, `branch:${replace.id}:%`]);
      saved.push(toLine(row));
    } else {
      saved.push(await insertLine(deckId, trainer, { plan: item.line, checks }));
    }
  }
  return saved;
}

// POST /api/lines/import-generated/:deckId { text } -> lines a model wrote (pasted from Claude),
// ledger-checked and saved as drafts. Returns a repair prompt for any that failed.
router.post('/import-generated/:deckId', async (req: Request, res: Response) => {
  const deckId = parseId(req.params.deckId);
  const text = req.body?.text;
  if (!deckId) return res.status(400).json({ error: 'invalid deck id' });
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Paste the JSON the model returned' });
  try {
    if (!(await deckExists(deckId))) return res.status(404).json({ error: 'Deck not found' });
    let parsed: any;
    try { parsed = extractJson(text); } catch (e: any) { return res.status(422).json({ error: `Couldn't read that as JSON: ${e.message}` }); }
    const rawLines: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.lines) ? parsed.lines : parsed?.line ? [parsed.line] : [parsed];
    const { ctx } = await loadDeckContext(getPool(), deckId);
    const rejected: Array<{ name: string; error: string }> = [];
    const good: Array<{ line: GeneratedLine; issues: CheckIssue[]; verifiers: string[]; repairs: number }> = [];
    for (const raw of rawLines.slice(0, 30)) {
      const r = parseGeneratedLine(raw);
      if (!r.ok) { rejected.push({ name: (raw as any)?.name ?? '(unnamed)', error: r.error }); continue; }
      good.push({ line: r.line, issues: checkLineLedger(r.line, ctx), verifiers: ['ledger'], repairs: 0 });
    }
    const created = await saveGenerated(deckId, good, typeof req.body?.generator === 'string' ? req.body.generator.slice(0, 60) : 'pasted');
    const failing = good.filter((g) => g.issues.some((i) => i.severity === 'error'));
    const repairPrompt = failing.length
      ? failing.map((f) => buildRepairPrompt(ctx, f.line, f.issues.filter((i) => i.severity === 'error'))).join('\n\n---\n\n')
        + '\n\nRespond with ONLY the JSON, inside one ```json code block: {"lines": [ ...every corrected line... ]}'
      : null;
    res.status(201).json({ created, rejected, failing: failing.length, repairPrompt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

interface GenJob { id: string; deckId: number; status: 'running' | 'done' | 'failed'; progress: string[]; created: number; error?: string; startedAt: number }
const jobs = new Map<string, GenJob>();

// POST /api/lines/generate/:deckId (admin) -> starts a server-side generation job
router.post('/generate/:deckId', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const deckId = parseId(req.params.deckId);
  if (!deckId) return res.status(400).json({ error: 'invalid deck id' });
  const model = getLineModel();
  if (!model) return res.status(503).json({ error: 'No model API key is configured on the server. Use "Generate with Claude" (copy prompt) instead.' });
  if ([...jobs.values()].some((j) => j.deckId === deckId && j.status === 'running')) {
    return res.status(409).json({ error: 'Already generating lines for this deck' });
  }
  const job: GenJob = { id: randomUUID(), deckId, status: 'running', progress: [], created: 0, startedAt: NOW() };
  jobs.set(job.id, job);
  res.status(202).json(job);

  (async () => {
    try {
      const { ctx } = await loadDeckContext(getPool(), deckId);
      const results = await generateLines(model, ctx, {
        maxLines: Math.min(Number(req.body?.maxLines) || 8, 12),
        critique: req.body?.critique !== false,
        onProgress: (m) => job.progress.push(m),
      });
      const saved = await saveGenerated(deckId,
        results.map((r) => ({ line: r.line, issues: r.report.issues, verifiers: r.report.verifiers, repairs: r.repairs })), model.id);
      job.created = saved.length;
      job.status = 'done';
    } catch (e: any) {
      job.status = 'failed';
      job.error = e?.message ?? String(e);
    }
  })();
});

// GET /api/lines/generate/jobs/:id -> job progress
router.get('/generate/jobs/:id', (req: Request, res: Response) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found (the server may have restarted)' });
  res.json(job);
});

export default router;
