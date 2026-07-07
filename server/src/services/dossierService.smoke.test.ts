import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { getPool } from '../db/connection.js';
import { run } from '../utils/dbHelpers.js';
import { generateOpponentDossier, validateOpponentContent } from './dossierService.js';

// Real end-to-end smoke test: exercises prompt -> live model call -> JSON
// parse -> schema validation -> DB write, without needing an
// ANTHROPIC_API_KEY. Requires GEMINI_API_KEY (free tier, see .env.example)
// and DATABASE_URL. Skipped entirely otherwise, so it never blocks `npm test`.
const canRun = !!process.env.GEMINI_API_KEY && !!process.env.DATABASE_URL;

describe.skipIf(!canRun)('dossierService smoke test (live Gemini call)', () => {
  const archetype = `__smoke_test_${Date.now()}`;

  afterAll(async () => {
    await run(getPool(), 'DELETE FROM dossiers WHERE archetype = $1', [archetype]);
  });

  it('generates a real, schema-valid opponent dossier', async () => {
    const dossier = await generateOpponentDossier(getPool(), archetype);
    expect(dossier.status).toBe('completed');
    expect(validateOpponentContent(dossier.content_json)).toBe(true);
  }, 60000);
});
