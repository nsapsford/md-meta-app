import { Router, Request, Response } from 'express';
import type { Pool } from '@neondatabase/serverless';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';
import { config } from '../config.js';
import {
  generateOpponentDossier,
  generatePilotDossier,
  getLatestDossier,
  getDossierHistory,
  type DossierDepth,
} from '../services/dossierService.js';

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!config.adminToken || token !== config.adminToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// 'quick' trades thoroughness for a faster/cheaper model, for mid-duel use;
// 'detailed' (default) is the original thorough treatment.
function parseDepth(body: any, res: Response): DossierDepth | null {
  const depth = body?.depth;
  if (depth === undefined || depth === null) return 'detailed';
  if (depth === 'quick' || depth === 'detailed') return depth;
  res.status(400).json({ error: 'depth must be "quick" or "detailed"' });
  return null;
}

// For GET lookups, an absent depth means "latest of either depth" rather than
// defaulting to 'detailed' — callers that want a specific depth's latest
// version (to switch between an already-generated quick/detailed pair
// without regenerating) pass ?depth= explicitly.
function parseOptionalDepth(raw: unknown, res: Response): DossierDepth | undefined | null {
  if (raw === undefined) return undefined;
  if (raw === 'quick' || raw === 'detailed') return raw;
  res.status(400).json({ error: 'depth must be "quick" or "detailed"' });
  return null;
}

// Dossiers key off the canonical deck_types.name so casing/spacing always
// matches, regardless of how the client typed the archetype. Also returns
// updated_at so callers can flag a dossier stale when the meta has moved
// since it was generated.
async function resolveCanonicalArchetype(pool: Pool, name: string): Promise<{ name: string; updated_at: number } | null> {
  const row = await queryOne(pool, 'SELECT name, updated_at FROM deck_types WHERE LOWER(name) = LOWER($1)', [name]);
  return row ?? null;
}

router.get('/opponent/:archetype', async (req: Request, res: Response) => {
  const depth = parseOptionalDepth(req.query.depth, res);
  if (depth === null) return;
  try {
    const pool = getPool();
    const deckType = await resolveCanonicalArchetype(pool, req.params.archetype);
    if (!deckType) return res.status(404).json({ error: 'Unknown archetype' });
    const dossier = await getLatestDossier(pool, 'opponent', deckType.name, null, depth);
    const notes = await queryAll(pool,
      `SELECT * FROM dossier_notes WHERE kind = 'opponent' AND LOWER(archetype) = LOWER($1) ORDER BY created_at DESC`,
      [deckType.name]
    );
    // Stale = the archetype's tier-list data has been refreshed since this
    // dossier was generated, i.e. the meta may have moved under it.
    const stale = dossier ? deckType.updated_at > dossier.generated_at : false;
    res.json({ dossier, notes, stale });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/opponent/:archetype/history', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const deckType = await resolveCanonicalArchetype(pool, req.params.archetype);
    if (!deckType) return res.status(404).json({ error: 'Unknown archetype' });
    res.json(await getDossierHistory(pool, 'opponent', deckType.name, null));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/opponent/:archetype/generate', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const depth = parseDepth(req.body, res);
  if (!depth) return;
  try {
    const pool = getPool();
    const deckType = await resolveCanonicalArchetype(pool, req.params.archetype);
    if (!deckType) return res.status(404).json({ error: 'Unknown archetype' });
    res.status(201).json(await generateOpponentDossier(pool, deckType.name, depth));
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

router.post('/bulk-generate', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const pool = getPool();
    const limit = Math.min(parseInt(req.body?.limit) || 10, 25);
    const archetypes = await queryAll(pool,
      `SELECT name FROM deck_types WHERE power IS NOT NULL AND power > 0 ORDER BY power DESC LIMIT $1`,
      [limit]
    );
    const results: Array<{ archetype: string; ok: boolean; error?: string }> = [];
    for (const { name } of archetypes) {
      try {
        await generateOpponentDossier(pool, name);
        results.push({ archetype: name, ok: true });
      } catch (err: any) {
        results.push({ archetype: name, ok: false, error: err.message });
      }
    }
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pilot/:deckId', async (req: Request, res: Response) => {
  const depth = parseOptionalDepth(req.query.depth, res);
  if (depth === null) return;
  try {
    const pool = getPool();
    const deckId = parseInt(req.params.deckId);
    const deckRow = await queryOne(pool, 'SELECT updated_at FROM user_decks WHERE id = $1', [deckId]);
    if (!deckRow) return res.status(404).json({ error: 'Deck not found' });
    const dossier = await getLatestDossier(pool, 'pilot', null, deckId, depth);
    const notes = await queryAll(pool,
      `SELECT * FROM dossier_notes WHERE kind = 'pilot' AND deck_id = $1 ORDER BY created_at DESC`,
      [deckId]
    );
    // Stale = the saved deck was edited since this pilot guide was generated.
    const stale = dossier ? deckRow.updated_at > dossier.generated_at : false;
    res.json({ dossier, notes, stale });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pilot/:deckId/history', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    res.json(await getDossierHistory(pool, 'pilot', null, parseInt(req.params.deckId)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pilot/:deckId/generate', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const depth = parseDepth(req.body, res);
  if (!depth) return;
  try {
    const pool = getPool();
    res.status(201).json(await generatePilotDossier(pool, parseInt(req.params.deckId), depth));
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

const NOTE_CATEGORIES = ['negate-priority', 'play-around', 'combo-line', 'general'];

router.get('/notes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { kind, archetype, deck_id } = req.query as { kind?: string; archetype?: string; deck_id?: string };
    if (kind !== 'opponent' && kind !== 'pilot') return res.status(400).json({ error: 'kind must be opponent or pilot' });

    let rows;
    if (kind === 'opponent') {
      if (!archetype) return res.status(400).json({ error: 'archetype is required' });
      rows = await queryAll(pool,
        `SELECT * FROM dossier_notes WHERE kind = 'opponent' AND LOWER(archetype) = LOWER($1) ORDER BY created_at DESC`,
        [archetype]
      );
    } else {
      if (!deck_id) return res.status(400).json({ error: 'deck_id is required' });
      rows = await queryAll(pool,
        `SELECT * FROM dossier_notes WHERE kind = 'pilot' AND deck_id = $1 ORDER BY created_at DESC`,
        [parseInt(deck_id)]
      );
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes', async (req: Request, res: Response) => {
  try {
    const { kind, archetype, deck_id, category, note, game_id } = req.body;
    if (kind !== 'opponent' && kind !== 'pilot') return res.status(400).json({ error: 'kind must be opponent or pilot' });
    if (!NOTE_CATEGORIES.includes(category)) return res.status(400).json({ error: `category must be one of ${NOTE_CATEGORIES.join(', ')}` });
    if (!note || typeof note !== 'string') return res.status(400).json({ error: 'note is required' });
    if (kind === 'opponent' && !archetype) return res.status(400).json({ error: 'archetype is required for opponent notes' });
    if (kind === 'pilot' && !deck_id) return res.status(400).json({ error: 'deck_id is required for pilot notes' });

    const pool = getPool();
    const row = await queryOne(pool,
      `INSERT INTO dossier_notes (kind, archetype, deck_id, category, note, game_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [kind, kind === 'opponent' ? archetype : null, kind === 'pilot' ? deck_id : null, category, note, game_id ?? null]
    );
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notes/:id', async (req: Request, res: Response) => {
  try {
    await run(getPool(), 'DELETE FROM dossier_notes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
