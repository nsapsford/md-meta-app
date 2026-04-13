This file is a merged representation of the entire codebase, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
.claude/launch.json
.gitignore
.superpowers/brainstorm/904-1775466494/content/approaches.html
.superpowers/brainstorm/904-1775466494/content/design-section1-sync.html
.superpowers/brainstorm/904-1775466494/content/design-section2-quality.html
.superpowers/brainstorm/904-1775466494/content/design-section3-matchups.html
.superpowers/brainstorm/904-1775466494/content/design-section3-v2.html
.superpowers/brainstorm/904-1775466494/content/focus-areas.html
.superpowers/brainstorm/904-1775466494/content/text-size-compare.html
.superpowers/brainstorm/904-1775466494/content/waiting-1.html
.superpowers/brainstorm/904-1775466494/content/waiting-2.html
.superpowers/brainstorm/904-1775466494/state/server-stopped
.superpowers/brainstorm/904-1775466494/state/server.pid
client/.env.example
client/index.html
client/package.json
client/postcss.config.js
client/public/favicon.svg
client/src/api/cards.ts
client/src/api/client.ts
client/src/api/matchups.ts
client/src/api/meta.ts
client/src/api/sync.ts
client/src/api/tournaments.ts
client/src/App.tsx
client/src/components/common/CardImage.tsx
client/src/components/common/ErrorBanner.tsx
client/src/components/common/LoadingSpinner.tsx
client/src/components/common/NegateImpact.tsx
client/src/components/common/Pagination.tsx
client/src/components/common/SearchInput.tsx
client/src/components/common/SyncFreshnessBadge.tsx
client/src/components/common/TierBadge.tsx
client/src/components/dashboard/TierListView.tsx
client/src/components/dashboard/TopArchetypesGrid.tsx
client/src/components/decks/DecklistView.tsx
client/src/components/layout/Header.tsx
client/src/components/layout/Sidebar.tsx
client/src/components/matchups/EcosystemView.tsx
client/src/components/matchups/MetaAdvisor.tsx
client/src/hooks/useDebounce.ts
client/src/index.css
client/src/main.tsx
client/src/pages/BanList.tsx
client/src/pages/CardSearch.tsx
client/src/pages/Dashboard.tsx
client/src/pages/DeckBuilder.tsx
client/src/pages/DeckProfile.tsx
client/src/pages/Matchups.tsx
client/src/pages/MetaTrends.tsx
client/src/pages/Tournaments.tsx
client/src/test/matchupBlend.test.ts
client/src/test/syncFreshness.test.ts
client/src/types/card.ts
client/src/types/deck.ts
client/src/types/meta.ts
client/src/utils/matchupBlend.ts
client/src/utils/syncFreshness.ts
client/src/vite-env.d.ts
client/tailwind.config.ts
client/tsconfig.json
client/vercel.json
client/vite.config.ts
package.json
server/.env.example
server/migrate-local-to-neon.mjs
server/package.json
server/render.yaml
server/src/config.ts
server/src/db/connection.ts
server/src/db/schema.sql
server/src/index.ts
server/src/routes/banList.ts
server/src/routes/cards.ts
server/src/routes/deckBuilder.ts
server/src/routes/decks.ts
server/src/routes/matchups.ts
server/src/routes/metaTrends.ts
server/src/routes/sync.ts
server/src/routes/tierList.ts
server/src/routes/tournaments.ts
server/src/services/cacheService.ts
server/src/services/ecosystemAnalysisService.ts
server/src/services/matchupBlendService.ts
server/src/services/mdmService.ts
server/src/services/syncService.ts
server/src/services/syncStatusService.ts
server/src/services/tierListService.ts
server/src/services/untappedAuthService.ts
server/src/services/untappedService.ts
server/src/services/ygoprodeckService.ts
server/src/utils/dbHelpers.ts
server/src/utils/rateLimiter.ts
server/tsconfig.json
start.bat
```

# Files

## File: server/migrate-local-to-neon.mjs
```javascript
/**
 * One-time migration script: copies historical data from local SQLite (data.db) to Neon PostgreSQL.
 *
 * Usage: node migrate-local-to-neon.mjs
 * Requires: DATABASE_URL in .env
 */
import Database from 'better-sqlite3';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config(); // load .env

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, 'data.db');

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const sqlite = new Database(DB_PATH, { readonly: true });

async function migrateTable(tableName, { batchSize = 200, onConflict = 'DO NOTHING' } = {}) {
  // Get all rows from SQLite
  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
  if (rows.length === 0) {
    console.log(`[${tableName}] No rows to migrate`);
    return 0;
  }

  const columns = Object.keys(rows[0]);
  console.log(`[${tableName}] Migrating ${rows.length} rows (columns: ${columns.join(', ')})`);

  let migrated = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = [];
    const valueSets = [];

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const placeholders = columns.map((_, colIdx) => `$${j * columns.length + colIdx + 1}`);
      valueSets.push(`(${placeholders.join(', ')})`);

      for (const col of columns) {
        params.push(row[col] ?? null);
      }
    }

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valueSets.join(', ')} ON CONFLICT ${onConflict}`;

    try {
      await pool.query(sql, params);
      migrated += batch.length;
    } catch (err) {
      // If batch fails, try one-by-one to skip problematic rows
      console.warn(`[${tableName}] Batch insert failed, trying one-by-one: ${err.message}`);
      for (const row of batch) {
        const singleParams = columns.map(col => row[col] ?? null);
        const singlePlaceholders = columns.map((_, idx) => `$${idx + 1}`);
        const singleSql = `INSERT INTO ${tableName} (${singlePlaceholders.join(', ')}) VALUES (${singlePlaceholders.join(', ')}) ON CONFLICT ${onConflict}`;
        try {
          await pool.query(
            `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${singlePlaceholders.join(', ')}) ON CONFLICT ${onConflict}`,
            singleParams
          );
          migrated++;
        } catch (e) {
          // Skip this row
        }
      }
    }

    if ((i + batchSize) % 1000 === 0 || i + batchSize >= rows.length) {
      console.log(`[${tableName}] Progress: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }
  }

  console.log(`[${tableName}] Migrated ${migrated}/${rows.length} rows`);
  return migrated;
}

async function main() {
  console.log('=== Local SQLite → Neon PostgreSQL Migration ===\n');

  // Check what tables have data in SQLite
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('SQLite tables:', tables.map(t => t.name).join(', '));

  // Count rows in each table
  for (const t of tables) {
    const count = sqlite.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get();
    console.log(`  ${t.name}: ${count.c} rows`);
  }
  console.log('');

  // Migrate meta_snapshots (historical trend data)
  await migrateTable('meta_snapshots', {
    onConflict: '(deck_type_name, snapshot_date) DO NOTHING',
  });

  // Migrate matchups
  await migrateTable('matchups', {
    onConflict: '(deck_a, deck_b) DO UPDATE SET win_rate_a = EXCLUDED.win_rate_a, sample_size = EXCLUDED.sample_size, updated_at = EXCLUDED.updated_at',
  });

  // Migrate matchup_sources
  try {
    await migrateTable('matchup_sources', {
      onConflict: '(deck_a, deck_b, source) DO UPDATE SET win_rate = EXCLUDED.win_rate, sample_size = EXCLUDED.sample_size, updated_at = EXCLUDED.updated_at',
    });
  } catch (e) {
    console.log('[matchup_sources] Table may not exist in SQLite, skipping');
  }

  console.log('\n=== Migration Complete ===');

  sqlite.close();
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

## File: .gitignore
```
node_modules/
dist/
*.db
.env
.env.local
```

## File: .superpowers/brainstorm/904-1775466494/content/approaches.html
```html
<h2>Three approaches to improving the app</h2>
<p class="subtitle">Pick the one that feels right — I'll recommend my favourite below.</p>

<div class="options">
  <div class="option" data-choice="foundation" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Foundation First ⭐ Recommended</h3>
      <p>Fix data transparency (sync status + last-refreshed indicators) and code quality (error handling, API layer) first. Then build matchup intelligence on top of a solid, reliable base. Slower to get new features but everything works properly when you get there.</p>
      <div class="pros-cons" style="margin-top:12px">
        <div class="pros"><h4>Pros</h4><ul><li>No silent failures</li><li>Trustworthy data before showing analysis</li><li>Easier to debug matchup feature later</li></ul></div>
        <div class="cons"><h4>Cons</h4><ul><li>Matchup feature comes later</li></ul></div>
      </div>
    </div>
  </div>

  <div class="option" data-choice="feature-led" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Feature-Led</h3>
      <p>Build the matchup matrix and tournament meta advisor first — it's the highest-value new capability. UX polish and code quality improvements come afterwards.</p>
      <div class="pros-cons" style="margin-top:12px">
        <div class="pros"><h4>Pros</h4><ul><li>Most exciting feature ships sooner</li></ul></div>
        <div class="cons"><h4>Cons</h4><ul><li>Risk of matchup data being stale/wrong with no visibility</li><li>Building on shaky ground</li></ul></div>
      </div>
    </div>
  </div>

  <div class="option" data-choice="parallel" onclick="toggleSelect(this)">
    <div class="letter">C</div>
    <div class="content">
      <h3>Parallel Streams</h3>
      <p>Quick UX wins (sync status banner, last-refreshed timestamps) ship immediately. Matchup feature is built alongside ongoing code quality improvements woven into each area as it's touched.</p>
      <div class="pros-cons" style="margin-top:12px">
        <div class="pros"><h4>Pros</h4><ul><li>Visible progress fast</li><li>Data transparency arrives before matchup feature</li></ul></div>
        <div class="cons"><h4>Cons</h4><ul><li>More context-switching</li><li>Code quality improvements are piecemeal</li></ul></div>
      </div>
    </div>
  </div>
</div>
```

## File: .superpowers/brainstorm/904-1775466494/content/design-section1-sync.html
```html
<h2>Section 1 — Data Transparency & Sync Status</h2>
<p class="subtitle">Every page should answer: <em>how fresh is this data, and did it load cleanly?</em></p>

<div class="section">
  <h3>1a · Global Sync Status Bar</h3>
  <p>A persistent indicator in the sidebar or header shows the last successful sync time and a colour-coded health dot for each data source.</p>
  <div class="mockup" style="margin-top:10px">
    <div class="mockup-header">Sidebar — bottom section</div>
    <div class="mockup-body" style="font-size:13px;padding:12px 16px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block"></span>
          <span><strong>Untapped.gg</strong> — synced 14 min ago</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block"></span>
          <span><strong>YGOProDeck</strong> — synced 2 hrs ago</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;display:inline-block"></span>
          <span><strong>MDM Tournaments</strong> — partial (3/5 events loaded)</span>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="section">
  <h3>1b · Per-Page Staleness Indicator</h3>
  <p>Each data-heavy page shows a small timestamp + freshness badge near the title. Goes amber if data is &gt;2 hrs old, red if &gt;12 hrs.</p>
  <div class="mockup" style="margin-top:10px">
    <div class="mockup-header">Dashboard — page header</div>
    <div class="mockup-body" style="padding:12px 16px;display:flex;align-items:center;gap:16px">
      <span style="font-size:18px;font-weight:600">Meta Dashboard</span>
      <span style="font-size:11px;background:#166534;color:#bbf7d0;padding:3px 8px;border-radius:12px">● Fresh — 14 min ago</span>
    </div>
  </div>
</div>

<div class="section">
  <h3>1c · Partial-Failure Banner</h3>
  <p>When a sync completes but one source failed or returned incomplete data, a dismissible warning appears at the top of the page — not a full error, just a notice.</p>
  <div class="mockup" style="margin-top:10px">
    <div class="mockup-header">Page-level warning banner</div>
    <div class="mockup-body" style="padding:10px 16px;background:#451a03;color:#fed7aa;font-size:13px;border-left:3px solid #f59e0b">
      ⚠ MDM tournament data is incomplete — 3 of 5 recent events loaded. Some matchup stats may not reflect the full picture. <span style="text-decoration:underline;cursor:pointer">Retry sync</span>
    </div>
  </div>
</div>

<p style="margin-top:16px"><strong>Backend change needed:</strong> the sync service will track per-source status (success / partial / failed) and timestamps in the database, exposed via a new <code>GET /api/sync/status</code> endpoint the frontend polls on mount.</p>

<p style="margin-top:8px">Does this section look right so far?</p>
```

## File: .superpowers/brainstorm/904-1775466494/content/design-section2-quality.html
```html
<h2>Section 2 — Code Quality Foundations</h2>
<p class="subtitle">Targeted fixes that make the app more reliable and easier to build on — not a full rewrite.</p>

<div class="section">
  <h3>2a · Replace Silent Error Catches</h3>
  <p>Several components currently have <code>.catch(() => {})</code> — errors disappear silently. Replace with proper error state that surfaces a message to the user via the existing <code>ErrorBanner</code> component.</p>
  <div class="mockup" style="margin-top:8px">
    <div class="mockup-header">Before → After</div>
    <div class="mockup-body" style="padding:12px 16px;font-size:12px;font-family:monospace">
      <div style="color:#f87171">// Before<br>fetchDecks().catch(() => {})</div>
      <div style="margin-top:8px;color:#86efac">// After<br>fetchDecks().catch((err) => setError(err.message))<br>// + &lt;ErrorBanner&gt; rendered when error state is set</div>
    </div>
  </div>
</div>

<div class="section">
  <h3>2b · API Service Layer</h3>
  <p>Components currently call Axios directly. Extract calls into the existing <code>api/</code> directory pattern (like <code>api/cards.ts</code> and <code>api/meta.ts</code>) so components stay thin and API shape changes only need fixing in one place.</p>
  <p style="margin-top:6px">Files to add: <code>api/matchups.ts</code>, <code>api/sync.ts</code>, <code>api/tournaments.ts</code></p>
</div>

<div class="section">
  <h3>2c · Request Cancellation</h3>
  <p>Add <code>AbortController</code> to <code>useEffect</code> data-fetch hooks so in-flight requests are cancelled when a component unmounts. Prevents state updates on unmounted components (a common React warning in this codebase).</p>
</div>

<div class="section">
  <h3>2d · Targeted Tests for Critical Paths</h3>
  <p>No tests currently exist. Rather than broad coverage, focus on the highest-value areas:</p>
  <ul style="margin-top:6px;padding-left:20px;line-height:1.8">
    <li>Sync status logic (is data fresh? partial failure detection)</li>
    <li>Matchup blending calculation (Untapped + tournament merge)</li>
    <li>Fuzzy deck matching utility (already complex, already in the codebase)</li>
  </ul>
  <p style="margin-top:6px">Using Vitest — already compatible with the Vite setup, zero extra config needed.</p>
</div>

<p style="margin-top:16px">Does this section look right?</p>
```

## File: .superpowers/brainstorm/904-1775466494/content/design-section3-matchups.html
```html
<h2>Section 3 — Matchup Intelligence</h2>
<p class="subtitle">Built on the reliable foundation from sections 1 & 2.</p>

<div class="section">
  <h3>3a · Matchup Matrix (heatmap)</h3>
  <p>The existing <code>/matchups</code> page gets a full deck-vs-deck heatmap. Green = favourable, red = unfavourable, grey = insufficient data. Hover a cell to see the sample size and source breakdown.</p>
  <div class="mockup" style="margin-top:10px">
    <div class="mockup-header">Matchup Matrix — /matchups</div>
    <div class="mockup-body" style="padding:16px;overflow-x:auto">
      <table style="border-collapse:collapse;font-size:11px;width:100%">
        <thead>
          <tr>
            <th style="padding:4px 8px;text-align:left;color:#9ca3af">vs →</th>
            <th style="padding:4px 8px;color:#9ca3af">Snake-Eye</th>
            <th style="padding:4px 8px;color:#9ca3af">Yubel</th>
            <th style="padding:4px 8px;color:#9ca3af">Tenpai</th>
            <th style="padding:4px 8px;color:#9ca3af">Branded</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:4px 8px;font-weight:600">Snake-Eye</td>
            <td style="padding:4px 8px;background:#374151;text-align:center;border-radius:4px">—</td>
            <td style="padding:4px 8px;background:#166534;color:#bbf7d0;text-align:center;border-radius:4px">58%</td>
            <td style="padding:4px 8px;background:#7f1d1d;color:#fecaca;text-align:center;border-radius:4px">43%</td>
            <td style="padding:4px 8px;background:#166534;color:#bbf7d0;text-align:center;border-radius:4px">61%</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;font-weight:600">Yubel</td>
            <td style="padding:4px 8px;background:#7f1d1d;color:#fecaca;text-align:center;border-radius:4px">42%</td>
            <td style="padding:4px 8px;background:#374151;text-align:center;border-radius:4px">—</td>
            <td style="padding:4px 8px;background:#166534;color:#bbf7d0;text-align:center;border-radius:4px">55%</td>
            <td style="padding:4px 8px;background:#713f12;color:#fef08a;text-align:center;border-radius:4px">50%</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;font-weight:600">Tenpai</td>
            <td style="padding:4px 8px;background:#166534;color:#bbf7d0;text-align:center;border-radius:4px">57%</td>
            <td style="padding:4px 8px;background:#7f1d1d;color:#fecaca;text-align:center;border-radius:4px">45%</td>
            <td style="padding:4px 8px;background:#374151;text-align:center;border-radius:4px">—</td>
            <td style="padding:4px 8px;background:#166534;color:#bbf7d0;text-align:center;border-radius:4px">63%</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;font-weight:600">Branded</td>
            <td style="padding:4px 8px;background:#7f1d1d;color:#fecaca;text-align:center;border-radius:4px">39%</td>
            <td style="padding:4px 8px;background:#713f12;color:#fef08a;text-align:center;border-radius:4px">50%</td>
            <td style="padding:4px 8px;background:#7f1d1d;color:#fecaca;text-align:center;border-radius:4px">37%</td>
            <td style="padding:4px 8px;background:#374151;text-align:center;border-radius:4px">—</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:11px;color:#6b7280;margin-top:8px">Hover a cell to see: Untapped sample (n=1,240) · Tournament sample (n=87) · Confidence</p>
    </div>
  </div>
</div>

<div class="section">
  <h3>3b · Tournament Meta Advisor</h3>
  <p>A new panel (on the matchups page or dashboard) where you select your deck and see a breakdown of the expected field based on recent tournament top cuts — plus your predicted win rate against each expected opponent.</p>
  <div class="mockup" style="margin-top:10px">
    <div class="mockup-header">Meta Advisor panel</div>
    <div class="mockup-body" style="padding:14px 16px;font-size:13px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="color:#9ca3af">I'm playing:</span>
        <span style="background:#1e3a5f;color:#93c5fd;padding:4px 12px;border-radius:8px;font-weight:600">Snake-Eye ▾</span>
        <span style="color:#9ca3af;font-size:11px">based on last 3 tournaments</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#1f2937;border-radius:6px">
          <span>Tenpai Dragon <span style="color:#9ca3af;font-size:11px">(28% of field)</span></span>
          <span style="color:#fca5a5;font-weight:600">43% win rate ⚠</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#1f2937;border-radius:6px">
          <span>Yubel <span style="color:#9ca3af;font-size:11px">(22% of field)</span></span>
          <span style="color:#86efac;font-weight:600">58% win rate ✓</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#1f2937;border-radius:6px">
          <span>Branded <span style="color:#9ca3af;font-size:11px">(18% of field)</span></span>
          <span style="color:#86efac;font-weight:600">61% win rate ✓</span>
        </div>
        <div style="margin-top:8px;padding:8px 10px;background:#172554;border-radius:6px;border-left:3px solid #3b82f6;font-size:12px">
          <strong>Expected weighted win rate: 54%</strong> — favourable field. Watch out for Tenpai (nearly 1-in-3 matches).
        </div>
      </div>
    </div>
  </div>
</div>

<div class="section">
  <h3>3c · Blended Data Toggle</h3>
  <p>A toggle on the matrix lets you switch between three views: <strong>Untapped only</strong> (large sample, all levels of play), <strong>Tournament only</strong> (competitive top-cut data), and <strong>Blended</strong> (weighted average, default). Each cell shows the confidence level based on available sample size.</p>
</div>

<div class="section">
  <h3>Backend work required</h3>
  <ul style="padding-left:20px;line-height:1.9;font-size:13px">
    <li>New <code>matchup_results</code> table storing per-pairing win counts from tournament data</li>
    <li><code>GET /api/matchups/matrix</code> — returns full NxN matrix with both source values</li>
    <li><code>GET /api/matchups/advisor?deck=snake-eye</code> — returns field composition + matchup rates</li>
    <li>Blending logic: weighted average (70% Untapped / 30% tournament by default, adjustable)</li>
  </ul>
</div>

<p style="margin-top:12px">Does this section look right?</p>
```

## File: .superpowers/brainstorm/904-1775466494/content/design-section3-v2.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Section 3 — Matchup Intelligence</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #09090b;
    color: #eceef4;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    padding: 32px;
    background-image:
      radial-gradient(at 15% 30%, rgba(74,142,255,0.03) 0%, transparent 40%),
      radial-gradient(at 85% 80%, rgba(212,175,55,0.03) 0%, transparent 40%);
  }

  h2 { font-size: 20px; font-weight: 700; color: #eceef4; margin-bottom: 4px; }
  .subtitle { color: #71717a; font-size: 13px; margin-bottom: 28px; }
  h3 { font-size: 13px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }

  .section { margin-bottom: 28px; }

  /* Surface cards */
  .surface {
    background: #111113;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.25);
  }
  .surface-alt {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 12px 16px;
  }

  /* Toggle buttons */
  .toggle-group { display: flex; gap: 4px; margin-bottom: 16px; }
  .toggle-btn {
    padding: 5px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid #27272a;
    background: transparent;
    color: #71717a;
  }
  .toggle-btn.active {
    background: rgba(74,142,255,0.15);
    border-color: rgba(74,142,255,0.4);
    color: #6ba3ff;
  }

  /* Matrix table */
  .matrix-wrap { overflow-x: auto; }
  table { border-collapse: separate; border-spacing: 3px; width: 100%; }
  th { font-size: 11px; color: #71717a; font-weight: 500; padding: 4px 8px; text-align: center; }
  th.row-label { text-align: left; }
  td { padding: 6px 10px; border-radius: 6px; text-align: center; font-size: 12px; font-weight: 600; min-width: 60px; }
  td.deck-label { text-align: left; font-size: 12px; font-weight: 500; color: #a1a1aa; padding-left: 0; background: transparent !important; }
  .cell-neutral { background: #18181b; color: #3f3f46; }
  .cell-win     { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }
  .cell-loss    { background: rgba(255,77,94,0.15);  color: #ff4d5e; border: 1px solid rgba(255,77,94,0.2); }
  .cell-even    { background: rgba(255,145,71,0.12); color: #ff9147; border: 1px solid rgba(255,145,71,0.2); }
  .cell-hint { font-size: 10px; color: #71717a; margin-top: 8px; }

  /* Advisor */
  .deck-select {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(74,142,255,0.1); border: 1px solid rgba(74,142,255,0.25);
    color: #6ba3ff; border-radius: 8px; padding: 6px 14px;
    font-weight: 600; font-size: 13px; cursor: pointer; margin-bottom: 16px;
  }
  .matchup-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; background: #18181b; border: 1px solid #27272a;
    border-radius: 8px; margin-bottom: 6px;
  }
  .matchup-row:hover { border-color: #3f3f46; }
  .deck-name { font-weight: 500; font-size: 13px; }
  .field-pct { font-size: 11px; color: #71717a; margin-left: 6px; }
  .win-rate-good { color: #34d399; font-weight: 700; font-size: 13px; }
  .win-rate-bad  { color: #ff4d5e; font-weight: 700; font-size: 13px; }
  .win-rate-even { color: #ff9147; font-weight: 700; font-size: 13px; }

  .summary-box {
    background: rgba(74,142,255,0.07);
    border: 1px solid rgba(74,142,255,0.2);
    border-radius: 8px; padding: 12px 14px;
    margin-top: 10px; font-size: 13px;
  }
  .summary-box strong { color: #6ba3ff; }

  /* Sync freshness badge */
  .badge-fresh {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2);
    color: #34d399; border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 500;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; }

  .label { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; }

  /* Section separator */
  .sep { border: none; border-top: 1px solid #27272a; margin: 28px 0; }
</style>
</head>
<body>

<h2>Section 3 — Matchup Intelligence</h2>
<p class="subtitle">Built on the reliable foundation from sections 1 &amp; 2. All mockups use the app's actual colour system.</p>

<!-- MATRIX -->
<div class="section">
  <h3>3a · Matchup Matrix</h3>
  <div class="surface">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="font-weight:600;font-size:15px">Deck Matchup Matrix</span>
      <span class="badge-fresh"><span class="dot"></span> Synced 14 min ago</span>
    </div>

    <div class="toggle-group">
      <button class="toggle-btn active">Blended</button>
      <button class="toggle-btn">Untapped.gg</button>
      <button class="toggle-btn">Tournament</button>
    </div>

    <div class="matrix-wrap">
      <table>
        <thead>
          <tr>
            <th class="row-label">vs →</th>
            <th>Snake-Eye</th>
            <th>Yubel</th>
            <th>Tenpai</th>
            <th>Branded</th>
            <th>Fiendsmith</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="deck-label">Snake-Eye</td>
            <td class="cell-neutral">—</td>
            <td class="cell-win">58%</td>
            <td class="cell-loss">43%</td>
            <td class="cell-win">61%</td>
            <td class="cell-win">55%</td>
          </tr>
          <tr>
            <td class="deck-label">Yubel</td>
            <td class="cell-loss">42%</td>
            <td class="cell-neutral">—</td>
            <td class="cell-win">55%</td>
            <td class="cell-even">50%</td>
            <td class="cell-loss">44%</td>
          </tr>
          <tr>
            <td class="deck-label">Tenpai</td>
            <td class="cell-win">57%</td>
            <td class="cell-loss">45%</td>
            <td class="cell-neutral">—</td>
            <td class="cell-win">63%</td>
            <td class="cell-win">59%</td>
          </tr>
          <tr>
            <td class="deck-label">Branded</td>
            <td class="cell-loss">39%</td>
            <td class="cell-even">50%</td>
            <td class="cell-loss">37%</td>
            <td class="cell-neutral">—</td>
            <td class="cell-loss">46%</td>
          </tr>
          <tr>
            <td class="deck-label">Fiendsmith</td>
            <td class="cell-loss">45%</td>
            <td class="cell-win">56%</td>
            <td class="cell-loss">41%</td>
            <td class="cell-win">54%</td>
            <td class="cell-neutral">—</td>
          </tr>
        </tbody>
      </table>
      <p class="cell-hint">Hover a cell to see sample sizes and per-source breakdown. Grey cells = insufficient data.</p>
    </div>
  </div>
</div>

<hr class="sep">

<!-- META ADVISOR -->
<div class="section">
  <h3>3b · Tournament Meta Advisor</h3>
  <div class="surface">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-weight:600;font-size:15px">Meta Advisor</span>
      <span class="label">Based on last 3 tournaments</span>
    </div>
    <p style="color:#71717a;font-size:12px;margin-bottom:16px">Select your deck to see how you fare against the expected field.</p>

    <div class="deck-select">Snake-Eye Fire King ▾</div>

    <div class="matchup-row">
      <span><span class="deck-name">Tenpai Dragon</span><span class="field-pct">28% of field</span></span>
      <span class="win-rate-bad">43% ⚠</span>
    </div>
    <div class="matchup-row">
      <span><span class="deck-name">Yubel</span><span class="field-pct">22% of field</span></span>
      <span class="win-rate-good">58% ✓</span>
    </div>
    <div class="matchup-row">
      <span><span class="deck-name">Branded Despia</span><span class="field-pct">18% of field</span></span>
      <span class="win-rate-good">61% ✓</span>
    </div>
    <div class="matchup-row">
      <span><span class="deck-name">Fiendsmith</span><span class="field-pct">15% of field</span></span>
      <span class="win-rate-good">55% ✓</span>
    </div>
    <div class="matchup-row">
      <span><span class="deck-name">Labrynth</span><span class="field-pct">10% of field</span></span>
      <span class="win-rate-even">50% ~</span>
    </div>

    <div class="summary-box">
      <strong>Expected weighted win rate: 54%</strong> — favourable field overall.<br>
      <span style="color:#a1a1aa;font-size:12px">Watch out for Tenpai (nearly 1 in 3 matches). Consider side deck tech.</span>
    </div>
  </div>
</div>

</body>
</html>
```

## File: .superpowers/brainstorm/904-1775466494/content/focus-areas.html
```html
<h2>Where do you want to focus improvements?</h2>
<p class="subtitle">MD Meta App — Yu-Gi-Oh! Analytics Platform. Select all areas that interest you.</p>

<div class="options" data-multiselect>
  <div class="option" data-choice="ux" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>User Experience & Visual Polish</h3>
      <p>Better loading states, error feedback, responsive/mobile layout, animations, overall look &amp; feel improvements</p>
    </div>
  </div>
  <div class="option" data-choice="features" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>New Features</h3>
      <p>Expand functionality — e.g. deck comparison, player tracking, advanced filters, favorites, notifications</p>
    </div>
  </div>
  <div class="option" data-choice="performance" onclick="toggleSelect(this)">
    <div class="letter">C</div>
    <div class="content">
      <h3>Performance & Reliability</h3>
      <p>Faster loads, smarter caching, request cancellation on unmount, reduced re-renders, optimistic updates</p>
    </div>
  </div>
  <div class="option" data-choice="code-quality" onclick="toggleSelect(this)">
    <div class="letter">D</div>
    <div class="content">
      <h3>Code Quality & Architecture</h3>
      <p>Add tests, fix silent error catches, introduce global state (Zustand/Context), cleaner API layer, type safety improvements</p>
    </div>
  </div>
</div>
```

## File: .superpowers/brainstorm/904-1775466494/content/text-size-compare.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Text Size Comparison</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #09090b;
    color: #eceef4;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    padding: 32px;
    background-image:
      radial-gradient(at 15% 30%, rgba(74,142,255,0.03) 0%, transparent 40%),
      radial-gradient(at 85% 80%, rgba(212,175,55,0.03) 0%, transparent 40%);
  }
  h2 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { color: #71717a; font-size: 13px; margin-bottom: 28px; }

  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .panel { background: #111113; border: 1px solid #27272a; border-radius: 12px; padding: 20px; }
  .panel-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: #71717a; margin-bottom: 16px; font-weight: 600;
  }

  /* BEFORE — current approximate sizes */
  .before .page-title    { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .before .page-sub      { font-size: 12px; color: #71717a; margin-bottom: 16px; }
  .before .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #a1a1aa; font-weight: 600; margin-bottom: 8px; }
  .before .body-text     { font-size: 13px; color: #a1a1aa; line-height: 1.6; margin-bottom: 12px; }
  .before .data-value    { font-size: 22px; font-weight: 700; color: #34d399; }
  .before .data-label    { font-size: 11px; color: #71717a; margin-top: 2px; }
  .before .row           { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; margin-bottom: 6px; }
  .before .row-name      { font-size: 13px; font-weight: 500; }
  .before .row-stat      { font-size: 12px; color: #34d399; font-weight: 600; }
  .before .badge         { font-size: 11px; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2); color: #34d399; border-radius: 20px; padding: 2px 8px; }

  /* AFTER — 30% larger (multiply font sizes by 1.3) */
  .after .page-title    { font-size: 26px; font-weight: 700; margin-bottom: 4px; }
  .after .page-sub      { font-size: 15px; color: #71717a; margin-bottom: 16px; }
  .after .section-label { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #a1a1aa; font-weight: 600; margin-bottom: 8px; }
  .after .body-text     { font-size: 17px; color: #a1a1aa; line-height: 1.6; margin-bottom: 12px; }
  .after .data-value    { font-size: 29px; font-weight: 700; color: #34d399; }
  .after .data-label    { font-size: 14px; color: #71717a; margin-top: 2px; }
  .after .row           { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; margin-bottom: 6px; }
  .after .row-name      { font-size: 17px; font-weight: 500; }
  .after .row-stat      { font-size: 15px; color: #34d399; font-weight: 600; }
  .after .badge         { font-size: 14px; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2); color: #34d399; border-radius: 20px; padding: 3px 10px; }

  .tier-badge-before { display:inline-block; padding: 2px 8px; border-radius:4px; font-size: 11px; font-weight:700; background:rgba(255,45,85,0.15); color:#ff2d55; border:1px solid rgba(255,45,85,0.3); }
  .tier-badge-after  { display:inline-block; padding: 3px 10px; border-radius:4px; font-size: 14px; font-weight:700; background:rgba(255,45,85,0.15); color:#ff2d55; border:1px solid rgba(255,45,85,0.3); }
</style>
</head>
<body>

<h2>Text Size — Before vs After (+30%)</h2>
<p class="subtitle">Showing the same dashboard content at current size and at ×1.3. Same layout, same components.</p>

<div class="split">
  <!-- BEFORE -->
  <div class="panel before">
    <div class="panel-label">Current</div>
    <div class="page-title">Meta Dashboard</div>
    <div class="page-sub">Updated 14 min ago · <span class="badge">● Fresh</span></div>
    <div class="section-label">Top Archetypes</div>
    <div class="body-text">Showing Tier 1 &amp; 2 decks from the last 7 days of tournament data.</div>

    <div class="row">
      <span>
        <span class="row-name">Snake-Eye Fire King</span>
        <span class="tier-badge-before" style="margin-left:6px">T1</span>
      </span>
      <span class="row-stat">58.4% WR</span>
    </div>
    <div class="row">
      <span>
        <span class="row-name">Tenpai Dragon</span>
        <span class="tier-badge-before" style="margin-left:6px">T1</span>
      </span>
      <span class="row-stat">56.1% WR</span>
    </div>
    <div class="row">
      <span>
        <span class="row-name">Yubel</span>
        <span class="tier-badge-before" style="margin-left:6px;background:rgba(255,140,56,0.15);color:#ff8c38;border-color:rgba(255,140,56,0.3)">T2</span>
      </span>
      <span class="row-stat" style="color:#a1a1aa">52.0% WR</span>
    </div>

    <div style="margin-top:16px;display:flex;gap:16px">
      <div>
        <div class="data-value">312</div>
        <div class="data-label">Tournaments tracked</div>
      </div>
      <div>
        <div class="data-value" style="color:#4a8eff">14</div>
        <div class="data-label">Archetypes in meta</div>
      </div>
    </div>
  </div>

  <!-- AFTER -->
  <div class="panel after">
    <div class="panel-label">+30% text size</div>
    <div class="page-title">Meta Dashboard</div>
    <div class="page-sub">Updated 14 min ago · <span class="badge">● Fresh</span></div>
    <div class="section-label">Top Archetypes</div>
    <div class="body-text">Showing Tier 1 &amp; 2 decks from the last 7 days of tournament data.</div>

    <div class="row">
      <span>
        <span class="row-name">Snake-Eye Fire King</span>
        <span class="tier-badge-after" style="margin-left:6px">T1</span>
      </span>
      <span class="row-stat">58.4% WR</span>
    </div>
    <div class="row">
      <span>
        <span class="row-name">Tenpai Dragon</span>
        <span class="tier-badge-after" style="margin-left:6px">T1</span>
      </span>
      <span class="row-stat">56.1% WR</span>
    </div>
    <div class="row">
      <span>
        <span class="row-name">Yubel</span>
        <span class="tier-badge-after" style="margin-left:6px;background:rgba(255,140,56,0.15);color:#ff8c38;border-color:rgba(255,140,56,0.3)">T2</span>
      </span>
      <span class="row-stat" style="color:#a1a1aa">52.0% WR</span>
    </div>

    <div style="margin-top:16px;display:flex;gap:20px">
      <div>
        <div class="data-value">312</div>
        <div class="data-label">Tournaments tracked</div>
      </div>
      <div>
        <div class="data-value" style="color:#4a8eff">14</div>
        <div class="data-label">Archetypes in meta</div>
      </div>
    </div>
  </div>
</div>

</body>
</html>
```

## File: .superpowers/brainstorm/904-1775466494/content/waiting-1.html
```html
<div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
  <p class="subtitle">Continuing in terminal...</p>
</div>
```

## File: .superpowers/brainstorm/904-1775466494/content/waiting-2.html
```html
<div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
  <p class="subtitle">Writing design doc — continuing in terminal...</p>
</div>
```

## File: .superpowers/brainstorm/904-1775466494/state/server-stopped
```
{"reason":"idle timeout","timestamp":1775469734590}
```

## File: .superpowers/brainstorm/904-1775466494/state/server.pid
```
904
```

## File: client/.env.example
```
# Backend API URL (leave empty for local dev with Vite proxy)
# Set this in Vercel to your Render backend URL
VITE_API_URL=
```

## File: client/index.html
```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MD Meta - Yu-Gi-Oh! Master Duel Meta Analysis</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-md-bg text-md-text">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## File: client/postcss.config.js
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

## File: client/public/favicon.svg
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#131829"/>
  <text x="16" y="22" font-size="18" text-anchor="middle" fill="#c9a84c" font-family="Arial" font-weight="bold">MD</text>
</svg>
```

## File: client/src/api/sync.ts
```typescript
import api from './client';

export interface SyncRecord {
  source: 'ygoprodeck' | 'mdm_deck_types' | 'mdm_tournaments' | 'untapped';
  status: 'success' | 'partial' | 'failed';
  detail: string | null;
  synced_at: number; // unix timestamp
}

export async function getSyncStatus(): Promise<SyncRecord[]> {
  const res = await api.get('/sync/status');
  return res.data;
}
```

## File: client/src/api/tournaments.ts
```typescript
import api from './client';
import type { Tournament, TournamentResult } from '../types/meta';

export async function getTournaments(): Promise<Tournament[]> {
  const res = await api.get('/tournaments');
  return res.data;
}

export async function getTournament(id: string): Promise<Tournament> {
  const res = await api.get(`/tournaments/${id}`);
  return res.data;
}

export async function getRecentTournamentResults(): Promise<TournamentResult[]> {
  const res = await api.get('/tournaments/recent-results');
  return res.data;
}
```

## File: client/src/components/common/ErrorBanner.tsx
```typescript
export default function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-md-red/10 border border-md-red/30 rounded-lg p-4 flex items-center justify-between">
      <span className="text-md-red">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1 bg-md-red/20 hover:bg-md-red/30 rounded text-sm transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}
```

## File: client/src/components/common/NegateImpact.tsx
```typescript
import type { Card } from '../../types/card';

interface NegateImpactProps {
  card: Card;
  compact?: boolean;
}

function impactLabel(value: number): { label: string; color: string } {
  if (value > 8) return { label: 'High', color: 'text-md-red' };
  if (value > 4) return { label: 'Medium', color: 'text-md-orange' };
  if (value > 2) return { label: 'Low', color: 'text-yellow-400' };
  return { label: 'Minimal', color: 'text-md-textMuted' };
}

function barColor(value: number): string {
  if (value > 8) return 'from-red-500 to-red-600';
  if (value > 4) return 'from-orange-500 to-orange-600';
  if (value > 2) return 'from-yellow-500 to-yellow-600';
  return 'from-gray-500 to-gray-600';
}

export default function NegateImpact({ card, compact = false }: NegateImpactProps) {
  const eff = card.negate_effectiveness;
  if (eff == null || eff <= 0) return null;

  const { label, color } = impactLabel(eff);
  const barWidth = Math.min(100, Math.max(5, (eff / 12) * 100));

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-md-textMuted">Negate:</span>
        <span className={`font-semibold ${color}`}>{label}</span>
        <span className="text-md-textMuted">+{eff.toFixed(1)}%</span>
      </div>
    );
  }

  return (
    <div className="bg-md-surfaceAlt border border-md-border/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-md-textMuted font-medium">Negate Impact</span>
        <span className={`text-sm font-bold ${color}`}>{label}</span>
      </div>

      {/* Impact bar */}
      <div className="h-1.5 bg-md-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor(eff)} transition-all duration-500`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Win rate stats */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {card.negated_win_rate != null && (
          <div>
            <p className="text-[10px] text-md-textMuted">Negated WR</p>
            <p className="text-sm font-semibold text-md-red">{card.negated_win_rate.toFixed(1)}%</p>
          </div>
        )}
        {card.not_negated_win_rate != null && (
          <div>
            <p className="text-[10px] text-md-textMuted">Not Negated WR</p>
            <p className="text-sm font-semibold text-md-green">{card.not_negated_win_rate.toFixed(1)}%</p>
          </div>
        )}
      </div>

      {/* Sample size */}
      {card.negate_sample_size != null && card.negate_sample_size > 0 && (
        <p className="text-[10px] text-md-textMuted">
          Appeared in {card.negate_sample_size.toLocaleString()} games
        </p>
      )}
    </div>
  );
}
```

## File: client/src/hooks/useDebounce.ts
```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

## File: client/src/main.tsx
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

## File: client/src/test/matchupBlend.test.ts
```typescript
import { describe, it, expect } from 'vitest';
import { blendMatchupRates } from '../utils/matchupBlend';

describe('blendMatchupRates', () => {
  it('returns 0.5 with low confidence when no data', () => {
    const result = blendMatchupRates(null, null);
    expect(result.rate).toBe(0.5);
    expect(result.confidence).toBe('low');
  });

  it('returns untapped rate alone when no tournament data', () => {
    const result = blendMatchupRates({ rate: 0.6, n: 200 }, null);
    expect(result.rate).toBe(0.6);
    expect(result.confidence).toBe('high');
  });

  it('returns medium confidence for small untapped sample', () => {
    const result = blendMatchupRates({ rate: 0.6, n: 50 }, null);
    expect(result.rate).toBe(0.6);
    expect(result.confidence).toBe('medium');
  });

  it('returns tournament rate alone when no untapped data', () => {
    const result = blendMatchupRates(null, { rate: 0.55, n: 40 });
    expect(result.rate).toBe(0.55);
    expect(result.confidence).toBe('medium');
  });

  it('marks low confidence for small tournament sample', () => {
    const result = blendMatchupRates(null, { rate: 0.55, n: 10 });
    expect(result.confidence).toBe('low');
  });

  it('blends 70/30 when both sources present', () => {
    const result = blendMatchupRates({ rate: 0.6, n: 200 }, { rate: 0.4, n: 50 });
    expect(result.rate).toBeCloseTo(0.54); // 0.6*0.7 + 0.4*0.3
    expect(result.confidence).toBe('high');
  });
});
```

## File: client/src/test/syncFreshness.test.ts
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeFreshness } from '../utils/syncFreshness';

const NOW = 1700000000;

afterEach(() => vi.restoreAllMocks());

function makeRecord(overrides: Partial<{ status: string; synced_at: number }>) {
  return { status: 'success', synced_at: NOW - 60, ...overrides };
}

describe('computeFreshness', () => {
  it('returns fresh when synced 1 minute ago', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ synced_at: NOW - 60 }))).toBe('fresh');
  });

  it('returns stale when synced 3 hours ago', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ synced_at: NOW - 3 * 3600 }))).toBe('stale');
  });

  it('returns outdated when synced 13 hours ago', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ synced_at: NOW - 13 * 3600 }))).toBe('outdated');
  });

  it('returns failed regardless of age when status is failed', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ status: 'failed', synced_at: NOW - 60 }))).toBe('failed');
  });
});
```

## File: client/src/utils/matchupBlend.ts
```typescript
export interface MatchupSource {
  rate: number;
  n: number;
}

export interface BlendResult {
  rate: number;
  confidence: 'high' | 'medium' | 'low';
}

export function blendMatchupRates(
  untapped: MatchupSource | null,
  tournament: MatchupSource | null,
  weights = { untapped: 0.7, tournament: 0.3 }
): BlendResult {
  if (!untapped && !tournament) return { rate: 0.5, confidence: 'low' };
  if (!untapped) return { rate: tournament!.rate, confidence: tournament!.n >= 30 ? 'medium' : 'low' };
  if (!tournament) return { rate: untapped.rate, confidence: untapped.n >= 100 ? 'high' : 'medium' };
  const rate = untapped.rate * weights.untapped + tournament.rate * weights.tournament;
  return { rate, confidence: 'high' };
}
```

## File: client/src/utils/syncFreshness.ts
```typescript
export type Freshness = 'fresh' | 'stale' | 'outdated' | 'failed';

// SyncRecord shape inline to avoid circular import
interface MinimalSyncRecord {
  status: string;
  synced_at: number;
}

export function computeFreshness(record: MinimalSyncRecord): Freshness {
  if (record.status === 'failed') return 'failed';
  const ageHrs = (Date.now() / 1000 - record.synced_at) / 3600;
  if (ageHrs > 12) return 'outdated';
  if (ageHrs > 2) return 'stale';
  return 'fresh';
}
```

## File: client/src/vite-env.d.ts
```typescript
/// <reference types="vite/client" />
```

## File: client/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

## File: client/vercel.json
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

## File: client/vite.config.ts
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

## File: package.json
```json
{
  "name": "md-meta-app",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix server\" \"npm run dev --prefix client\"",
    "build": "npm run build --prefix client && npm run build --prefix server",
    "start": "npm start --prefix server"
  },
  "devDependencies": {
    "@types/pg": "^8.20.0",
    "concurrently": "^8.2.2"
  },
  "dependencies": {
    "pg": "^8.20.0"
  }
}
```

## File: server/.env.example
```
# Neon PostgreSQL connection string (use pooled endpoint)
DATABASE_URL=postgresql://user:password@ep-example-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require

# Comma-separated allowed origins for CORS
CORS_ORIGIN=http://localhost:5173

# Port (Render sets this automatically)
PORT=3001
```

## File: server/render.yaml
```yaml
services:
  - type: web
    name: md-meta-server
    runtime: node
    rootDir: server
    buildCommand: npm install && npm run build
    startCommand: node dist/index.js
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: CORS_ORIGIN
        sync: false
      - key: NODE_ENV
        value: production
```

## File: server/src/config.ts
```typescript
export const config = {
  port: parseInt(process.env.PORT || '3001'),
  ygoprodeckBaseUrl: 'https://db.ygoprodeck.com/api/v7',
  mdmBaseUrl: 'https://www.masterduelmeta.com/api/v1',
  mdmSiteUrl: 'https://www.masterduelmeta.com',
  untappedBaseUrl: 'https://ygom.untapped.gg',
  cache: {
    cardsTtl: 86400,       // 24 hours
    tierListTtl: 3600,     // 1 hour
    topDecksTtl: 7200,     // 2 hours
    tournamentsTtl: 7200,  // 2 hours
    matchupsTtl: 14400,    // 4 hours
    banListTtl: 86400,     // 24 hours
    untappedTtl: 10800,    // 3 hours
  },
  rateLimit: {
    ygoprodeckRps: 10,
    mdmDelayMs: 500,
  },
};
```

## File: server/src/services/untappedAuthService.ts
```typescript
import axios from 'axios';

const KEYTAR_SERVICE = 'Untapped Companion';
const TOKEN_URL = 'https://api.ygom.untapped.gg/o/token';
const CLIENT_ID = 'Iin3tp4hpdfUT0DZT0EXX6S0CDPSEqJi1Rl9R0Oc';

let cachedAccessToken: string | null = null;

// Lazy-load keytar (native module) to avoid startup crashes if not installed
let keytarModule: any = null;
async function getKeytar(): Promise<any> {
  if (keytarModule) return keytarModule;
  try {
    const mod = await import('keytar');
    // CJS module via dynamic import wraps exports in .default
    keytarModule = mod.default ?? mod;
    return keytarModule;
  } catch {
    return null;
  }
}

export async function getStoredCredentials(): Promise<{ accessToken?: string; refreshToken?: string } | null> {
  const kt = await getKeytar();
  if (!kt) {
    console.warn('[UntappedAuth] keytar not available — install it with npm install keytar');
    return null;
  }

  try {
    // Companion stores one entry per account (email), with all franchise tokens as nested JSON
    const entries = await kt.findCredentials(KEYTAR_SERVICE);
    if (!entries || entries.length === 0) {
      console.warn('[UntappedAuth] findCredentials returned empty — open the Untapped Companion app and log in first');
      return null;
    }

    const parsed = JSON.parse(entries[0].password);
    const ygom = parsed.ygomOAuthAccessToken;
    if (!ygom) {
      console.warn('[UntappedAuth] ygomOAuthAccessToken not found in stored credentials — log in to YGOM in the Untapped Companion app');
      return null;
    }

    return {
      accessToken: ygom.accessToken ?? undefined,
      refreshToken: ygom.refreshToken ?? undefined,
    };
  } catch (err: any) {
    console.warn('[UntappedAuth] Failed to read credentials from keytar:', err.message);
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const newToken = res.data?.access_token;
    if (!newToken) throw new Error('No access_token in refresh response');
    console.log('[UntappedAuth] Access token refreshed successfully');
    return newToken;
  } catch (err: any) {
    console.warn('[UntappedAuth] Token refresh failed:', err.response?.data ?? err.message);
    return null;
  }
}

/**
 * Returns a valid access token, refreshing if necessary.
 * Returns null if the Untapped Companion is not installed/logged in.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;

  const creds = await getStoredCredentials();
  if (!creds) return null;

  if (creds.accessToken) {
    cachedAccessToken = creds.accessToken;
    return cachedAccessToken;
  }

  if (creds.refreshToken) {
    const fresh = await refreshAccessToken(creds.refreshToken);
    if (fresh) {
      cachedAccessToken = fresh;
      return cachedAccessToken;
    }
  }

  console.warn('[UntappedAuth] No usable token found — companion may need to be re-authenticated');
  return null;
}

/** Clears the cached token so the next call re-reads from keytar or refreshes */
export function invalidateToken(): void {
  cachedAccessToken = null;
}
```

## File: server/src/utils/rateLimiter.ts
```typescript
export class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(
    private maxPerSecond: number,
    private minDelayMs: number = 0
  ) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxPerSecond) {
      this.running++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    setTimeout(() => {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }, this.minDelayMs || (1000 / this.maxPerSecond));
  }

  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
```

## File: server/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

## File: start.bat
```batch
@echo off
cd /d "%~dp0"
npm run dev
```

## File: client/package.json
```json
{
  "name": "md-meta-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "clsx": "^2.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.0",
    "vite": "^5.4.2",
    "vitest": "^4.1.2"
  }
}
```

## File: client/src/api/client.ts
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

export default api;
```

## File: client/src/api/meta.ts
```typescript
import api from './client';
import type { TierList, Matchup, MetaSnapshot, Tournament, TournamentResult, BanListData } from '../types/meta';
import type { DeckType, DeckProfile } from '../types/deck';

export async function getTierList(): Promise<TierList> {
  const res = await api.get('/tier-list');
  return res.data;
}

export async function getDecks(tier?: number): Promise<DeckType[]> {
  const res = await api.get('/decks', { params: tier != null ? { tier } : {} });
  return res.data;
}

export async function getDeckProfile(name: string): Promise<DeckProfile> {
  const res = await api.get(`/decks/${encodeURIComponent(name)}`);
  return res.data;
}

export async function getDeckTopLists(name: string) {
  const res = await api.get(`/decks/${encodeURIComponent(name)}/top-lists`);
  return res.data;
}

export async function getMatchups(deck?: string): Promise<Matchup[]> {
  const res = await api.get('/matchups', { params: deck ? { deck } : {} });
  return res.data;
}

export async function getBanList(): Promise<BanListData> {
  const res = await api.get('/ban-list');
  return res.data;
}

export async function getMetaTrends(): Promise<Record<string, MetaSnapshot[]>> {
  const res = await api.get('/meta-trends');
  return res.data;
}

export async function getDeckTrends(deckName: string): Promise<MetaSnapshot[]> {
  const res = await api.get(`/meta-trends/${encodeURIComponent(deckName)}`);
  return res.data;
}

export async function getTournaments(): Promise<Tournament[]> {
  const res = await api.get('/tournaments');
  return res.data;
}

export async function getTournament(id: string): Promise<Tournament> {
  const res = await api.get(`/tournaments/${id}`);
  return res.data;
}

export async function getRecentTournamentResults(): Promise<TournamentResult[]> {
  const res = await api.get('/tournaments/recent-results');
  return res.data;
}

export async function scoreDeck(main: string[], extra: string[]) {
  const res = await api.post('/deck-builder/score', { main, extra });
  return res.data;
}

export async function validateDeck(main: string[], extra: string[], side: string[]) {
  const res = await api.post('/deck-builder/validate', { main, extra, side });
  return res.data;
}

export async function getFeaturedDecks(): Promise<Array<{
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  cards: Array<{ name: string; image: string | null }>;
}>> {
  const res = await api.get('/decks/featured');
  return res.data;
}

export async function syncAll() {
  const res = await api.post('/sync/all');
  return res.data;
}

export async function syncUntapped() {
  const res = await api.post('/sync/untapped');
  return res.data;
}
```

## File: client/src/App.tsx
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import DeckProfile from './pages/DeckProfile';
import CardSearch from './pages/CardSearch';
import Matchups from './pages/Matchups';
import BanList from './pages/BanList';
import MetaTrends from './pages/MetaTrends';
import Tournaments from './pages/Tournaments';
import DeckBuilder from './pages/DeckBuilder';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-md-bg">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 overflow-x-hidden bg-hero-glow">
            <div className="max-w-[1400px] mx-auto animate-fade-in">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/decks/:name" element={<DeckProfile />} />
                <Route path="/cards" element={<CardSearch />} />
                <Route path="/matchups" element={<Matchups />} />
                <Route path="/ban-list" element={<BanList />} />
                <Route path="/trends" element={<MetaTrends />} />
                <Route path="/tournaments" element={<Tournaments />} />
                <Route path="/deck-builder" element={<DeckBuilder />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
```

## File: client/src/components/common/CardImage.tsx
```typescript
import { useState } from 'react';
import clsx from 'clsx';

interface CardImageProps {
  src: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  rarity?: 'ur' | 'sr' | 'r' | 'n';
  showRarityBorder?: boolean;
}

export default function CardImage({
  src,
  alt,
  size = 'md',
  className,
  onClick,
  rarity,
  showRarityBorder = false
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const sizeClasses = {
    xs: 'w-12 h-18',
    sm: 'w-16 h-24',
    md: 'w-24 h-36',
    lg: 'w-40 h-58'
  };

  const rarityColors = {
    ur: 'border-rarity-ur',
    sr: 'border-rarity-sr',
    r: 'border-rarity-r',
    n: 'border-rarity-n'
  };

  const borderClass = showRarityBorder && rarity
    ? `border-2 ${rarityColors[rarity]} shadow-lg`
    : 'border border-md-border';

  return (
    <div
      className={clsx(
        'relative rounded-lg overflow-hidden bg-gradient-to-br from-md-surface to-md-bg',
        sizeClasses[size],
        borderClass,
        onClick && 'cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-card-hover hover:z-10',
        'group',
        className
      )}
    >
      {src && !error ? (
        <>
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            className={clsx(
              'w-full h-full object-cover transition-all duration-500',
              loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
          <div className="w-8 h-8 rounded-full bg-md-surface border border-md-border flex items-center justify-center mb-2">
            <svg className="w-4 h-4 text-md-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <span className="text-[9px] text-md-textMuted leading-tight">{alt}</span>
        </div>
      )}

      {/* Shine effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
      </div>
    </div>
  );
}
```

## File: client/src/components/common/LoadingSpinner.tsx
```typescript
export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${s} border-2 border-md-border/40 border-t-md-gold rounded-full animate-spin`} />
    </div>
  );
}
```

## File: client/src/components/common/Pagination.tsx
```typescript
import clsx from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  const btnBase = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200';

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} bg-md-surface border border-md-border disabled:opacity-25 hover:bg-md-surfaceHover text-md-textMuted`}
      >
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={clsx(
            btnBase,
            p === page
              ? 'bg-md-blue/15 text-md-blue border border-md-blue/25'
              : 'bg-md-surface border border-md-border text-md-textMuted hover:bg-md-surfaceHover hover:text-md-text'
          )}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} bg-md-surface border border-md-border disabled:opacity-25 hover:bg-md-surfaceHover text-md-textMuted`}
      >
        Next
      </button>
    </div>
  );
}
```

## File: client/src/components/common/SearchInput.tsx
```typescript
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder = 'Search...' }: SearchInputProps) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-md-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-md-bg border border-md-border rounded-lg pl-10 pr-4 py-2 text-sm text-md-text placeholder-md-textMuted/60 focus:outline-none focus:border-md-blue/50 focus:ring-1 focus:ring-md-blue/20 transition-all duration-200"
      />
    </div>
  );
}
```

## File: client/src/components/common/TierBadge.tsx
```typescript
import clsx from 'clsx';

const tierConfig: Record<string, { label: string; bg: string; text: string; border: string; glow: string }> = {
  '0': { label: 'Tier 0', bg: 'bg-tier-0/12', text: 'text-tier-0', border: 'border-tier-0/25', glow: 'tier-glow-0' },
  '1': { label: 'Tier 1', bg: 'bg-tier-1/12', text: 'text-tier-1', border: 'border-tier-1/25', glow: 'tier-glow-1' },
  '2': { label: 'Tier 2', bg: 'bg-tier-2/12', text: 'text-tier-2', border: 'border-tier-2/25', glow: 'tier-glow-2' },
  '3': { label: 'Tier 3', bg: 'bg-tier-3/12', text: 'text-tier-3', border: 'border-tier-3/25', glow: 'tier-glow-3' },
  rogue: { label: 'Rogue', bg: 'bg-tier-rogue/10', text: 'text-tier-rogue', border: 'border-tier-rogue/15', glow: '' },
};

export default function TierBadge({ tier, size = 'md' }: { tier: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const key = tier != null ? String(tier) : 'rogue';
  const cfg = tierConfig[key] || tierConfig.rogue;
  const sizeClass = size === 'sm'
    ? 'text-[10px] px-2 py-0.5'
    : size === 'lg'
    ? 'text-sm px-3 py-1.5'
    : 'text-xs px-2.5 py-1';

  return (
    <span className={clsx(
      'rounded-md font-semibold inline-block border tracking-wide',
      cfg.bg, cfg.text, cfg.border, cfg.glow, sizeClass
    )}>
      {cfg.label}
    </span>
  );
}
```

## File: client/src/components/matchups/EcosystemView.tsx
```typescript
import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { getEcosystemAnalysis } from '../../api/matchups';
import type {
  EcosystemAnalysis,
  DeckEcosystemProfile,
  PredatorPreyRelationship,
  GameTheoryProfile,
  TournamentFieldEntry,
} from '../../types/meta';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import clsx from 'clsx';

// ── Helpers ──

function strengthLabel(s: PredatorPreyRelationship['strength']): string {
  if (s === 'hard_counter') return 'Hard Counter';
  if (s === 'soft_counter') return 'Soft Counter';
  return 'Slight Edge';
}

function strengthColor(s: PredatorPreyRelationship['strength']): string {
  if (s === 'hard_counter') return 'bg-md-red/20 text-md-red border border-md-red/30';
  if (s === 'soft_counter') return 'bg-md-orange/20 text-md-orange border border-md-orange/30';
  return 'bg-md-textMuted/15 text-md-textMuted border border-md-border';
}

function confidenceDot(c: 'high' | 'medium' | 'low'): string {
  if (c === 'high') return 'bg-md-green';
  if (c === 'medium') return 'bg-md-orange';
  return 'bg-md-textMuted';
}

function winRateColor(rate: number): string {
  if (rate >= 0.60) return 'text-md-green';
  if (rate >= 0.55) return 'text-md-green';
  if (rate >= 0.45) return 'text-md-textMuted';
  return 'text-md-red';
}

function metricLabel(value: number, low: string, mid: string, high: string): string {
  if (value >= 0.6) return high;
  if (value >= 0.3) return mid;
  return low;
}

function tierColor(tier: number | null): string {
  if (tier === 0) return '#f59e0b';
  if (tier === 1) return '#3b82f6';
  if (tier === 2) return '#8b5cf6';
  if (tier === 3) return '#6b7280';
  return '#404040';
}

function strategyLabel(s: GameTheoryProfile['strategy_type']): { label: string; color: string } {
  switch (s) {
    case 'dominant': return { label: 'Dominant', color: 'bg-md-green/15 text-md-green border-md-green/30' };
    case 'counter_pick': return { label: 'Counter-Pick', color: 'bg-md-orange/15 text-md-orange border-md-orange/30' };
    case 'generalist': return { label: 'Generalist', color: 'bg-md-blue/15 text-md-blue border-md-blue/30' };
    case 'niche': return { label: 'Niche', color: 'bg-md-purple/15 text-md-purple border-md-purple/30' };
    case 'dominated': return { label: 'Dominated', color: 'bg-md-red/15 text-md-red border-md-red/30' };
  }
}

function nashDeviationLabel(d: number): { label: string; color: string } {
  if (d > 0.3) return { label: 'Overplayed', color: 'text-md-red' };
  if (d > 0.1) return { label: 'Slightly Over', color: 'text-md-orange' };
  if (d < -0.3) return { label: 'Underplayed', color: 'text-md-green' };
  if (d < -0.1) return { label: 'Slightly Under', color: 'text-md-blue' };
  return { label: 'At Equilibrium', color: 'text-md-textMuted' };
}

// ── Sub-components ──

function RelationshipRow({ rel, side }: { rel: PredatorPreyRelationship; side: 'prey' | 'predator' }) {
  const deckName = side === 'prey' ? rel.prey : rel.predator;
  const pct = (rel.win_rate * 100).toFixed(1);

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-md-surfaceHover/40 transition-colors rounded">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${confidenceDot(rel.confidence)}`} title={`${rel.confidence} confidence`} />
        <span className="text-sm font-medium truncate">{deckName}</span>
        {rel.mechanism === 'inferred' && (
          <span className="text-xs italic text-md-textMuted">(inferred)</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${strengthColor(rel.strength)}`}>
          {strengthLabel(rel.strength)}
        </span>
        <span className={`text-sm font-bold tabular-nums ${winRateColor(side === 'prey' ? rel.win_rate : 1 - rel.win_rate)}`}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, subLabel, colorClass }: { label: string; value: string; subLabel?: string; colorClass?: string }) {
  return (
    <div className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border rounded-lg p-3 text-center">
      <div className={clsx('text-lg font-bold tabular-nums', colorClass || 'text-md-text')}>{value}</div>
      <div className="text-xs text-md-textMuted mt-0.5">{label}</div>
      {subLabel && <div className="text-xs text-md-textMuted mt-0.5 italic">{subLabel}</div>}
    </div>
  );
}

// ── Interactive Food Chain SVG ──

interface TooltipData {
  x: number;
  y: number;
  type: 'node' | 'edge';
  deck?: DeckEcosystemProfile;
  relationship?: PredatorPreyRelationship;
}

function FoodChainGraph({
  foodChain,
  profiles,
  selectedDeck,
  onDeckSelect,
}: {
  foodChain: PredatorPreyRelationship[];
  profiles: DeckEcosystemProfile[];
  selectedDeck: string;
  onDeckSelect: (deck: string) => void;
}) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const top = foodChain.slice(0, 15);
  const involvedDecks = useMemo(() => {
    const set = new Set<string>();
    for (const r of top) { set.add(r.predator); set.add(r.prey); }
    return Array.from(set);
  }, [top]);

  const profileMap = useMemo(() => {
    const m: Record<string, DeckEcosystemProfile> = {};
    for (const p of profiles) m[p.deck] = p;
    return m;
  }, [profiles]);

  const width = 650, height = 450;
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(cx, cy) - 70;

  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    involvedDecks.forEach((deck, i) => {
      const angle = (2 * Math.PI * i) / involvedDecks.length - Math.PI / 2;
      pos[deck] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
    return pos;
  }, [involvedDecks, cx, cy, radius]);

  // Which edges connect to hovered/selected node
  const connectedEdges = useMemo(() => {
    const target = hoveredNode || selectedDeck;
    if (!target) return new Set<number>();
    const s = new Set<number>();
    top.forEach((r, i) => {
      if (r.predator === target || r.prey === target) s.add(i);
    });
    return s;
  }, [hoveredNode, selectedDeck, top]);

  const connectedDecks = useMemo(() => {
    const target = hoveredNode || selectedDeck;
    if (!target) return new Set<string>();
    const s = new Set<string>([target]);
    top.forEach((r) => {
      if (r.predator === target) s.add(r.prey);
      if (r.prey === target) s.add(r.predator);
    });
    return s;
  }, [hoveredNode, selectedDeck, top]);

  const handleNodeEnter = useCallback((deck: string, e: React.MouseEvent<SVGElement>) => {
    setHoveredNode(deck);
    const profile = profileMap[deck];
    if (profile) {
      const svgRect = (e.currentTarget.closest('svg') as SVGSVGElement)?.getBoundingClientRect();
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        x: rect.left - (svgRect?.left ?? 0) + rect.width / 2,
        y: rect.top - (svgRect?.top ?? 0) - 8,
        type: 'node',
        deck: profile,
      });
    }
  }, [profileMap]);

  const handleEdgeEnter = useCallback((idx: number, e: React.MouseEvent<SVGElement>) => {
    setHoveredEdge(idx);
    const rel = top[idx];
    if (rel) {
      const svgRect = (e.currentTarget.closest('svg') as SVGSVGElement)?.getBoundingClientRect();
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        x: rect.left - (svgRect?.left ?? 0) + rect.width / 2,
        y: rect.top - (svgRect?.top ?? 0) - 8,
        type: 'edge',
        relationship: rel,
      });
    }
  }, [top]);

  const handleLeave = useCallback(() => {
    setHoveredNode(null);
    setHoveredEdge(null);
    setTooltip(null);
  }, []);

  if (involvedDecks.length === 0) {
    return <p className="text-sm text-md-textMuted text-center py-4">No significant counter relationships found.</p>;
  }

  const hasActiveHighlight = hoveredNode != null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl mx-auto">
        <defs>
          <marker id="arrowRed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#ef4444" />
          </marker>
          <marker id="arrowOrange" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#f97316" />
          </marker>
          <marker id="arrowDim" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#404040" />
          </marker>
        </defs>

        {/* Edges */}
        {top.map((rel, i) => {
          const from = positions[rel.predator];
          const to = positions[rel.prey];
          if (!from || !to) return null;

          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return null;
          const nodeRadius = 22;
          const endX = to.x - (dx / len) * (nodeRadius + 10);
          const endY = to.y - (dy / len) * (nodeRadius + 10);
          const startX = from.x + (dx / len) * (nodeRadius + 2);
          const startY = from.y + (dy / len) * (nodeRadius + 2);

          const isHard = rel.strength === 'hard_counter';
          const thickness = Math.max(1.5, Math.min(5, rel.meta_impact * 300 + 1));
          const isConnected = connectedEdges.has(i);
          const isHoveredEdge = hoveredEdge === i;
          const dimmed = hasActiveHighlight && !isConnected;

          return (
            <g key={`edge-${i}`}>
              {/* Invisible wider hit area for hovering */}
              <line
                x1={startX} y1={startY} x2={endX} y2={endY}
                stroke="transparent"
                strokeWidth={12}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => handleEdgeEnter(i, e)}
                onMouseLeave={handleLeave}
              />
              <line
                x1={startX} y1={startY} x2={endX} y2={endY}
                stroke={dimmed ? '#333' : isHard ? '#ef4444' : '#f97316'}
                strokeWidth={isHoveredEdge ? thickness + 2 : thickness}
                strokeOpacity={dimmed ? 0.2 : isHoveredEdge ? 1 : 0.7}
                markerEnd={dimmed ? 'url(#arrowDim)' : isHard ? 'url(#arrowRed)' : 'url(#arrowOrange)'}
                style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s', pointerEvents: 'none' }}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {involvedDecks.map((deck) => {
          const pos = positions[deck];
          const profile = profileMap[deck];
          const playRate = profile?.play_rate ?? 0;
          const nodeR = Math.max(16, Math.min(30, 16 + playRate * 200));
          const isHovered = hoveredNode === deck;
          const isSelected = selectedDeck === deck;
          const dimmed = hasActiveHighlight && !connectedDecks.has(deck);

          return (
            <g
              key={deck}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              opacity={dimmed ? 0.2 : 1}
              onMouseEnter={(e) => handleNodeEnter(deck, e)}
              onMouseLeave={handleLeave}
              onClick={() => onDeckSelect(deck)}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={pos.x} cy={pos.y} r={nodeR + 5}
                  fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2"
                />
              )}
              {/* Hover glow */}
              {isHovered && (
                <circle
                  cx={pos.x} cy={pos.y} r={nodeR + 3}
                  fill="none" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.5}
                />
              )}
              <circle
                cx={pos.x} cy={pos.y} r={nodeR}
                fill={tierColor(profile?.tier ?? null)}
                fillOpacity={isHovered ? 0.45 : 0.25}
                stroke={tierColor(profile?.tier ?? null)}
                strokeWidth={isHovered || isSelected ? 3 : 2}
              />
              <text
                x={pos.x}
                y={pos.y + nodeR + 14}
                textAnchor="middle"
                fill={dimmed ? '#555' : '#a1a1aa'}
                fontSize="10"
                fontWeight="500"
              >
                {deck.length > 15 ? deck.slice(0, 13) + '\u2026' : deck}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip overlay */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 bg-md-bg border border-md-border rounded-lg shadow-lg p-3 max-w-[220px]"
          style={{
            left: `${Math.min(Math.max(tooltip.x, 110), 540)}px`,
            top: `${tooltip.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.type === 'node' && tooltip.deck && (
            <div className="space-y-1">
              <div className="font-semibold text-sm text-md-text">{tooltip.deck.deck}</div>
              <div className="text-xs text-md-textMuted">
                Tier {tooltip.deck.tier ?? '?'} &middot; {tooltip.deck.prey.length} prey &middot; {tooltip.deck.predators.length} predators
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Meta Fitness: </span>
                <span className={winRateColor(tooltip.deck.meta_fitness)}>{(tooltip.deck.meta_fitness * 100).toFixed(1)}%</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Play Rate: </span>
                <span className="text-md-text">{((tooltip.deck.play_rate ?? 0) * 100).toFixed(1)}%</span>
              </div>
              {tooltip.deck.game_theory && (
                <div className="text-xs">
                  <span className="text-md-textMuted">Strategy: </span>
                  <span className={strategyLabel(tooltip.deck.game_theory.strategy_type).color.split(' ')[1]}>
                    {strategyLabel(tooltip.deck.game_theory.strategy_type).label}
                  </span>
                </div>
              )}
              <div className="text-[10px] text-md-textMuted italic mt-1">Click to select</div>
            </div>
          )}
          {tooltip.type === 'edge' && tooltip.relationship && (
            <div className="space-y-1">
              <div className="text-sm">
                <span className="font-semibold text-md-text">{tooltip.relationship.predator}</span>
                <span className="text-md-red mx-1">{tooltip.relationship.strength === 'hard_counter' ? '\u27EB' : '\u203A'}</span>
                <span className="font-semibold text-md-text">{tooltip.relationship.prey}</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Win Rate: </span>
                <span className={winRateColor(tooltip.relationship.win_rate)}>{(tooltip.relationship.win_rate * 100).toFixed(1)}%</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Meta Impact: </span>
                <span className="text-md-text">{(tooltip.relationship.meta_impact * 100).toFixed(2)}%</span>
              </div>
              <div className="text-xs">
                <span className="text-md-textMuted">Strength: </span>
                <span>{strengthLabel(tooltip.relationship.strength)}</span>
              </div>
              <div className="text-xs flex items-center gap-1">
                <span className="text-md-textMuted">Confidence:</span>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${confidenceDot(tooltip.relationship.confidence)}`} />
                <span>{tooltip.relationship.confidence}</span>
              </div>
              {tooltip.relationship.sample_size > 0 && (
                <div className="text-xs text-md-textMuted">n={tooltip.relationship.sample_size}</div>
              )}
              {tooltip.relationship.mechanism === 'inferred' && (
                <div className="text-[10px] italic text-md-textMuted">Inferred from tournament trends</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

interface Props {
  deckNames: string[];
}

export default function EcosystemView({ deckNames }: Props) {
  const [analysis, setAnalysis] = useState<EcosystemAnalysis | null>(null);
  const [selectedDeck, setSelectedDeck] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (deckNames.length > 0 && !selectedDeck) setSelectedDeck(deckNames[0]);
  }, [deckNames, selectedDeck]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getEcosystemAnalysis(controller.signal)
      .then(setAnalysis)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (error) return <ErrorBanner message={error} onRetry={() => setError('')} />;
  if (loading) return <LoadingSpinner />;
  if (!analysis || analysis.profiles.length === 0) {
    return (
      <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
        No ecosystem data available. Run a sync to populate matchup data.
      </div>
    );
  }

  const profile = analysis.profiles.find((p) => p.deck === selectedDeck) ?? analysis.profiles[0];
  const gt = profile.game_theory;

  const vulnLabel = profile.vulnerability_score > 0.03
    ? 'Exposed' : profile.vulnerability_score > 0.01
    ? 'Moderate' : 'Safe';
  const vulnColor = profile.vulnerability_score > 0.03
    ? 'text-md-red' : profile.vulnerability_score > 0.01
    ? 'text-md-orange' : 'text-md-green';

  const strat = strategyLabel(gt.strategy_type);
  const nashDev = nashDeviationLabel(gt.nash_deviation);

  return (
    <div className="space-y-4">
      {/* Section A: Deck Profile */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-md-text">Deck Ecosystem Profile</h3>
          <select
            value={selectedDeck}
            onChange={(e) => setSelectedDeck(e.target.value)}
            className="bg-md-bg border border-md-border rounded-lg px-3 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue max-w-xs"
          >
            {deckNames.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Header badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-bold text-md-text">{profile.deck}</span>
          {profile.tier != null && (
            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: tierColor(profile.tier) + '25', color: tierColor(profile.tier) }}>
              Tier {profile.tier}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${strat.color}`}>
            {strat.label}
          </span>
          {profile.polarization_index >= 0 && (
            <span className={clsx(
              'px-2 py-0.5 rounded text-xs font-semibold border',
              profile.polarization_index >= 0.4
                ? 'bg-md-purple/15 text-md-purple border-md-purple/30'
                : 'bg-md-textMuted/10 text-md-textMuted border-md-border'
            )}>
              {profile.polarization_index >= 0.4 ? 'Polarized' : 'Balanced'}
            </span>
          )}
          <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold border', vulnColor === 'text-md-red'
            ? 'bg-md-red/15 text-md-red border-md-red/30'
            : vulnColor === 'text-md-orange'
            ? 'bg-md-orange/15 text-md-orange border-md-orange/30'
            : 'bg-md-green/15 text-md-green border-md-green/30'
          )}>
            {vulnLabel}
          </span>
        </div>

        {/* Game Theory insight row */}
        <div className="bg-md-bg/50 border border-md-border rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-medium text-md-textMuted uppercase tracking-wide">Game Theory Analysis</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-xs text-md-textMuted block">Expected Payoff</span>
              <span className={`font-bold ${winRateColor(gt.expected_payoff)}`}>
                {(gt.expected_payoff * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-xs text-md-textMuted block">Nash Status</span>
              <span className={`font-bold ${nashDev.color}`}>{nashDev.label}</span>
              <span className="text-xs text-md-textMuted ml-1">
                ({gt.nash_deviation > 0 ? '+' : ''}{(gt.nash_deviation * 100).toFixed(0)}%)
              </span>
            </div>
            <div>
              <span className="text-xs text-md-textMuted block">Best Counter To</span>
              <span className="font-bold text-md-text">
                {gt.best_response_to || '\u2014'}
              </span>
            </div>
            <div>
              <span className="text-xs text-md-textMuted block">Dominance</span>
              {gt.dominates.length > 0 ? (
                <span className="text-md-green text-xs">Dominates {gt.dominates.length} deck{gt.dominates.length > 1 ? 's' : ''}</span>
              ) : gt.dominated_by.length > 0 ? (
                <span className="text-md-red text-xs">Dominated by {gt.dominated_by.join(', ')}</span>
              ) : (
                <span className="text-md-textMuted text-xs">No dominance found</span>
              )}
            </div>
          </div>
        </div>

        {/* Predator / Prey columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-md-green mb-2 flex items-center gap-1.5">
              <span>&#x1f3af;</span> Prey &mdash; Decks you beat
            </h4>
            <div className="bg-md-green/5 border border-md-green/10 rounded-lg divide-y divide-md-border">
              {profile.prey.length > 0 ? profile.prey.map((r) => (
                <RelationshipRow key={r.prey} rel={r} side="prey" />
              )) : (
                <p className="text-xs text-md-textMuted p-3">No favourable matchups found</p>
              )}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-md-red mb-2 flex items-center gap-1.5">
              <span>&#x2620;</span> Predators &mdash; Decks that beat you
            </h4>
            <div className="bg-md-red/5 border border-md-red/10 rounded-lg divide-y divide-md-border">
              {profile.predators.length > 0 ? profile.predators.map((r) => (
                <RelationshipRow key={r.predator} rel={r} side="predator" />
              )) : (
                <p className="text-xs text-md-textMuted p-3">No significant threats found</p>
              )}
            </div>
          </div>
        </div>

        {profile.neutral.length > 0 && (
          <div className="text-xs text-md-textMuted">
            <span className="font-medium">Even matchups:</span>{' '}
            {profile.neutral.join(', ')}
          </div>
        )}

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Polarization"
            value={profile.polarization_index >= 0 ? (profile.polarization_index * 100).toFixed(0) : 'N/A'}
            subLabel={profile.polarization_index >= 0 ? metricLabel(profile.polarization_index, 'Balanced', 'Mixed', 'Polarized') : 'Need 3+ matchups'}
          />
          <StatCard
            label="Matchup Spread"
            value={profile.matchup_spread > 0 ? (profile.matchup_spread * 100).toFixed(0) + '%' : 'N/A'}
            subLabel="Best \u2212 Worst"
          />
          <StatCard
            label="Vulnerability"
            value={(profile.vulnerability_score * 100).toFixed(1)}
            subLabel={vulnLabel}
            colorClass={vulnColor}
          />
          <StatCard
            label="Meta Fitness"
            value={(profile.meta_fitness * 100).toFixed(1) + '%'}
            subLabel="Field-weighted WR"
            colorClass={winRateColor(profile.meta_fitness)}
          />
        </div>
      </div>

      {/* Section B: Food Chain Graph (interactive) */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-md-text">Food Chain</h3>
        <p className="text-xs text-md-textMuted">
          Hover nodes and edges for details. Click a node to select it. Arrows: predator &#x2192; prey. Thickness = meta impact.
        </p>
        <FoodChainGraph
          foodChain={analysis.food_chain}
          profiles={analysis.profiles}
          selectedDeck={selectedDeck}
          onDeckSelect={setSelectedDeck}
        />
      </div>

      {/* Section C: Tournament Field + Nash Equilibrium */}
      {(analysis.tournament_field.length > 0 || Object.keys(analysis.nash_equilibrium).length > 0) && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-md-text">Tournament Field &amp; Equilibrium</h3>

          {analysis.tournament_field.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-md-border text-md-textMuted text-xs">
                    <th className="text-left py-2 px-3">Deck</th>
                    <th className="text-center py-2 px-3">Field %</th>
                    <th className="text-center py-2 px-3">Top Cut %</th>
                    <th className="text-center py-2 px-3">Conversion</th>
                    <th className="text-center py-2 px-3">Nash Optimal</th>
                    <th className="text-center py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-border">
                  {analysis.tournament_field.map((entry) => {
                    const nashRate = analysis.nash_equilibrium[entry.deck] ?? 0;
                    const actualRate = entry.field_pct;
                    const dev = nashRate > 0 ? (actualRate - nashRate) / nashRate : 0;
                    const devInfo = nashDeviationLabel(dev);

                    return (
                      <tr
                        key={entry.deck}
                        className={clsx(
                          'hover:bg-md-surfaceHover/40 transition-colors cursor-pointer',
                          selectedDeck === entry.deck && 'bg-md-blue/5'
                        )}
                        onClick={() => setSelectedDeck(entry.deck)}
                      >
                        <td className="py-2 px-3 font-medium">{entry.deck}</td>
                        <td className="py-2 px-3 text-center tabular-nums">{(entry.field_pct * 100).toFixed(1)}%</td>
                        <td className="py-2 px-3 text-center tabular-nums">{(entry.top_cut_pct * 100).toFixed(1)}%</td>
                        <td className="py-2 px-3 text-center">
                          <span className={clsx('tabular-nums font-semibold',
                            entry.conversion_rate >= 1.3 ? 'text-md-green'
                              : entry.conversion_rate >= 0.8 ? 'text-md-textMuted'
                              : 'text-md-red'
                          )}>
                            {entry.conversion_rate.toFixed(2)}x
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center tabular-nums text-md-textMuted">
                          {(nashRate * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={clsx('text-xs font-semibold', devInfo.color)}>
                            {devInfo.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-md-textMuted mt-2">
                Conversion = top cut share / field share. &gt;1.0 = overperforming. Nash Optimal = game-theory equilibrium play rate.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Section D: Meta Health Summary */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-md-text">Meta Health</h3>

        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <div className={clsx(
              'text-2xl font-bold tabular-nums',
              analysis.meta_health_index >= 0.6 ? 'text-md-green'
                : analysis.meta_health_index >= 0.4 ? 'text-md-orange'
                : 'text-md-red'
            )}>
              {(analysis.meta_health_index * 100).toFixed(0)}
            </div>
            <div className="text-xs text-md-textMuted">/ 100</div>
          </div>
          <div className="flex-1">
            <div className="w-full h-2 bg-md-bg rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  analysis.meta_health_index >= 0.6 ? 'bg-md-green'
                    : analysis.meta_health_index >= 0.4 ? 'bg-md-orange'
                    : 'bg-md-red'
                )}
                style={{ width: `${analysis.meta_health_index * 100}%` }}
              />
            </div>
            <p className="text-xs text-md-textMuted mt-1">
              {analysis.meta_health_index >= 0.6 ? 'Healthy \u2014 diverse meta with balanced play rates'
                : analysis.meta_health_index >= 0.4 ? 'Moderate \u2014 some decks dominate play share'
                : 'Concentrated \u2014 meta is dominated by few decks'}
            </p>
          </div>
        </div>

        {analysis.food_chain.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-md-textMuted">Top Counter Relationships</h4>
            {analysis.food_chain.slice(0, 3).map((r, i) => (
              <div key={i} className="text-sm text-md-textSecondary">
                <span className="font-medium text-md-text">{r.predator}</span>
                <span className="text-md-red mx-1">{r.strength === 'hard_counter' ? '\u27EB' : '\u203A'}</span>
                <span className="font-medium text-md-text">{r.prey}</span>
                <span className="text-xs text-md-textMuted ml-2">
                  {(r.win_rate * 100).toFixed(0)}% WR, {(r.meta_impact * 100).toFixed(1)}% impact
                </span>
              </div>
            ))}
          </div>
        )}

        {analysis.cycles.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-md-textMuted">Rock-Paper-Scissors Cycles</h4>
            {analysis.cycles.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="text-md-purple font-medium">
                  {c.decks.join(' \u203A ')} \u203A {c.decks[0]}
                </span>
                <span className="text-xs text-md-textMuted ml-2">
                  avg {(c.cycle_strength * 100).toFixed(0)}% WR
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

## File: client/tailwind.config.ts
```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        md: {
          bg: '#09090b',
          surface: '#111113',
          surfaceAlt: '#18181b',
          surfaceHover: '#1c1c1f',
          border: '#27272a',
          borderLight: '#3f3f46',
          gold: '#d4af37',
          goldMuted: '#b8962e',
          blue: '#4a8eff',
          blueLight: '#6ba3ff',
          purple: '#8b6cff',
          orange: '#ff9147',
          green: '#34d399',
          red: '#ff4d5e',
          text: '#eceef4',
          textSecondary: '#a1a1aa',
          textMuted: '#71717a',
          winRate: '#34d399',
          playRate: '#94a3b8',
        },
        tier: {
          '0': '#ff2d55',
          '1': '#ff8c38',
          '2': '#ffd60a',
          '3': '#38c96e',
          rogue: '#6b7694',
        },
        rarity: {
          ur: '#8b6cff',
          sr: '#ff9147',
          r: '#4a8eff',
          n: '#6b7694',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(ellipse at 50% 0%, rgba(74,142,255,0.08) 0%, transparent 60%)',
        'gold-glow': 'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.06) 0%, transparent 50%)',
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(74,142,255,0.15)',
        'glow-gold': '0 0 20px rgba(212,175,55,0.15)',
        'glow-purple': '0 0 20px rgba(139,108,255,0.15)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
        'card-hover': '0 12px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08)',
        'card-featured': '0 0 0 1px rgba(255,255,255,0.06), 0 12px 48px rgba(0,0,0,0.7)',
        'surface': '0 1px 3px rgba(0,0,0,0.3)',
        'surface-lg': '0 4px 16px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

## File: server/src/index.ts
```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { config } from './config.js';
import 'dotenv/config';
import { initDb, getPool } from './db/connection.js';
import { queryOne } from './utils/dbHelpers.js';
import cardsRouter from './routes/cards.js';
import tierListRouter from './routes/tierList.js';
import decksRouter from './routes/decks.js';
import matchupsRouter from './routes/matchups.js';
import banListRouter from './routes/banList.js';
import metaTrendsRouter from './routes/metaTrends.js';
import tournamentsRouter from './routes/tournaments.js';
import deckBuilderRouter from './routes/deckBuilder.js';
import syncRouter from './routes/sync.js';
import { syncCards, syncArchetypes, syncDeckTypes, syncTopDecks, syncTournaments, syncUntapped } from './services/syncService.js';
import { updateTiersFromScrape } from './services/tierListService.js';

async function main() {
  // Init DB first
  await initDb();

  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  app.use(cors({ origin: allowedOrigins }));

  app.use(express.json());

  // Routes
  app.use('/api/cards', cardsRouter);
  app.use('/api/tier-list', tierListRouter);
  app.use('/api/decks', decksRouter);
  app.use('/api/matchups', matchupsRouter);
  app.use('/api/ban-list', banListRouter);
  app.use('/api/meta-trends', metaTrendsRouter);
  app.use('/api/tournaments', tournamentsRouter);
  app.use('/api/deck-builder', deckBuilderRouter);
  app.use('/api/sync', syncRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Initial data sync on startup (non-blocking)
  (async () => {
    try {
      const pool = getPool();
      const cardCount = await queryOne(pool, 'SELECT COUNT(*) as c FROM cards');
      if (!cardCount || cardCount.c === 0) {
        console.log('[Startup] No cards found, running initial sync...');
        await syncCards();
        await syncArchetypes();
        console.log('[Startup] Card sync complete');
      }

      const dtCount = await queryOne(pool, 'SELECT COUNT(*) as c FROM deck_types');
      if (!dtCount || dtCount.c === 0) {
        console.log('[Startup] No deck types found, syncing meta data...');
        await syncDeckTypes();
        await syncTopDecks();
        await syncTournaments();
        await updateTiersFromScrape();
        console.log('[Startup] Meta sync complete');
      }
    } catch (err) {
      console.error('[Startup] Initial sync failed:', err);
    }
  })();

  // Scheduled syncs
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Running meta sync...');
    try {
      await syncDeckTypes();
      await syncTopDecks();
      await syncTournaments();
      await updateTiersFromScrape();
      await syncUntapped();
    } catch (err) {
      console.error('[Cron] Meta sync failed:', err);
    }
  });

  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron] Running card sync...');
    try {
      await syncCards();
      await syncArchetypes();
    } catch (err) {
      console.error('[Cron] Card sync failed:', err);
    }
  });

  app.listen(config.port, () => {
    console.log(`[Server] Running on http://localhost:${config.port}`);
  });
}

main().catch(console.error);
```

## File: server/src/routes/deckBuilder.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';

const router = Router();

router.post('/score', async (req: Request, res: Response) => {
  try {
    const { main = [], extra = [] } = req.body as { main: string[]; extra: string[] };
    const allCards = [...main, ...extra];
    const pool = getPool();

    const deckTypes = await queryAll(pool, 'SELECT name, tier, power, breakdown_json FROM deck_types WHERE tier IS NOT NULL ORDER BY tier ASC');

    let totalScore = 0;
    const cardScores: Record<string, { score: number; decks: string[] }> = {};

    for (const cardName of allCards) {
      let cardScore = 0;
      const appearsIn: string[] = [];

      for (const dt of deckTypes) {
        if (!dt.breakdown_json) continue;
        const breakdown = JSON.parse(dt.breakdown_json);
        const allBreakdownCards = [...(breakdown.main || []), ...(breakdown.extra || [])];

        for (const bc of allBreakdownCards) {
          if (bc.cardName?.toLowerCase() === cardName.toLowerCase() ||
              bc.name?.toLowerCase() === cardName.toLowerCase()) {
            const tierWeight = dt.tier === 0 ? 4 : dt.tier === 1 ? 3 : dt.tier === 2 ? 2 : 1;
            const usageRate = bc.percentage || bc.usage || 50;
            cardScore += tierWeight * (usageRate / 100) * (dt.power || 1);
            appearsIn.push(dt.name);
            break;
          }
        }
      }

      cardScores[cardName] = { score: cardScore, decks: appearsIn };
      totalScore += cardScore;
    }

    const maxPossible = allCards.length * 80;
    const normalizedScore = Math.min(100, Math.round((totalScore / Math.max(maxPossible, 1)) * 100));

    res.json({ score: normalizedScore, cardScores, totalCards: allCards.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { main = [], extra = [], side = [] } = req.body;
    const errors: string[] = [];

    if (main.length < 40) errors.push(`Main deck too small: ${main.length}/40 minimum`);
    if (main.length > 60) errors.push(`Main deck too large: ${main.length}/60 maximum`);
    if (extra.length > 15) errors.push(`Extra deck too large: ${extra.length}/15 maximum`);
    if (side.length > 15) errors.push(`Side deck too large: ${side.length}/15 maximum`);

    const pool = getPool();
    const allCards = [...main, ...extra, ...side];
    const cardCounts: Record<string, number> = {};
    for (const c of allCards) {
      cardCounts[c] = (cardCounts[c] || 0) + 1;
    }

    for (const [name, count] of Object.entries(cardCounts)) {
      const card = await queryOne(pool, "SELECT ban_status_md FROM cards WHERE LOWER(name) = LOWER($1)", [name]);
      if (card?.ban_status_md === 'Banned') {
        errors.push(`${name} is Forbidden`);
      } else if (card?.ban_status_md === 'Limited' && count > 1) {
        errors.push(`${name} is Limited to 1 (found ${count})`);
      } else if (card?.ban_status_md === 'Semi-Limited' && count > 2) {
        errors.push(`${name} is Semi-Limited to 2 (found ${count})`);
      } else if (count > 3) {
        errors.push(`${name}: maximum 3 copies allowed (found ${count})`);
      }
    }

    res.json({ valid: errors.length === 0, errors, warnings: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## File: server/src/routes/metaTrends.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const snapshots = await queryAll(pool, `
      SELECT deck_type_name, tier, power, pop_rank, snapshot_date
      FROM meta_snapshots
      ORDER BY snapshot_date DESC, deck_type_name
    `);

    const grouped: Record<string, any[]> = {};
    for (const s of snapshots) {
      if (!grouped[s.deck_type_name]) grouped[s.deck_type_name] = [];
      grouped[s.deck_type_name].push(s);
    }

    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:deckName', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const snapshots = await queryAll(pool, `
      SELECT * FROM meta_snapshots
      WHERE LOWER(deck_type_name) = LOWER($1)
      ORDER BY snapshot_date ASC
    `, [req.params.deckName]);

    res.json(snapshots);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## File: server/src/services/cacheService.ts
```typescript
import { getPool } from '../db/connection.js';
import { queryOne, run } from '../utils/dbHelpers.js';

export async function getCached<T>(key: string): Promise<T | null> {
  const pool = getPool();
  const row = await queryOne(pool, 'SELECT data, expires_at FROM api_cache WHERE cache_key = $1', [key]);
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) {
    await run(pool, 'DELETE FROM api_cache WHERE cache_key = $1', [key]);
    return null;
  }
  return JSON.parse(row.data) as T;
}

export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  const pool = getPool();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  await run(pool, 'INSERT INTO api_cache (cache_key, data, expires_at) VALUES ($1, $2, $3) ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at', [key, JSON.stringify(data), expiresAt]);
}

export async function clearCache(pattern?: string): Promise<void> {
  const pool = getPool();
  if (pattern) {
    await run(pool, 'DELETE FROM api_cache WHERE cache_key LIKE $1', [`%${pattern}%`]);
  } else {
    await run(pool, 'DELETE FROM api_cache');
  }
}
```

## File: server/src/services/tierListService.ts
```typescript
import { getPool } from '../db/connection.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface TierEntry {
  name: string;
  tier: number;
}

// Known tier assignments from masterduelmeta.com (updated periodically)
const KNOWN_TIERS: TierEntry[] = [
  { name: 'Dracotail', tier: 1 },
  { name: 'Mitsurugi Engine', tier: 1 },
  { name: 'Ryzeal Mitsurugi', tier: 1 },
  { name: 'Yummy Engine', tier: 1 },
  { name: 'K9 Engine', tier: 1 },
  { name: 'Radiant Typhoon', tier: 2 },
  { name: 'Vanquish Soul K9', tier: 2 },
  { name: 'Mitsurugi Yummy', tier: 3 },
  { name: 'Solfachord Yummy', tier: 3 },
  { name: 'White Forest Azamina', tier: 3 },
  { name: 'Yummy', tier: 3 },
];

export async function scrapeTierListFromSite(): Promise<TierEntry[]> {
  try {
    const res = await axios.get('https://www.masterduelmeta.com/tier-list', {
      headers: { 'User-Agent': 'MDMetaApp/1.0' },
    });
    const $ = cheerio.load(res.data);
    const entries: TierEntry[] = [];

    // The tier list page groups decks by tier sections
    // Look for tier headers and their associated deck links
    const text = $.text();

    // Try to extract from structured content
    $('a[href*="/tier-list/deck-types/"]').each((_i, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 1) {
        // Try to determine tier from parent/ancestor elements
        const section = $(el).closest('[class*="tier"]');
        const sectionText = section.text() || '';
        let tier = 3; // default

        if (sectionText.includes('Tier 0') || sectionText.includes('tier-0')) tier = 0;
        else if (sectionText.includes('Tier 1') || sectionText.includes('tier-1')) tier = 1;
        else if (sectionText.includes('Tier 2') || sectionText.includes('tier-2')) tier = 2;
        else if (sectionText.includes('Tier 3') || sectionText.includes('tier-3')) tier = 3;

        if (!entries.find(e => e.name === name)) {
          entries.push({ name, tier });
        }
      }
    });

    return entries;
  } catch (err) {
    console.error('[TierList] Scrape failed:', err);
    return [];
  }
}

export async function updateTiersFromScrape(): Promise<number> {
  let entries = await scrapeTierListFromSite();

  // Merge with known tiers - scraped data takes precedence where it has proper tier info,
  // but fall back to known tiers for guaranteed accuracy
  const entryMap = new Map(entries.map(e => [e.name.toLowerCase(), e]));
  for (const known of KNOWN_TIERS) {
    const existing = entryMap.get(known.name.toLowerCase());
    if (!existing || existing.tier === 3) {
      // Override with known tier if scraper defaulted to 3
      entryMap.set(known.name.toLowerCase(), known);
    }
  }
  entries = Array.from(entryMap.values());

  if (entries.length === 0) return 0;

  const pool = getPool();
  for (const entry of entries) {
    // Update existing deck_types if they exist
    const existing = await queryOne(pool, 'SELECT id FROM deck_types WHERE LOWER(name) = LOWER($1)', [entry.name]);
    if (existing) {
      await run(pool, 'UPDATE deck_types SET tier = $1 WHERE LOWER(name) = LOWER($2)', [entry.tier, entry.name]);
    } else {
      // Insert as new deck type
      await run(pool, `INSERT INTO deck_types (id, name, tier, power, updated_at)
        VALUES ($1, $2, $3, $4, extract(epoch from now())::bigint)
        ON CONFLICT (id) DO NOTHING`,
        [entry.name.toLowerCase().replace(/\s+/g, '-'), entry.name, entry.tier, null]);
    }

    // Also snapshot
    await run(pool, `INSERT INTO meta_snapshots (deck_type_name, tier, power, pop_rank, snapshot_date)
      VALUES ($1, $2, NULL, NULL, CURRENT_DATE)
      ON CONFLICT DO NOTHING`, [entry.name, entry.tier]);
  }

  console.log(`[TierList] Updated ${entries.length} deck tiers from scrape`);
  return entries.length;
}
```

## File: server/src/services/ygoprodeckService.ts
```typescript
import axios from 'axios';
import { config } from '../config.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { getCached, setCache } from './cacheService.js';

const limiter = new RateLimiter(config.rateLimit.ygoprodeckRps);
const api = axios.create({ baseURL: config.ygoprodeckBaseUrl });

async function fetchWithCache<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await getCached<T>(cacheKey);
  if (cached) return cached;
  const data = await limiter.wrap(fetcher);
  await setCache(cacheKey, data, ttl);
  return data;
}

export interface YGOCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  archetype?: string;
  linkval?: number;
  linkmarkers?: string[];
  scale?: number;
  card_images: Array<{ id: number; image_url: string; image_url_small: string; image_url_cropped: string }>;
  banlist_info?: { ban_tcg?: string; ban_ocg?: string; ban_goat?: string; ban_masterduel?: string };
  misc_info?: Array<{ md_rarity?: string }>;
}

export async function searchCards(params: Record<string, string>): Promise<YGOCard[]> {
  const queryStr = new URLSearchParams(params).toString();
  const cacheKey = `ygopd:cards:${queryStr}`;
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/cardinfo.php', {
      params: { ...params, misc: 'yes' },
    });
    return res.data.data || [];
  });
}

export async function getCardById(id: number): Promise<YGOCard | null> {
  const cacheKey = `ygopd:card:${id}`;
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/cardinfo.php', { params: { id, misc: 'yes' } });
    return res.data.data?.[0] || null;
  });
}

export async function getAllCards(): Promise<YGOCard[]> {
  const cacheKey = 'ygopd:allcards';
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/cardinfo.php', { params: { misc: 'yes' } });
    return res.data.data || [];
  });
}

export async function getArchetypes(): Promise<string[]> {
  const cacheKey = 'ygopd:archetypes';
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/archetypes.php');
    return (res.data as Array<{ archetype_name: string }>).map(a => a.archetype_name);
  });
}

export async function getBanList(): Promise<YGOCard[]> {
  const cacheKey = 'ygopd:banlist:md';
  return fetchWithCache(cacheKey, config.cache.banListTtl, async () => {
    const res = await api.get('/cardinfo.php', {
      params: { banlist: 'masterduel', misc: 'yes' },
    });
    return res.data.data || [];
  });
}
```

## File: server/src/utils/dbHelpers.ts
```typescript
import type { Pool } from '@neondatabase/serverless';

export async function queryAll(pool: Pool, sql: string, params: any[] = []): Promise<any[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function queryOne(pool: Pool, sql: string, params: any[] = []): Promise<any | null> {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

export async function run(pool: Pool, sql: string, params: any[] = []): Promise<void> {
  await pool.query(sql, params);
}
```

## File: client/src/api/cards.ts
```typescript
import api from './client';
import type { CardSearchResult } from '../types/card';

export async function searchCards(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<CardSearchResult> {
  const res = await api.get('/cards/search', { params, signal });
  return res.data;
}

export async function getCardById(id: number) {
  const res = await api.get(`/cards/${id}`);
  return res.data;
}

export async function getArchetypes(): Promise<string[]> {
  const res = await api.get('/cards/archetypes');
  return res.data;
}
```

## File: client/src/components/common/SyncFreshnessBadge.tsx
```typescript
import type { SyncRecord } from '../../api/sync';

interface Props {
  records: SyncRecord[];
  sources?: string[]; // which sources are relevant to this page
}

export default function SyncFreshnessBadge({ records, sources }: Props) {
  const relevant = sources
    ? records.filter((r) => sources.includes(r.source))
    : records;

  if (relevant.length === 0) return null;

  const hasFailed = relevant.some((r) => r.status === 'failed');
  const hasPartial = relevant.some((r) => r.status === 'partial');
  const oldestSyncedAt = Math.min(...relevant.map((r) => r.synced_at)) || 0;
  const ageHrs = (Date.now() / 1000 - oldestSyncedAt) / 3600;

  let label: string;
  let classes: string;

  if (hasFailed) {
    label = '● Sync failed';
    classes = 'bg-md-red/10 border-md-red/20 text-md-red';
  } else if (ageHrs > 12) {
    label = `● ${Math.floor(ageHrs)}h ago`;
    classes = 'bg-md-red/10 border-md-red/20 text-md-red';
  } else if (hasPartial || ageHrs > 2) {
    const mins = Math.floor(ageHrs * 60);
    label = ageHrs < 1 ? `● ${mins}m ago` : `● ${Math.floor(ageHrs)}h ago`;
    classes = 'bg-md-orange/10 border-md-orange/20 text-md-orange';
  } else {
    const mins = Math.floor(ageHrs * 60);
    label = mins < 60 ? `● ${mins}m ago` : `● ${Math.floor(ageHrs)}h ago`;
    classes = 'bg-md-green/10 border-md-green/20 text-md-green';
  }

  return (
    <span className={`inline-flex items-center border rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
```

## File: client/src/components/dashboard/TopArchetypesGrid.tsx
```typescript
import { Link } from 'react-router-dom';
import TierBadge from '../common/TierBadge';

const tierColors = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#6b7694'];

interface FeaturedDeck {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  cards: Array<{ name: string; image: string | null }>;
}

function CardFanMini({ cards, thumbnail }: { cards: Array<{ name: string; image: string | null }>; thumbnail?: string | null }) {
  // Fallback: if no card data but we have a thumbnail, show it as a single centered card
  if ((!cards || cards.length === 0) && thumbnail) {
    return (
      <div className="relative flex items-end justify-center" style={{ height: '130px', width: '100%' }}>
        <div className="absolute bottom-0" style={{ transformOrigin: 'bottom center', zIndex: 0 }}>
          <img
            src={thumbnail}
            alt="Deck thumbnail"
            className="rounded-md shadow-card border border-white/5"
            style={{ width: '64px', height: '94px', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-md-textMuted text-xs">
        No card data
      </div>
    );
  }

  const count = Math.min(cards.length, 3);
  const totalSpread = 40;
  const angles = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -totalSpread / 2 + (i * totalSpread) / (count - 1)
  );
  const xOffsets = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -20 * (count - 1) / 2 + i * 20
  );

  return (
    <div className="relative flex items-end justify-center" style={{ height: '130px', width: '100%' }}>
      {cards.slice(0, count).map((card, i) => (
        <div
          key={card.name}
          className="absolute bottom-0 transition-transform duration-300 ease-out group-hover:scale-105"
          style={{
            transform: `translateX(${xOffsets[i]}px) rotate(${angles[i]}deg)`,
            transformOrigin: 'bottom center',
            zIndex: i,
          }}
          title={card.name}
        >
          {card.image ? (
            <img
              src={card.image}
              alt={card.name}
              className="rounded-md shadow-card border border-white/5"
              style={{ width: '64px', height: '94px', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="rounded-md border border-white/[0.07] bg-md-surfaceAlt flex items-center justify-center"
              style={{ width: '64px', height: '94px' }}
            >
              <span className="text-md-gold text-lg font-bold">?</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface TopArchetypesGridProps {
  featured: FeaturedDeck[];
}

export default function TopArchetypesGrid({ featured }: TopArchetypesGridProps) {
  if (featured.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {featured.map((deck, idx) => {
          const tierColor = tierColors[deck.tier ?? 4];
          return (
            <Link
              key={deck.id}
              to={`/decks/${encodeURIComponent(deck.name)}`}
              className="group relative featured-card rounded-2xl overflow-hidden card-hover transform transition-all duration-300 hover:-translate-y-1"
            >
              {/* Tier-colored top accent line */}
              <div
                className="absolute top-0 inset-x-0 h-1"
                style={{ background: `linear-gradient(90deg, transparent, ${tierColor}80, transparent)` }}
              />

              {/* Ambient glow — fades in on hover */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${tierColor}40 0%, transparent 68%)` }}
              />

              <div className="relative p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-md-surface/80 to-md-surface border border-md-border flex items-center justify-center text-sm font-bold text-md-textSecondary">
                      {idx + 1}
                    </span>
                    <TierBadge tier={deck.tier} size="md" />
                  </div>
                  {typeof deck.power === 'number' && (
                    <span className="text-xs font-mono text-md-textMuted bg-md-surface/60 border border-md-border/50 px-2.5 py-1 rounded-lg">
                      {deck.power.toFixed(1)} PWR
                    </span>
                  )}
                </div>

                {/* Card fan */}
                <CardFanMini cards={deck.cards} thumbnail={deck.thumbnail_image} />

                {/* Name + stats */}
                <div className="mt-5 text-center">
                  <p className="font-bold text-md-text group-hover:text-md-gold transition-colors duration-300 truncate text-lg">
                    {deck.name}
                  </p>
                  <div className="flex items-center justify-center gap-4 mt-3 text-sm tabular-nums">
                    {typeof deck.win_rate === 'number' && (
                      <span className="text-md-winRate font-semibold">
                        {deck.win_rate.toFixed(1)}% WR
                      </span>
                    )}
                    {typeof deck.play_rate === 'number' && (
                      <span className="text-md-playRate font-medium">{deck.play_rate.toFixed(1)}% PR</span>
                    )}
                    {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                      <span className={`font-semibold ${deck.power_trend > 0 ? 'text-md-winRate' : 'text-md-red'}`}>
                        {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

## File: client/src/components/decks/DecklistView.tsx
```typescript
import { useState, useRef } from 'react';
import type { EnrichedDeckCard } from '../../types/deck';
import CardImage from '../common/CardImage';

interface DecklistViewProps {
  mainDeck: EnrichedDeckCard[];
  extraDeck: EnrichedDeckCard[];
  deckArchetype: string;
}

interface CategorizedDeck {
  archetypeMonsters: EnrichedDeckCard[];
  techMonsters: EnrichedDeckCard[];
  spells: EnrichedDeckCard[];
  traps: EnrichedDeckCard[];
}

function categorizeDeck(cards: EnrichedDeckCard[], deckName: string): CategorizedDeck {
  const deckWords = deckName.toLowerCase().split(/\s+/);
  const result: CategorizedDeck = { archetypeMonsters: [], techMonsters: [], spells: [], traps: [] };

  for (const card of cards) {
    const type = (card.type || '').toLowerCase();
    if (type.includes('spell')) {
      result.spells.push(card);
    } else if (type.includes('trap')) {
      result.traps.push(card);
    } else {
      // Monster — check if it belongs to the deck's archetype
      const cardArchetype = (card.archetype || '').toLowerCase();
      const cardName = card.cardName.toLowerCase();
      const isArchetype = deckWords.some(w =>
        w.length > 2 && (cardArchetype.includes(w) || cardName.includes(w))
      );
      if (isArchetype) {
        result.archetypeMonsters.push(card);
      } else {
        result.techMonsters.push(card);
      }
    }
  }
  return result;
}

const RARITY_BORDERS: Record<string, string> = {
  UR: 'border-l-rarity-ur',
  SR: 'border-l-rarity-sr',
  R: 'border-l-rarity-r',
  N: 'border-l-rarity-n',
};

function DeckCardCell({ card }: { card: EnrichedDeckCard }) {
  const borderClass = RARITY_BORDERS[card.rarity || 'N'] || RARITY_BORDERS.N;
  const [hovered, setHovered] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const largeUrl = card.imageUrl?.replace('/cards_small/', '/cards/') || null;

  const handleMouseEnter = () => {
    setHovered(true);
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const popW = 480;
      const popH = 700;
      let left = rect.right + 8;
      let top = rect.top;
      // Flip left if overflows right
      if (left + popW > viewW) left = rect.left - popW - 8;
      // Clamp to viewport
      if (top + popH > viewH) top = viewH - popH - 8;
      if (top < 8) top = 8;
      setPos({ top, left });
    }
  };

  return (
    <div
      ref={cellRef}
      className={`relative border-l-2 ${borderClass} rounded overflow-hidden`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <CardImage src={card.imageUrl || null} alt={card.cardName} size="md" />
      {card.amount > 1 && (
        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
          x{card.amount}
        </span>
      )}
      <span className="absolute top-0 left-0.5 text-[10px] font-bold px-1 rounded-br bg-black/60 text-white uppercase">
        {card.rarity || 'N'}
      </span>
      {hovered && largeUrl && pos && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg overflow-hidden shadow-2xl border border-md-border bg-md-bg p-1.5"
          style={{ top: pos.top, left: pos.left, width: 480 }}
        >
          <img src={largeUrl} alt={card.cardName} className="w-full rounded" />
          <p className="text-sm text-center text-md-text mt-1.5 font-medium truncate px-2">{card.cardName}</p>
          {card.negate_effectiveness != null && card.negate_effectiveness > 0 && (
            <div className="mt-1 px-2 space-y-0.5">
              <p className={`text-xs text-center font-semibold ${card.negate_effectiveness > 8 ? 'text-md-red' : card.negate_effectiveness > 4 ? 'text-md-orange' : 'text-yellow-400'}`}>
                Negate Impact: +{card.negate_effectiveness.toFixed(1)}%
              </p>
              {card.not_negated_win_rate != null && card.negated_win_rate != null && (
                <p className="text-[10px] text-center text-md-textMuted">
                  WR: <span className="text-md-green">{card.not_negated_win_rate.toFixed(1)}%</span> / Negated: <span className="text-md-red">{card.negated_win_rate.toFixed(1)}%</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardSection({ label, cards, totalCards }: { label: string; cards: EnrichedDeckCard[]; totalCards?: number }) {
  if (cards.length === 0) return null;
  const total = totalCards ?? cards.reduce((sum, c) => sum + c.amount, 0);
  return (
    <div>
      <h4 className="text-xs font-semibold text-md-textMuted uppercase tracking-wider mb-2">
        {label} <span className="text-md-text">({total})</span>
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {cards.map((card, i) => (
          <DeckCardCell key={`${card.cardName}-${i}`} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function DecklistView({ mainDeck, extraDeck, deckArchetype }: DecklistViewProps) {
  const { archetypeMonsters, techMonsters, spells, traps } = categorizeDeck(mainDeck, deckArchetype);
  const mainTotal = mainDeck.reduce((sum, c) => sum + c.amount, 0);
  const extraTotal = extraDeck.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-md-textMuted">Main Deck ({mainTotal}) / Extra Deck ({extraTotal})</p>

      <CardSection label="Archetype Monsters" cards={archetypeMonsters} />
      <CardSection label="Staples / Tech" cards={techMonsters} />
      <CardSection label="Spells" cards={spells} />
      <CardSection label="Traps" cards={traps} />

      {extraDeck.length > 0 && (
        <>
          <hr className="border-md-border" />
          <CardSection label="Extra Deck" cards={extraDeck} />
        </>
      )}
    </div>
  );
}
```

## File: client/src/components/layout/Header.tsx
```typescript
import { Link } from 'react-router-dom';
import { syncAll, syncUntapped } from '../../api/meta';
import { useState } from 'react';

export default function Header() {
  const [syncing, setSyncing] = useState(false);
  const [syncingUntapped, setSyncingUntapped] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await syncAll();
      setSyncMsg(res.message || 'Done');
      setTimeout(() => setSyncMsg(''), 4000);
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncUntapped = async () => {
    setSyncingUntapped(true);
    setSyncMsg('');
    try {
      const res = await syncUntapped();
      setSyncMsg(res.message || 'Done');
      setTimeout(() => setSyncMsg(''), 4000);
    } catch (e) {
      console.error('Untapped sync failed:', e);
    } finally {
      setSyncingUntapped(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-md-border/60 bg-gradient-to-r from-md-bg/80 via-md-bg/90 to-md-bg/80 backdrop-blur-xl shadow-lg shadow-black/10">
      <div className="flex items-center justify-between px-6 h-16">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-md-gold/30 via-md-gold/20 to-md-gold/10 border border-md-gold/30 flex items-center justify-center shadow-glow-gold group-hover:from-md-gold/40 group-hover:to-md-gold/20 group-hover:shadow-glow-gold transition-all duration-300 transform group-hover:scale-105">
            <span className="text-md-gold font-extrabold text-lg tracking-tighter">MD</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-md-text leading-none tracking-tight bg-gradient-to-r from-md-text to-md-textSecondary bg-clip-text text-transparent">
              MD Meta
            </h1>
            <p className="text-[11px] text-md-textMuted mt-0.5 tracking-wider uppercase font-semibold">
              Master Duel Analysis
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-md-green/90 max-w-[280px] truncate animate-fade-in font-semibold px-3 py-1.5 rounded-lg bg-md-green/10 border border-md-green/20">
              {syncMsg}
            </span>
          )}
          <button
            onClick={handleSyncUntapped}
            disabled={syncingUntapped || syncing}
            title="Sync win/play rate data from untapped.gg"
            className="px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 disabled:opacity-40
              bg-gradient-to-br from-md-green/15 to-md-green/5 text-md-green border border-md-green/30 hover:from-md-green/25 hover:to-md-green/10 hover:border-md-green/50 hover:shadow-glow-gold group"
          >
            {syncingUntapped ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-md-green/30 border-t-md-green rounded-full animate-spin" />
                Syncing...
              </span>
            ) : (
              <span className="flex items-center gap-2 group-hover:gap-3 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.586 9m0 0H9m11 11v-5m-6.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Sync untapped.gg
              </span>
            )}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || syncingUntapped}
            className="px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 disabled:opacity-40
              bg-gradient-to-br from-md-blue/15 to-md-blue/5 text-md-blue border border-md-blue/30 hover:from-md-blue/25 hover:to-md-blue/10 hover:border-md-blue/50 hover:shadow-glow-blue group"
          >
            {syncing ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-md-blue/30 border-t-md-blue rounded-full animate-spin" />
                Syncing...
              </span>
            ) : (
              <span className="flex items-center gap-2 group-hover:gap-3 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.586 9m0 0H9m11 11v-5m-6.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Sync All
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
```

## File: client/src/components/layout/Sidebar.tsx
```typescript
import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { getSyncStatus, type SyncRecord } from '../../api/sync';

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/cards', label: 'Card Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { to: '/matchups', label: 'Matchups', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { to: '/ban-list', label: 'Ban List', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
  { to: '/trends', label: 'Meta Trends', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { to: '/tournaments', label: 'Tournaments', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { to: '/deck-builder', label: 'Deck Builder', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
];

const SOURCE_LABELS: Record<string, string> = {
  ygoprodeck: 'YGOProDeck',
  mdm_deck_types: 'MDM Decks',
  mdm_tournaments: 'Tournaments',
  untapped: 'Untapped.gg',
};

function formatAge(syncedAt: number): string {
  const mins = Math.floor((Date.now() / 1000 - syncedAt) / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function dotColor(record: SyncRecord): string {
  if (record.status === 'failed') return 'bg-md-red';
  if (record.status === 'partial') return 'bg-md-orange';
  const ageHrs = (Date.now() / 1000 - record.synced_at) / 3600;
  if (ageHrs > 12) return 'bg-md-red';
  if (ageHrs > 2) return 'bg-md-orange';
  return 'bg-md-green animate-pulse';
}

export default function Sidebar() {
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);

  useEffect(() => {
    getSyncStatus().then(setSyncRecords).catch(() => {});
  }, []);

  return (
    <nav className="w-56 min-h-[calc(100vh-4rem)] border-r border-md-border/30 bg-gradient-to-b from-md-surface/50 to-md-surface/30 py-5 px-3 flex flex-col gap-1 shadow-lg shadow-black/5">
      <div className="mb-2 px-2">
        <h3 className="text-xs font-bold text-md-textMuted uppercase tracking-widest">Navigation</h3>
      </div>

      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group',
              isActive
                ? 'bg-gradient-to-r from-md-blue/15 to-md-blue/5 text-md-blue border border-md-blue/20 shadow-md shadow-md-blue/10 nav-active'
                : 'text-md-textMuted hover:text-md-textSecondary hover:bg-md-surfaceHover/40'
            )
          }
        >
          <svg className="w-5 h-5 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
          </svg>
          <span className="group-hover:translate-x-1 transition-transform">{item.label}</span>
        </NavLink>
      ))}

      <div className="mt-auto pt-4 border-t border-md-border/20">
        <div className="px-3 py-3 rounded-xl bg-md-surface/40 border border-md-border/30 space-y-2">
          <p className="text-[10px] font-bold text-md-textMuted uppercase tracking-widest mb-1">Data Sources</p>
          {syncRecords.length === 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-md-textMuted" />
              <span className="text-[10px] text-md-textMuted">No sync data yet</span>
            </div>
          ) : (
            syncRecords.map((r) => (
              <div key={r.source} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(r)}`} />
                <div className="min-w-0">
                  <span className="text-[10px] font-medium text-md-textSecondary">
                    {SOURCE_LABELS[r.source] ?? r.source}
                  </span>
                  <span className="text-[10px] text-md-textMuted ml-1">
                    {r.status === 'failed' ? '— failed' : formatAge(r.synced_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </nav>
  );
}
```

## File: client/src/components/matchups/MetaAdvisor.tsx
```typescript
import { useState, useEffect } from 'react';
import { getMatchupAdvisor, type AdvisorResult, type AdvisorOpponent } from '../../api/matchups';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorBanner from '../common/ErrorBanner';
import axios from 'axios';

function WinRatePill({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1);
  const cls = rate >= 0.55
    ? 'bg-md-green/15 text-md-green border border-md-green/20'
    : rate >= 0.45
    ? 'bg-md-orange/15 text-md-orange border border-md-orange/20'
    : 'bg-md-red/15 text-md-red border border-md-red/20';
  return <span className={`px-2 py-0.5 rounded text-sm font-semibold ${cls}`}>{pct}%</span>;
}

interface Props {
  decks: string[];
}

export default function MetaAdvisor({ decks }: Props) {
  const [selectedDeck, setSelectedDeck] = useState('');
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (decks.length > 0 && !selectedDeck) setSelectedDeck(decks[0]);
  }, [decks, selectedDeck]);

  useEffect(() => {
    if (!selectedDeck) return;
    const controller = new AbortController();
    setLoading(true);
    getMatchupAdvisor(selectedDeck, controller.signal)
      .then(setResult)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedDeck]);

  return (
    <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-md-text">Meta Advisor</h3>
        <span className="text-xs text-md-textMuted">Based on last 3 tournaments</span>
      </div>

      <div>
        <label className="text-sm text-md-textMuted block mb-2">I'm playing:</label>
        <select
          value={selectedDeck}
          onChange={(e) => setSelectedDeck(e.target.value)}
          className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue w-full max-w-sm"
        >
          {decks.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => { setError(''); }} />}

      {loading ? <LoadingSpinner /> : result && result.opponents.length > 0 ? (
        <>
          {/* Vulnerability banner */}
          {(() => {
            const dangerousOpponents = result.opponents.filter((o) => o.win_rate < 0.48 && o.field_pct >= 0.05);
            const totalDangerPct = dangerousOpponents.reduce((s, o) => s + o.field_pct, 0);
            if (dangerousOpponents.length === 0) return (
              <div className="bg-md-green/5 border border-md-green/20 rounded-lg p-3 text-sm">
                <span className="font-semibold text-md-green">Safe</span>
                <span className="text-md-textMuted ml-2">No major threats in the current tournament field.</span>
              </div>
            );
            return (
              <div className="bg-md-orange/5 border border-md-orange/20 rounded-lg p-3 text-sm">
                <span className="font-semibold text-md-orange">
                  {totalDangerPct >= 0.2 ? 'Exposed' : 'Moderate'}
                </span>
                <span className="text-md-textMuted ml-2">
                  {dangerousOpponents.length} predator{dangerousOpponents.length > 1 ? 's' : ''} in the field
                  ({(totalDangerPct * 100).toFixed(0)}% combined):
                  {' '}{dangerousOpponents.map((o) => o.opponent).join(', ')}
                </span>
              </div>
            );
          })()}

          <div className="divide-y divide-md-border">
            {result.opponents.map((o: AdvisorOpponent) => (
              <div key={o.opponent} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="text-sm font-medium">{o.opponent}</span>
                  <span className="text-xs text-md-textMuted ml-2">
                    {(o.field_pct * 100).toFixed(0)}% of field
                  </span>
                </div>
                <WinRatePill rate={o.win_rate} />
              </div>
            ))}
          </div>

          <div className="bg-md-blue/5 border border-md-blue/20 rounded-lg p-3">
            <span className="text-sm font-semibold text-md-blue">
              Expected weighted win rate: {(result.weighted_win_rate * 100).toFixed(1)}%
            </span>
            {result.opponents[0] && result.opponents[0].win_rate < 0.48 && (
              <p className="text-xs text-md-textMuted mt-1">
                Watch out for {result.opponents[0].opponent} ({(result.opponents[0].field_pct * 100).toFixed(0)}% of the field).
              </p>
            )}
          </div>
        </>
      ) : result?.opponents.length === 0 ? (
        <p className="text-sm text-md-textMuted">No tournament field data available yet. Run a sync to populate.</p>
      ) : null}
    </div>
  );
}
```

## File: client/src/index.css
```css
html {
  font-size: 20.8px; /* 16px default × 1.3 — scales all rem-based Tailwind classes */
}

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-md-bg text-md-text min-h-screen antialiased;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
    background-image: radial-gradient(at 15% 30%, rgba(74,142,255,0.03) 0%, transparent 40%),
                      radial-gradient(at 85% 80%, rgba(212,175,55,0.03) 0%, transparent 40%);
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    @apply bg-md-bg rounded-full;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-md-border rounded-full;
  }
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-md-borderLight;
  }

  /* Smooth scrolling */
  * {
    scrollbar-gutter: stable;
  }
}

@layer components {
  /* Enhanced card hover lift effect */
  .card-hover {
    @apply transition-all duration-300 ease-out;
  }
  .card-hover:hover {
    transform: translateY(-6px) scale(1.02);
    box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12);
  }

  /* Featured card glassmorphism with enhanced effects */
  .featured-card {
    background: rgba(17,17,19,0.75);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.08);
    @apply transition-all duration-300;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }
  .featured-card:hover {
    border-color: rgba(255,255,255,0.18);
    background: rgba(17,17,19,0.85);
    box-shadow: 0 12px 40px rgba(0,0,0,0.45);
  }

  /* Enhanced glass surface effect */
  .glass {
    @apply bg-md-surface/80 backdrop-blur-xl border border-md-border/60;
    box-shadow: 0 4px 24px rgba(0,0,0,0.25);
  }
  .glass-subtle {
    @apply bg-md-surface/50 backdrop-blur-sm border border-md-border/40;
    box-shadow: 0 2px 16px rgba(0,0,0,0.15);
  }

  /* Enhanced stat card styling */
  .stat-card {
    @apply bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/50 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
  }
  .stat-card::before {
    content: '';
    @apply absolute inset-0 opacity-0 transition-opacity duration-500;
    background: linear-gradient(135deg, rgba(74,142,255,0.05) 0%, transparent 50%);
  }
  .stat-card:hover::before {
    @apply opacity-100;
  }
  .stat-card::after {
    content: '';
    @apply absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 pointer-events-none;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.2);
  }
  .stat-card:hover::after {
    @apply opacity-100;
  }

  /* Enhanced tier glows */
  .tier-glow-0 {
    box-shadow: 0 0 24px rgba(255, 45, 85, 0.35);
    @apply transition-all duration-300;
  }
  .tier-glow-0:hover {
    box-shadow: 0 0 32px rgba(255, 45, 85, 0.5);
  }

  .tier-glow-1 {
    box-shadow: 0 0 24px rgba(255, 140, 56, 0.35);
    @apply transition-all duration-300;
  }
  .tier-glow-1:hover {
    box-shadow: 0 0 32px rgba(255, 140, 56, 0.5);
  }

  .tier-glow-2 {
    box-shadow: 0 0 24px rgba(255, 214, 10, 0.28);
    @apply transition-all duration-300;
  }
  .tier-glow-2:hover {
    box-shadow: 0 0 32px rgba(255, 214, 10, 0.4);
  }

  .tier-glow-3 {
    box-shadow: 0 0 24px rgba(56, 201, 110, 0.28);
    @apply transition-all duration-300;
  }
  .tier-glow-3:hover {
    box-shadow: 0 0 32px rgba(56, 201, 110, 0.4);
  }

  /* Enhanced gold shimmer text */
  .text-shimmer {
    background: linear-gradient(135deg, #d4af37 0%, #f0d060 40%, #d4af37 60%, #b8962e 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    @apply animate-pulse-soft;
  }

  /* Enhanced accent border top */
  .accent-top {
    @apply relative;
  }
  .accent-top::after {
    content: '';
    @apply absolute top-0 left-6 right-6 h-px;
    background: linear-gradient(90deg, transparent, rgba(74,142,255,0.4), transparent);
  }

  /* Enhanced sidebar active indicator */
  .nav-active {
    @apply relative;
  }
  .nav-active::before {
    content: '';
    @apply absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-gradient-to-b from-md-blue/50 to-md-blue;
    box-shadow: 0 0 8px rgba(74,142,255,0.5);
  }

  /* Loading skeleton animations */
  .skeleton-pulse {
    @apply animate-pulse bg-gradient-to-r from-md-surface/80 via-md-surface to-md-surface/80;
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* Enhanced fade in animation */
  .animate-fade-in {
    animation: fadeInUp 0.4s ease-out forwards;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Soft pulse animation */
  .animate-pulse-soft {
    animation: pulseSoft 3s ease-in-out infinite;
  }

  /* Slide up animation */
  .animate-slide-up {
    animation: slideUp 0.4s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}

/* Custom utility classes */
.gradient-border {
  position: relative;
  background: linear-gradient(135deg, rgba(74,142,255,0.1), rgba(212,175,55,0.1));
  padding: 1px;
  border-radius: 12px;
}

.gradient-border > * {
  background: #111113;
  border-radius: 11px;
}
```

## File: client/src/pages/Dashboard.tsx
```typescript
import { useState, useEffect } from 'react';
import { getTierList, getFeaturedDecks } from '../api/meta';
import type { TierList } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import TopArchetypesGrid from '../components/dashboard/TopArchetypesGrid';
import TierListView from '../components/dashboard/TierListView';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const tierColors = ['#ff2d55', '#ff8c38', '#ffd60a', '#38c96e', '#6b7694'];

interface FeaturedDeck {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  cards: Array<{ name: string; image: string | null }>;
}

export default function Dashboard() {
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [featured, setFeatured] = useState<FeaturedDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, feat] = await Promise.all([getTierList(), getFeaturedDecks()]);
      setTierList(data);
      setFeatured(feat);
    } catch (e: any) {
      setError(e.message || 'Failed to load tier list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-md-blue/30 border-t-md-blue rounded-full animate-spin"></div>
        <p className="text-md-textSecondary">Loading dashboard...</p>
      </div>
    </div>
  );

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!tierList) return null;

  const allDecks = [
    ...tierList['0'].map(d => ({ ...d, tierKey: 0 })),
    ...tierList['1'].map(d => ({ ...d, tierKey: 1 })),
    ...tierList['2'].map(d => ({ ...d, tierKey: 2 })),
    ...tierList['3'].map(d => ({ ...d, tierKey: 3 })),
    ...tierList.rogue.map(d => ({ ...d, tierKey: 4 })),
  ];

  const popularityData = allDecks
    .filter(d => d.power != null)
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .slice(0, 12)
    .map(d => ({ name: d.name, power: d.power, tier: d.tierKey }));

  return (
    <div className="space-y-8 pb-8">
      {/* Hero header with gradient */}
      <div className="relative py-6 px-6 rounded-2xl bg-gradient-to-r from-md-surface/60 to-md-surface/40 border border-md-border/40 backdrop-blur-sm">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMCIvPjxwYXRoIGQ9Ik0wIDBINzAgTDIwIDEwMFoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAxKSIgc3Ryb2tlLXdpZHRoPSIxcHgiLz48L3N2Zz4=')] opacity-5"></div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-md-gold to-md-text bg-clip-text text-transparent">
            Meta Dashboard
          </h1>
          <p className="text-md-textSecondary text-base mt-2 max-w-2xl">
            Current Yu-Gi-Oh! Master Duel tier list and meta analysis with real-time data from multiple sources
          </p>
        </div>
      </div>

      {/* Featured Decks Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-gold to-md-orange"></div>
            <h2 className="text-2xl font-bold text-md-text">Top Performing Decks</h2>
          </div>
          <span className="text-xs text-md-textMuted bg-md-surface px-3 py-1.5 rounded-full border border-md-border font-medium">
            Last 30 days
          </span>
        </div>

        <TopArchetypesGrid featured={featured} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Tier 0', count: tierList['0'].length, color: 'text-tier-0', accent: '#ff2d55', desc: 'Dominant' },
          { label: 'Tier 1', count: tierList['1'].length, color: 'text-tier-1', accent: '#ff8c38', desc: 'Strong' },
          { label: 'Tier 2', count: tierList['2'].length, color: 'text-tier-2', accent: '#ffd60a', desc: 'Viable' },
          { label: 'Total Tracked', count: allDecks.length, color: 'text-md-gold', accent: '#d4af37', desc: 'Decks' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/40 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm group hover:shadow-lg hover:shadow-black/10 transition-all duration-300"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300" style={{ background: `linear-gradient(135deg, ${s.accent}10 0%, transparent 50%)` }}></div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-md-textSecondary uppercase tracking-widest font-bold">{s.label}</p>
                <p className={`text-3xl font-extrabold mt-1 tabular-nums ${s.color}`}>{s.count}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.accent}15` }}>
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: s.accent }}></div>
              </div>
            </div>
            <p className="text-xs text-md-textMuted mt-3">{s.desc}</p>
            <div className="absolute bottom-0 left-0 right-0 h-px opacity-30" style={{ background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)` }} />
          </div>
        ))}
      </div>

      {/* Data sources */}
      <div className="bg-gradient-to-r from-md-surface/60 to-md-surface/40 rounded-2xl p-5 border border-md-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-md-blue animate-pulse"></div>
            <h3 className="text-sm font-bold text-md-text">Data Sources</h3>
          </div>
          <span className="text-xs text-md-textMuted bg-md-surface px-2.5 py-1 rounded-full border border-md-border">
            Real-time
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="px-4 py-2 rounded-xl bg-md-surface border border-md-border/50">
            <span className="text-sm font-semibold text-md-text">MasterDuelMeta</span>
          </div>
          <div className="px-4 py-2 rounded-xl bg-md-surface border border-md-border/50">
            <span className="text-sm font-semibold text-md-text">YGOProDeck</span>
          </div>
          {allDecks.some(d => d.win_rate != null) ? (
            <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-md-winRate/10 to-md-winRate/5 border border-md-winRate/30">
              <span className="text-sm font-bold text-md-winRate">untapped.gg</span>
            </div>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-md-surface border border-md-border/30 opacity-50">
              <span className="text-sm font-semibold text-md-textMuted">untapped.gg</span>
            </div>
          )}
        </div>
      </div>

      {/* Tier List Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-blue to-md-purple"></div>
          <h2 className="text-2xl font-bold text-md-text">Complete Tier List</h2>
        </div>

        <TierListView tierList={tierList} />
      </div>

      {/* Power Rankings Chart */}
      {popularityData.length > 0 && (
        <div className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 border border-md-border/40 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-md-green to-md-blue"></div>
            <h3 className="text-lg font-bold text-md-text">Power Rankings</h3>
            <span className="text-xs text-md-textMuted ml-auto">Top 12 decks</span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={popularityData} layout="vertical" margin={{ left: 120, right: 20 }}>
                <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#a1a1aa"
                  fontSize={12}
                  width={110}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#eceef4' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.65)',
                    fontSize: 13,
                  }}
                  labelStyle={{ color: '#eceef4', fontWeight: 600 }}
                  itemStyle={{ color: '#a1a1aa' }}
                />
                <Bar dataKey="power" radius={[0, 6, 6, 0]} barSize={20}>
                  {popularityData.map((entry, i) => (
                    <Cell key={i} fill={tierColors[entry.tier] || tierColors[4]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
```

## File: client/src/pages/DeckBuilder.tsx
```typescript
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { searchCards } from '../api/cards';
import { scoreDeck, validateDeck } from '../api/meta';
import { useDebounce } from '../hooks/useDebounce';
import SearchInput from '../components/common/SearchInput';
import ErrorBanner from '../components/common/ErrorBanner';
import type { Card } from '../types/card';

interface DeckCard {
  name: string;
  count: number;
  image_small_url: string;
  type: string;
}

function isExtraDeck(type: string): boolean {
  return ['Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster'].some(t => type.includes(t));
}

export default function DeckBuilder() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [extraDeck, setExtraDeck] = useState<DeckCard[]>([]);
  const [score, setScore] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery) { setSearchResults([]); return; }
    const controller = new AbortController();
    setSearching(true);
    searchCards({ q: debouncedQuery, limit: '20' }, controller.signal)
      .then((r) => setSearchResults(r.cards))
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setSearching(false));
    return () => controller.abort();
  }, [debouncedQuery]);

  const addCard = useCallback((card: Card) => {
    const isExtra = isExtraDeck(card.type);
    const setter = isExtra ? setExtraDeck : setMainDeck;

    setter((prev) => {
      const existing = prev.find((c) => c.name === card.name);
      if (existing) {
        if (existing.count >= 3) return prev;
        return prev.map((c) => c.name === card.name ? { ...c, count: c.count + 1 } : c);
      }
      return [...prev, { name: card.name, count: 1, image_small_url: card.image_small_url, type: card.type }];
    });
  }, []);

  const removeCard = useCallback((name: string, isExtra: boolean) => {
    const setter = isExtra ? setExtraDeck : setMainDeck;
    setter((prev) => {
      const card = prev.find((c) => c.name === name);
      if (!card) return prev;
      if (card.count > 1) return prev.map((c) => c.name === name ? { ...c, count: c.count - 1 } : c);
      return prev.filter((c) => c.name !== name);
    });
  }, []);

  const mainCount = mainDeck.reduce((s, c) => s + c.count, 0);
  const extraCount = extraDeck.reduce((s, c) => s + c.count, 0);

  // Score deck
  useEffect(() => {
    const mainNames = mainDeck.flatMap((c) => Array(c.count).fill(c.name));
    const extraNames = extraDeck.flatMap((c) => Array(c.count).fill(c.name));
    if (mainNames.length === 0) { setScore(null); return; }

    const timer = setTimeout(() => {
      scoreDeck(mainNames, extraNames).then(setScore).catch((e) => setError(e.message));
      validateDeck(mainNames, extraNames, []).then(setValidation).catch((e) => setError(e.message));
    }, 500);
    return () => clearTimeout(timer);
  }, [mainDeck, extraDeck]);

  return (
    <div className="flex gap-4 h-[calc(100vh-3.5rem)]">
      {/* Search Panel */}
      <div className="w-72 flex-shrink-0 bg-md-surface border-r border-md-border p-3 overflow-y-auto">
        <SearchInput value={query} onChange={setQuery} placeholder="Search cards to add..." />
        <div className="mt-3 space-y-1">
          {searching && <p className="text-xs text-md-textMuted text-center py-2">Searching...</p>}
          {searchResults.map((card) => (
            <button
              key={card.id}
              onClick={() => addCard(card)}
              className="w-full flex items-center gap-2 p-2 rounded hover:bg-md-surfaceHover transition-colors text-left"
            >
              {card.image_small_url && (
                <img src={card.image_small_url} alt="" className="w-8 h-12 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{card.name}</p>
                <p className="text-xs text-md-textMuted truncate">{card.type}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Deck Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

        {/* Score & Validation */}
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-md-gold">Deck Builder</h2>
          {score && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-md-textMuted">Meta Score:</span>
              <span className={`text-2xl font-bold ${score.score >= 70 ? 'text-md-green' : score.score >= 40 ? 'text-md-orange' : 'text-md-red'}`}>
                {score.score}
              </span>
              <span className="text-sm text-md-textMuted">/100</span>
            </div>
          )}
        </div>

        {validation && !validation.valid && (
          <div className="bg-md-red/10 border border-md-red/30 rounded-lg p-3">
            {validation.errors.map((e: string, i: number) => (
              <p key={i} className="text-sm text-md-red">{e}</p>
            ))}
          </div>
        )}

        {/* Main Deck */}
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="font-semibold mb-3">
            Main Deck <span className={`text-sm ${mainCount < 40 ? 'text-md-red' : mainCount > 60 ? 'text-md-red' : 'text-md-textMuted'}`}>({mainCount}/40-60)</span>
          </h3>
          {mainDeck.length === 0 ? (
            <p className="text-sm text-md-textMuted text-center py-8">Search and click cards to add them</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {mainDeck.map((card) => (
                <button
                  key={card.name}
                  onClick={() => removeCard(card.name, false)}
                  className="relative group"
                  title={`${card.name} (click to remove)`}
                >
                  <img src={card.image_small_url} alt={card.name} className="w-14 h-20 object-cover rounded" />
                  {card.count > 1 && (
                    <span className="absolute -top-1 -right-1 bg-md-blue text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {card.count}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-md-red/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-bold">-1</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Extra Deck */}
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="font-semibold mb-3">
            Extra Deck <span className={`text-sm ${extraCount > 15 ? 'text-md-red' : 'text-md-textMuted'}`}>({extraCount}/15)</span>
          </h3>
          {extraDeck.length === 0 ? (
            <p className="text-sm text-md-textMuted text-center py-4">Fusion/Synchro/XYZ/Link monsters go here</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {extraDeck.map((card) => (
                <button
                  key={card.name}
                  onClick={() => removeCard(card.name, true)}
                  className="relative group"
                  title={`${card.name} (click to remove)`}
                >
                  <img src={card.image_small_url} alt={card.name} className="w-14 h-20 object-cover rounded" />
                  {card.count > 1 && (
                    <span className="absolute -top-1 -right-1 bg-md-purple text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {card.count}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-md-red/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-bold">-1</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Card-level scores */}
        {score?.cardScores && Object.keys(score.cardScores).length > 0 && (
          <div className="bg-md-surface border border-md-border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Card Meta Relevance</h3>
            <div className="space-y-1">
              {Object.entries(score.cardScores)
                .sort(([, a]: any, [, b]: any) => b.score - a.score)
                .slice(0, 20)
                .map(([name, data]: [string, any]) => (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-md-textMuted text-xs">{data.decks.slice(0, 2).join(', ')}</span>
                    <span className={`font-mono w-12 text-right ${data.score > 0 ? 'text-md-green' : 'text-md-textMuted'}`}>
                      {data.score.toFixed(1)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

## File: client/src/pages/MetaTrends.tsx
```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMetaTrends } from '../api/meta';
import { searchCards } from '../api/cards';
import type { MetaSnapshot } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#ff4d5e', '#ff9147', '#ffd60a', '#3dd975', '#4a8eff', '#8b6cff', '#ff6b9d', '#00d4aa', '#f97316', '#d4af37'];

function MiniCardFan({ images }: { images: string[] }) {
  const count = images.length;
  const totalSpread = 24;
  const angles = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -totalSpread / 2 + (i * totalSpread) / (count - 1)
  );
  const xOffsets = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -10 * (count - 1) / 2 + i * 10
  );
  return (
    <div className="relative flex items-end justify-center shrink-0" style={{ height: 72, width: 72 }}>
      {images.map((src, i) => (
        <div
          key={i}
          className="absolute bottom-0"
          style={{
            transform: `translateX(${xOffsets[i]}px) rotate(${angles[i]}deg)`,
            transformOrigin: 'bottom center',
            zIndex: i,
          }}
        >
          <img
            src={src}
            alt=""
            className="rounded shadow-md border border-md-border/50"
            style={{ width: 44, height: 64, objectFit: 'cover' }}
          />
        </div>
      ))}
    </div>
  );
}

export default function MetaTrends() {
  const [trends, setTrends] = useState<Record<string, MetaSnapshot[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<'power' | 'tier'>('power');
  const [timeRange, setTimeRange] = useState(7);
  const [deckImages, setDeckImages] = useState<Record<string, string[]>>({});
  const navigate = useNavigate();

  useEffect(() => {
    getMetaTrends()
      .then(setTrends)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const names = Object.keys(trends);
    if (names.length === 0) return;

    const top = names
      .map((name) => {
        const latest = trends[name]?.find((s) => s.power != null && s.power > 0);
        return { name, power: latest?.power ?? 0 };
      })
      .filter((d) => d.power > 0)
      .sort((a, b) => b.power - a.power)
      .slice(0, 10)
      .map((d) => d.name);

    const SUFFIXES = new Set(['engine', 'deck', 'turbo', 'combo', 'control', 'stun']);

    async function findImages(deckName: string): Promise<string[]> {
      const extract = (cards: { image_small_url: string }[]) =>
        cards.filter((c) => c.image_small_url).slice(0, 3).map((c) => c.image_small_url);

      const words = deckName.trim().split(/\s+/);
      while (words.length > 1 && SUFFIXES.has(words[words.length - 1].toLowerCase())) {
        words.pop();
      }
      const baseWords = [...words];

      // 1. Try exact archetype match, progressively dropping last word
      while (words.length > 0) {
        const archetype = words.join(' ');
        const candidates = [archetype];
        if (archetype.endsWith('s') || archetype.endsWith('S')) candidates.push(archetype.slice(0, -1));
        for (const a of candidates) {
          const result = await searchCards({ archetype: a, limit: '3', sort: 'name' });
          const imgs = extract(result.cards);
          if (imgs.length > 0) return imgs;
        }
        words.pop();
      }

      // 2. Fallback: text search on card names using singular base form
      const base = baseWords.join(' ');
      const qCandidates = [base];
      if (base.endsWith('s') || base.endsWith('S')) qCandidates.push(base.slice(0, -1));
      for (const q of qCandidates) {
        const result = await searchCards({ q, limit: '3', sort: 'name' });
        const imgs = extract(result.cards);
        if (imgs.length > 0) return imgs;
      }

      return [];
    }

    Promise.allSettled(top.map((name) => findImages(name))).then((results) => {
      const images: Record<string, string[]> = {};
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.length > 0) images[top[i]] = result.value;
      });
      setDeckImages(images);
    });
  }, [trends]);

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorBanner message={error} />;

  const deckNames = Object.keys(trends);
  const hasRealData = deckNames.some((name) =>
    trends[name]?.some((s) => s.power != null && s.power > 0)
  );

  if (deckNames.length === 0 || !hasRealData) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold"><span className="text-shimmer">Meta Trends</span></h2>
        <div className="bg-md-surface border border-md-border rounded-xl p-10 text-center text-md-textMuted">
          No trend data yet. Run a meta sync to capture the first snapshot.
        </div>
      </div>
    );
  }

  const dates = new Set<string>();
  for (const snapshots of Object.values(trends)) {
    for (const s of snapshots) dates.add(s.snapshot_date);
  }
  const sortedDates = Array.from(dates).sort();

  const topDecks = deckNames
    .map((name) => {
      const latest = trends[name]?.find((s) => s.power != null && s.power > 0);
      return { name, power: latest?.power ?? 0 };
    })
    .filter((d) => d.power > 0)
    .sort((a, b) => b.power - a.power)
    .slice(0, 10)
    .map((d) => d.name);

  const chartData = sortedDates.map((date) => {
    const point: Record<string, any> = { date };
    for (const dn of topDecks) {
      const snap = trends[dn]?.find((s) => s.snapshot_date === date);
      point[dn] = metric === 'power'
        ? (snap?.power != null ? snap.power : null)
        : (snap?.tier != null ? snap.tier : null);
    }
    return point;
  }).filter((point) => topDecks.some((dn) => point[dn] != null));

  const visibleData = chartData.slice(-Math.min(timeRange, chartData.length));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight"><span className="text-shimmer">Meta Trends</span></h2>
        <div className="flex gap-1 bg-md-surface border border-md-border rounded-lg p-0.5">
          {(['power', 'tier'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 capitalize ${
                metric === m
                  ? 'bg-md-blue/15 text-md-blue shadow-sm'
                  : 'text-md-textMuted hover:text-md-textSecondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 px-1">
        <span className="text-xs text-md-textMuted whitespace-nowrap">Last {Math.min(timeRange, chartData.length)} of {chartData.length}</span>
        <input
          type="range"
          min={2}
          max={chartData.length}
          value={Math.min(timeRange, chartData.length)}
          onChange={(e) => setTimeRange(Number(e.target.value))}
          className="w-full accent-md-blue"
        />
        <span className="text-xs text-md-textMuted whitespace-nowrap">All</span>
      </div>

      <div className="bg-md-surface border border-md-border rounded-xl p-5">
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={visibleData}>
            <XAxis dataKey="date" stroke="#6b7694" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#6b7694"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              reversed={metric === 'tier'}
              domain={metric === 'tier' ? [0, 3] : ['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#141a2e',
                border: '1px solid #1e2740',
                borderRadius: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                fontSize: 12,
              }}
              labelStyle={{ color: '#eceef4', fontWeight: 600 }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 16, fontSize: 11 }}
              iconType="circle"
              iconSize={8}
            />
            {topDecks.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: '#0f1423' }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Deck table */}
      <div className="bg-md-surface border border-md-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-md-border/60">
              <th className="text-left px-5 py-3 text-[11px] text-md-textMuted uppercase tracking-wider font-medium">Deck</th>
              <th className="text-center px-4 py-3 text-[11px] text-md-textMuted uppercase tracking-wider font-medium">Data Points</th>
              <th className="text-right px-5 py-3 text-[11px] text-md-textMuted uppercase tracking-wider font-medium">Latest Power</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-md-border/40">
            {topDecks.map((name, i) => {
              const snaps = trends[name] || [];
              const latest = snaps.find((s) => s.power != null && s.power > 0) || snaps[0];
              const imgs = deckImages[name];
              return (
                <tr key={name} className="hover:bg-md-surfaceHover/50 transition-colors cursor-pointer" onClick={() => navigate(`/decks/${encodeURIComponent(name)}`)}>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {imgs && imgs.length > 0 && <MiniCardFan images={imgs} />}
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                  </td>
                  <td className="text-center px-4 py-2 text-sm text-md-textMuted font-mono align-middle">{snaps.length}</td>
                  <td className="text-right px-5 py-2 text-sm font-semibold font-mono align-middle">{latest?.power?.toFixed(1) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## File: client/src/types/card.ts
```typescript
export interface Card {
  id: number;
  name: string;
  type: string;
  frame_type: string;
  description: string;
  atk: number | null;
  def: number | null;
  level: number | null;
  race: string;
  attribute: string | null;
  archetype: string | null;
  link_val: number | null;
  link_markers: string | null;
  scale: number | null;
  image_url: string;
  image_small_url: string;
  image_cropped_url: string;
  ban_status_md: string | null;
  md_rarity: string | null;
  negate_effectiveness: number | null;
  negated_win_rate: number | null;
  not_negated_win_rate: number | null;
  negate_sample_size: number | null;
}

export interface CardSearchResult {
  cards: Card[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited' | null;
```

## File: server/src/routes/cards.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import * as ygopd from '../services/ygoprodeckService.js';

const router = Router();

router.get('/archetypes', async (_req: Request, res: Response) => {
  try {
    const archetypes = await ygopd.getArchetypes();
    res.json(archetypes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, type, attribute, archetype, banStatus, atkMin, atkMax, defMin, defMax, level, sort = 'name', page = '1', limit = '30' } = req.query as Record<string, string>;

    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (q) { conditions.push(`name ILIKE $${paramIndex++}`); params.push(`%${q}%`); }
    if (type) {
      if (type === 'Ritual Monster') {
        conditions.push(`type ILIKE $${paramIndex++}`); params.push('%Ritual%');
      } else {
        conditions.push(`type = $${paramIndex++}`); params.push(type);
      }
    }
    if (attribute) { conditions.push(`attribute = $${paramIndex++}`); params.push(attribute); }
    if (archetype) { conditions.push(`archetype = $${paramIndex++}`); params.push(archetype); }
    if (banStatus) { conditions.push(`ban_status_md = $${paramIndex++}`); params.push(banStatus); }
    if (atkMin) { conditions.push(`atk >= $${paramIndex++}`); params.push(parseInt(atkMin)); }
    if (atkMax) { conditions.push(`atk <= $${paramIndex++}`); params.push(parseInt(atkMax)); }
    if (defMin) { conditions.push(`def >= $${paramIndex++}`); params.push(parseInt(defMin)); }
    if (defMax) { conditions.push(`def <= $${paramIndex++}`); params.push(parseInt(defMax)); }
    if (level) { conditions.push(`level = $${paramIndex++}`); params.push(parseInt(level)); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    if (sort === 'popular') {
      // Build frequency map from tournament top decks
      const topDecks = await queryAll(pool, 'SELECT main_deck_json FROM top_decks WHERE main_deck_json IS NOT NULL');
      const freq = new Map<string, number>();
      for (const td of topDecks) {
        try {
          const cards = JSON.parse(td.main_deck_json);
          for (const c of cards) {
            const name = c.cardName?.toLowerCase();
            if (name) freq.set(name, (freq.get(name) || 0) + 1);
          }
        } catch {}
      }

      const allCards = await queryAll(pool, `SELECT * FROM cards ${where} ORDER BY name`, params);
      allCards.sort((a: any, b: any) => {
        const fa = freq.get(a.name.toLowerCase()) || 0;
        const fb = freq.get(b.name.toLowerCase()) || 0;
        return fb - fa;
      });

      const total = allCards.length;
      const cards = allCards.slice(offset, offset + limitNum);
      res.json({ cards, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
    } else {
      const countRow = await queryOne(pool, `SELECT COUNT(*) as total FROM cards ${where}`, params);
      const cards = await queryAll(pool, `SELECT * FROM cards ${where} ORDER BY name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`, [...params, limitNum, offset]);
      res.json({ cards, total: countRow?.total || 0, page: pageNum, limit: limitNum, totalPages: Math.ceil((countRow?.total || 0) / limitNum) });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const card = await queryOne(pool, 'SELECT * FROM cards WHERE id = $1', [parseInt(req.params.id)]);
    if (!card) {
      const fetched = await ygopd.getCardById(parseInt(req.params.id));
      if (!fetched) return res.status(404).json({ error: 'Card not found' });
      return res.json(fetched);
    }
    res.json(card);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## File: server/src/services/ecosystemAnalysisService.ts
```typescript
import type { Pool } from '@neondatabase/serverless';
import { queryAll } from '../utils/dbHelpers.js';
import { buildFullMatrix, type MatrixCell } from './matchupBlendService.js';

// ── Types ──

export interface PredatorPreyRelationship {
  predator: string;
  prey: string;
  win_rate: number;
  strength: 'hard_counter' | 'soft_counter' | 'slight_edge';
  meta_impact: number;
  confidence: 'high' | 'medium' | 'low';
  sample_size: number;
  mechanism: 'direct' | 'inferred';
}

export interface GameTheoryProfile {
  expected_payoff: number;         // expected WR against current field distribution
  nash_deviation: number;          // how far current play rate is from Nash equilibrium (-1 to 1)
  best_response_to: string | null; // this deck is the optimal counter-pick to which popular deck
  dominated_by: string[];          // decks that beat this one in EVERY matchup it plays
  dominates: string[];             // decks this one beats in EVERY matchup they play
  strategy_type: 'dominant' | 'counter_pick' | 'generalist' | 'niche' | 'dominated';
}

export interface TournamentFieldEntry {
  deck: string;
  field_pct: number;
  top_cut_pct: number;
  conversion_rate: number; // top_cut_pct / field_pct — how well it converts
  appearances: number;
}

export interface DeckEcosystemProfile {
  deck: string;
  tier: number | null;
  power: number | null;
  win_rate: number | null;
  play_rate: number | null;
  predators: PredatorPreyRelationship[];
  prey: PredatorPreyRelationship[];
  neutral: string[];
  polarization_index: number;
  suppression_score: number;
  vulnerability_score: number;
  meta_fitness: number;
  matchup_spread: number;
  game_theory: GameTheoryProfile;
}

export interface RockPaperScissorsCycle {
  decks: string[];
  cycle_strength: number;
  meta_relevance: number;
}

export interface EcosystemAnalysis {
  profiles: DeckEcosystemProfile[];
  cycles: RockPaperScissorsCycle[];
  food_chain: PredatorPreyRelationship[];
  meta_health_index: number;
  tournament_field: TournamentFieldEntry[];
  nash_equilibrium: Record<string, number>; // deck -> optimal play rate
  computed_at: string;
}

// ── Helpers ──

interface DeckMeta {
  tier: number | null;
  power: number | null;
  win_rate: number | null;
  play_rate: number | null;
}

function classifyStrength(rate: number): 'hard_counter' | 'soft_counter' | 'slight_edge' {
  if (rate >= 0.60) return 'hard_counter';
  if (rate >= 0.55) return 'soft_counter';
  return 'slight_edge';
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 5) return 0;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// ── Tournament field composition ──

async function buildTournamentField(pool: Pool, decks: string[]): Promise<TournamentFieldEntry[]> {
  const tournaments = await queryAll(pool,
    'SELECT placements_json FROM tournaments ORDER BY updated_at DESC LIMIT 5'
  ) as { placements_json: string }[];

  const deckCounts: Record<string, { total: number; topCut: number }> = {};
  let grandTotal = 0;

  for (const t of tournaments) {
    let placements: any[] = [];
    try { placements = JSON.parse(t.placements_json || '[]'); } catch { continue; }

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const name: string | undefined = p.deck_type_name || p.deckType || p.deck || p.name;
      if (!name) continue;

      if (!deckCounts[name]) deckCounts[name] = { total: 0, topCut: 0 };
      deckCounts[name].total++;
      // Top cut = top 25% of placements
      if (i < placements.length * 0.25) deckCounts[name].topCut++;
      grandTotal++;
    }
  }

  if (grandTotal === 0) return [];

  const deckSet = new Set(decks.map((d) => d.toLowerCase()));
  return Object.entries(deckCounts)
    .filter(([name]) => deckSet.has(name.toLowerCase()))
    .map(([deck, counts]) => {
      const fieldPct = counts.total / grandTotal;
      const topCutPct = counts.topCut / grandTotal;
      return {
        deck,
        field_pct: fieldPct,
        top_cut_pct: topCutPct,
        conversion_rate: fieldPct > 0 ? topCutPct / fieldPct : 0,
        appearances: counts.total,
      };
    })
    .sort((a, b) => b.field_pct - a.field_pct);
}

// ── Game Theory: Nash Equilibrium approximation ──
// Uses fictitious play: iteratively compute best responses until convergence

function computeNashEquilibrium(
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
): Record<string, number> {
  const n = decks.length;
  if (n === 0) return {};

  // Build payoff matrix (row = player's deck, col = opponent's deck, value = win rate)
  const payoff: number[][] = [];
  for (let i = 0; i < n; i++) {
    payoff[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { payoff[i][j] = 0.5; continue; }
      payoff[i][j] = matrix[decks[i]]?.[decks[j]]?.rate ?? 0.5;
    }
  }

  // Fictitious play: track cumulative counts of each strategy
  const counts = new Array(n).fill(1); // start uniform
  const iterations = 200;

  for (let iter = 0; iter < iterations; iter++) {
    const total = counts.reduce((s: number, v: number) => s + v, 0);
    const freq = counts.map((c: number) => c / total);

    // Find best response: deck with highest expected payoff against current distribution
    let bestIdx = 0, bestPayoff = -1;
    for (let i = 0; i < n; i++) {
      let ep = 0;
      for (let j = 0; j < n; j++) {
        ep += payoff[i][j] * freq[j];
      }
      if (ep > bestPayoff) { bestPayoff = ep; bestIdx = i; }
    }
    counts[bestIdx]++;
  }

  const total = counts.reduce((s: number, v: number) => s + v, 0);
  const result: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    result[decks[i]] = counts[i] / total;
  }
  return result;
}

// ── Game Theory: per-deck strategy classification ──

function computeGameTheoryProfile(
  deck: string,
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  deckMeta: Record<string, DeckMeta>,
  nashEq: Record<string, number>,
  tournamentField: TournamentFieldEntry[],
): GameTheoryProfile {
  // Expected payoff: weighted average WR against field (use tournament field if available, else play rates)
  const fieldMap = new Map(tournamentField.map((e) => [e.deck.toLowerCase(), e.field_pct]));

  let totalWeight = 0, weightedPayoff = 0;
  for (const other of decks) {
    if (other === deck) continue;
    const cell = matrix[deck]?.[other];
    const rate = cell?.rate ?? 0.5;
    // Prefer tournament field composition, fall back to untapped play rate
    const weight = fieldMap.get(other.toLowerCase()) ?? (deckMeta[other]?.play_rate ?? 0);
    if (weight > 0) {
      weightedPayoff += rate * weight;
      totalWeight += weight;
    }
  }
  const expectedPayoff = totalWeight > 0 ? weightedPayoff / totalWeight : 0.5;

  // Nash deviation: actual play rate vs Nash equilibrium play rate
  const actualPlayRate = deckMeta[deck]?.play_rate ?? 0;
  const nashRate = nashEq[deck] ?? (1 / decks.length);
  // Positive = overplayed, negative = underplayed relative to equilibrium
  const nashDeviation = nashRate > 0 ? (actualPlayRate - nashRate) / nashRate : 0;

  // Best response to: which popular deck (>5% play rate) does this deck counter best?
  let bestResponseTo: string | null = null;
  let bestResponseRate = 0;
  for (const other of decks) {
    if (other === deck) continue;
    const otherPlayRate = deckMeta[other]?.play_rate ?? 0;
    if (otherPlayRate < 0.03) continue; // only consider relevant decks
    const cell = matrix[deck]?.[other];
    if (cell && cell.rate > bestResponseRate) {
      bestResponseRate = cell.rate;
      bestResponseTo = other;
    }
  }
  // Only report if it's actually a counter (>55%)
  if (bestResponseRate < 0.55) bestResponseTo = null;

  // Dominance: check if any other deck beats this one in every matchup
  const dominated_by: string[] = [];
  const dominates: string[] = [];

  for (const other of decks) {
    if (other === deck) continue;
    // Does `other` dominate `deck`? (other beats every opponent that deck faces, by a better margin)
    let otherDominates = true;
    let thisDominates = true;
    let comparisonCount = 0;

    for (const opponent of decks) {
      if (opponent === deck || opponent === other) continue;
      const myRate = matrix[deck]?.[opponent]?.rate;
      const theirRate = matrix[other]?.[opponent]?.rate;
      if (myRate == null || theirRate == null) continue;
      comparisonCount++;
      if (theirRate <= myRate) otherDominates = false;
      if (myRate <= theirRate) thisDominates = false;
    }

    if (comparisonCount >= 3) {
      if (otherDominates) dominated_by.push(other);
      if (thisDominates) dominates.push(other);
    }
  }

  // Strategy type classification
  let strategy_type: GameTheoryProfile['strategy_type'];
  if (dominated_by.length > 0) {
    strategy_type = 'dominated';
  } else if (dominates.length > 0) {
    strategy_type = 'dominant';
  } else if (bestResponseTo && bestResponseRate >= 0.58) {
    strategy_type = 'counter_pick';
  } else {
    // Check matchup variance — low variance = generalist, high variance = niche
    const rates: number[] = [];
    for (const other of decks) {
      if (other === deck) continue;
      const cell = matrix[deck]?.[other];
      if (cell) rates.push(cell.rate);
    }
    const avg = rates.length > 0 ? rates.reduce((s, v) => s + v, 0) / rates.length : 0.5;
    const variance = rates.length > 1
      ? rates.reduce((s, v) => s + (v - avg) ** 2, 0) / rates.length
      : 0;
    strategy_type = variance < 0.003 ? 'generalist' : 'niche';
  }

  return {
    expected_payoff: expectedPayoff,
    nash_deviation: Math.max(-1, Math.min(1, nashDeviation)),
    best_response_to: bestResponseTo,
    dominated_by,
    dominates,
    strategy_type,
  };
}

// ── Main computation ──

export async function computeEcosystemAnalysis(pool: Pool, source: string = 'blended'): Promise<EcosystemAnalysis> {
  const { decks, matrix } = await buildFullMatrix(pool, source);

  // Load deck metadata
  const placeholders = decks.map((_, i) => `$${i + 1}`).join(',');
  const deckMetaRows = await queryAll(pool,
    'SELECT name, tier, power, win_rate, play_rate FROM deck_types WHERE name IN (' +
    placeholders + ')',
    decks
  ) as (DeckMeta & { name: string })[];

  const deckMeta: Record<string, DeckMeta> = {};
  for (const row of deckMetaRows) {
    // DB stores win_rate and play_rate as percentages (0-100); normalise to 0-1
    deckMeta[row.name] = {
      tier: row.tier,
      power: row.power,
      win_rate: row.win_rate != null ? row.win_rate / 100 : null,
      play_rate: row.play_rate != null ? row.play_rate / 100 : null,
    };
  }

  // Tournament field composition from recent events
  const tournamentField = await buildTournamentField(pool, decks);

  // Nash equilibrium via fictitious play
  const nashEq = computeNashEquilibrium(decks, matrix);

  // Step 1: Classify all pairwise relationships
  const allRelationships: PredatorPreyRelationship[] = [];

  for (const a of decks) {
    for (const b of decks) {
      if (a === b) continue;
      const cell = matrix[a]?.[b];
      if (!cell) continue;
      if (cell.rate < 0.52) continue; // a doesn't have an edge over b

      const opponentPlayRate = deckMeta[b]?.play_rate ?? 0;
      const metaImpact = (cell.rate - 0.5) * opponentPlayRate;

      allRelationships.push({
        predator: a,
        prey: b,
        win_rate: cell.rate,
        strength: classifyStrength(cell.rate),
        meta_impact: metaImpact,
        confidence: cell.confidence,
        sample_size: cell.n_untapped + cell.n_tournament,
        mechanism: 'direct',
      });
    }
  }

  // Step 2: Tournament anti-correlation inference for missing pairs
  const inferredRelationships = await inferFromTournamentCorrelation(pool, decks, matrix, deckMeta);
  allRelationships.push(...inferredRelationships);

  // Step 3: Build per-deck profiles
  const profiles: DeckEcosystemProfile[] = decks.map((deck) => {
    const meta = deckMeta[deck] || { tier: null, power: null, win_rate: null, play_rate: null };

    const prey = allRelationships.filter((r) => r.predator === deck);
    const predators = allRelationships.filter((r) => r.prey === deck);
    const involvedDecks = new Set([...prey.map((r) => r.prey), ...predators.map((r) => r.predator)]);
    const neutral = decks.filter((d) => d !== deck && !involvedDecks.has(d));

    // Polarization: stdev of all win rates against opponents
    const rates: number[] = [];
    for (const other of decks) {
      if (other === deck) continue;
      const cell = matrix[deck]?.[other];
      if (cell) rates.push(cell.rate);
    }
    // Normalize: max theoretical stdev for rates in [0,1] is 0.5
    const polarizationIndex = rates.length >= 3 ? Math.min(stddev(rates) / 0.5, 1) : -1;

    // Matchup spread: best - worst
    const matchupSpread = rates.length >= 2 ? Math.max(...rates) - Math.min(...rates) : 0;

    // Suppression score: how much this deck's presence hurts others
    const myPlayRate = meta.play_rate ?? 0;
    let suppressionScore = 0;
    for (const r of prey) {
      suppressionScore += (r.win_rate - 0.5) * myPlayRate;
    }

    // Vulnerability score: how exposed to popular counters
    let vulnerabilityScore = 0;
    for (const r of predators) {
      const predatorPlayRate = deckMeta[r.predator]?.play_rate ?? 0;
      vulnerabilityScore += (r.win_rate - 0.5) * predatorPlayRate;
    }

    // Meta fitness: weighted win rate against the field
    // Prefer tournament field composition for weighting, fall back to play rates
    const fieldMap = new Map(tournamentField.map((e) => [e.deck.toLowerCase(), e.field_pct]));
    let totalWeight = 0, weightedWR = 0;
    for (const other of decks) {
      if (other === deck) continue;
      const cell = matrix[deck]?.[other];
      const weight = fieldMap.get(other.toLowerCase()) ?? (deckMeta[other]?.play_rate ?? 0);
      if (cell && weight > 0) {
        weightedWR += cell.rate * weight;
        totalWeight += weight;
      }
    }
    const metaFitness = totalWeight > 0 ? weightedWR / totalWeight : (meta.win_rate ?? 0.5);

    // Game theory profile
    const gameTheory = computeGameTheoryProfile(deck, decks, matrix, deckMeta, nashEq, tournamentField);

    return {
      deck,
      tier: meta.tier,
      power: meta.power,
      win_rate: meta.win_rate,
      play_rate: meta.play_rate,
      predators: predators.sort((a, b) => b.meta_impact - a.meta_impact),
      prey: prey.sort((a, b) => b.meta_impact - a.meta_impact),
      neutral,
      polarization_index: polarizationIndex,
      suppression_score: suppressionScore,
      vulnerability_score: vulnerabilityScore,
      meta_fitness: metaFitness,
      matchup_spread: matchupSpread,
      game_theory: gameTheory,
    };
  });

  // Step 4: Detect RPS cycles (A>B>C>A where each edge >= 55%)
  const cycles = detectRPSCycles(decks, matrix, deckMeta);

  // Step 5: Meta health index
  const playRates = decks.map((d) => deckMeta[d]?.play_rate ?? 0).filter((r) => r > 0);
  let metaHealthIndex = 0.5;
  if (playRates.length >= 2) {
    const maxPR = Math.max(...playRates);
    const avgPR = playRates.reduce((s, v) => s + v, 0) / playRates.length;
    metaHealthIndex = maxPR > 0 ? 1 - (maxPR - avgPR) / maxPR : 0.5;
  }

  // Sort food chain by meta_impact descending
  const foodChain = [...allRelationships]
    .filter((r) => r.strength !== 'slight_edge')
    .sort((a, b) => b.meta_impact - a.meta_impact);

  return {
    profiles,
    cycles,
    food_chain: foodChain,
    meta_health_index: metaHealthIndex,
    tournament_field: tournamentField,
    nash_equilibrium: nashEq,
    computed_at: new Date().toISOString(),
  };
}

// ── Inference: Tournament anti-correlation ──

async function inferFromTournamentCorrelation(
  pool: Pool,
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  deckMeta: Record<string, DeckMeta>,
): Promise<PredatorPreyRelationship[]> {
  const inferred: PredatorPreyRelationship[] = [];

  // Get last 14+ days of snapshots
  const snapshots = await queryAll(pool,
    "SELECT deck_type_name, power, snapshot_date FROM meta_snapshots WHERE snapshot_date::date >= CURRENT_DATE - INTERVAL '30 days' ORDER BY snapshot_date"
  ) as { deck_type_name: string; power: number; snapshot_date: string }[];

  if (snapshots.length < 10) return inferred;

  // Group by deck -> date-ordered power values
  const deckPowerSeries: Record<string, { date: string; power: number }[]> = {};
  for (const s of snapshots) {
    if (!deckPowerSeries[s.deck_type_name]) deckPowerSeries[s.deck_type_name] = [];
    deckPowerSeries[s.deck_type_name].push({ date: s.snapshot_date, power: s.power });
  }

  // For pairs without direct matchup data, check anti-correlation
  for (let i = 0; i < decks.length; i++) {
    for (let j = i + 1; j < decks.length; j++) {
      const a = decks[i], b = decks[j];
      // Skip if we already have direct data in both directions
      if (matrix[a]?.[b] && matrix[b]?.[a]) continue;

      const seriesA = deckPowerSeries[a];
      const seriesB = deckPowerSeries[b];
      if (!seriesA || !seriesB) continue;

      // Align on shared dates
      const datesA = new Map(seriesA.map((s) => [s.date, s.power]));
      const aligned: { pa: number; pb: number }[] = [];
      for (const sb of seriesB) {
        const pa = datesA.get(sb.date);
        if (pa !== undefined) aligned.push({ pa, pb: sb.power });
      }
      if (aligned.length < 5) continue;

      const r = pearsonCorrelation(aligned.map((p) => p.pa), aligned.map((p) => p.pb));
      if (r >= -0.5) continue; // Not anti-correlated enough

      // Strong anti-correlation: when A rises B falls → A might be suppressing B
      // Determine direction: the one currently rising is the predator
      const recentA = seriesA.slice(-5);
      const recentB = seriesB.slice(-5);
      const trendA = recentA.length >= 2 ? recentA[recentA.length - 1].power - recentA[0].power : 0;
      const trendB = recentB.length >= 2 ? recentB[recentB.length - 1].power - recentB[0].power : 0;

      const predator = trendA > trendB ? a : b;
      const prey = predator === a ? b : a;
      const opponentPlayRate = deckMeta[prey]?.play_rate ?? 0;

      inferred.push({
        predator,
        prey,
        win_rate: 0.55, // Estimated — we don't have exact data
        strength: 'soft_counter',
        meta_impact: 0.05 * opponentPlayRate, // Conservative estimate
        confidence: 'low',
        sample_size: 0,
        mechanism: 'inferred',
      });
    }
  }

  return inferred;
}

// ── RPS Cycle Detection ──

function detectRPSCycles(
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  deckMeta: Record<string, DeckMeta>,
): RockPaperScissorsCycle[] {
  const cycles: RockPaperScissorsCycle[] = [];

  // Build adjacency: edge A->B if A has >= 55% vs B
  const edges: Record<string, Set<string>> = {};
  const edgeRates: Record<string, number> = {};
  for (const a of decks) {
    edges[a] = new Set();
    for (const b of decks) {
      if (a === b) continue;
      const cell = matrix[a]?.[b];
      if (cell && cell.rate >= 0.55) {
        edges[a].add(b);
        edgeRates[`${a}|${b}`] = cell.rate;
      }
    }
  }

  // Find all 3-cycles
  const seen = new Set<string>();
  for (const a of decks) {
    for (const b of edges[a] || []) {
      for (const c of edges[b] || []) {
        if (c === a || c === b) continue;
        if (!edges[c]?.has(a)) continue;

        const key = [a, b, c].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const strength = (
          edgeRates[`${a}|${b}`] + edgeRates[`${b}|${c}`] + edgeRates[`${c}|${a}`]
        ) / 3;

        const relevance = (
          (deckMeta[a]?.play_rate ?? 0) +
          (deckMeta[b]?.play_rate ?? 0) +
          (deckMeta[c]?.play_rate ?? 0)
        );

        cycles.push({
          decks: [a, b, c],
          cycle_strength: strength,
          meta_relevance: relevance,
        });
      }
    }
  }

  // Sort by relevance, limit to top 5
  return cycles.sort((a, b) => b.meta_relevance - a.meta_relevance).slice(0, 5);
}
```

## File: server/src/services/matchupBlendService.ts
```typescript
import type { Pool } from '@neondatabase/serverless';
import { queryAll } from '../utils/dbHelpers.js';
import { computeEcosystemAnalysis } from './ecosystemAnalysisService.js';

export interface MatchupSource {
  rate: number;
  n: number;
}

export interface BlendResult {
  rate: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface MatrixCell {
  rate: number;
  n_untapped: number;
  n_tournament: number;
  confidence: 'high' | 'medium' | 'low';
  inferred?: boolean;
  inference_method?: string;
}

export interface FullMatrix {
  decks: string[];
  matrix: Record<string, Record<string, MatrixCell>>;
}

export function blendMatchupRates(
  untapped: MatchupSource | null,
  tournament: MatchupSource | null,
  weights = { untapped: 0.7, tournament: 0.3 }
): BlendResult {
  if (!untapped && !tournament) return { rate: 0.5, confidence: 'low' };
  if (!untapped) return { rate: tournament!.rate, confidence: tournament!.n >= 30 ? 'medium' : 'low' };
  if (!tournament) return { rate: untapped.rate, confidence: untapped.n >= 100 ? 'high' : 'medium' };
  const rate = untapped.rate * weights.untapped + tournament.rate * weights.tournament;
  return { rate, confidence: 'high' };
}

/**
 * Build the full NxN matchup matrix for tier 1-3 decks, blending data sources.
 * When infer=true, fills gaps using ecosystem analysis (predator/prey relationships,
 * inverse matchups, and win-rate estimation).
 */
export async function buildFullMatrix(pool: Pool, source: string = 'blended', infer: boolean = false): Promise<FullMatrix> {
  const decks = (await queryAll(pool,
    'SELECT name FROM deck_types WHERE tier IS NOT NULL AND tier <= 3 ORDER BY tier, name'
  ) as { name: string }[]).map((d) => d.name);

  const rows = await queryAll(pool, 'SELECT * FROM matchup_sources') as {
    deck_a: string; deck_b: string; source: string; win_rate: number; sample_size: number;
  }[];

  const legacyRows = await queryAll(pool, 'SELECT deck_a, deck_b, win_rate_a, sample_size FROM matchups') as {
    deck_a: string; deck_b: string; win_rate_a: number; sample_size: number;
  }[];

  const matrix: Record<string, Record<string, MatrixCell>> = {};

  for (const a of decks) {
    matrix[a] = {};
    for (const b of decks) {
      if (a === b) continue;

      const al = a.toLowerCase(), bl = b.toLowerCase();
      const sourceRow  = rows.find((r) => r.deck_a.toLowerCase() === al && r.deck_b.toLowerCase() === bl && r.source === 'untapped');
      const tournRow   = rows.find((r) => r.deck_a.toLowerCase() === al && r.deck_b.toLowerCase() === bl && r.source === 'tournament');
      const legacyRow  = legacyRows.find((r) => r.deck_a.toLowerCase() === al && r.deck_b.toLowerCase() === bl);

      const untappedData = sourceRow
        ? { rate: sourceRow.win_rate, n: sourceRow.sample_size ?? 0 }
        : legacyRow
        ? { rate: legacyRow.win_rate_a / 100, n: legacyRow.sample_size ?? 0 }
        : null;
      const tournData = tournRow ? { rate: tournRow.win_rate, n: tournRow.sample_size ?? 0 } : null;

      if (!untappedData && !tournData) continue;
      if (source === 'tournament' && !tournData) continue;
      if (source === 'untapped' && !untappedData) continue;

      const blend = source === 'tournament'
        ? blendMatchupRates(null, tournData)
        : source === 'untapped'
        ? blendMatchupRates(untappedData, null)
        : blendMatchupRates(untappedData, tournData);

      matrix[a][b] = {
        rate: blend.rate,
        n_untapped: untappedData?.n ?? 0,
        n_tournament: tournData?.n ?? 0,
        confidence: blend.confidence,
      };
    }
  }

  // Fill gaps with inferred data from ecosystem analysis
  if (infer) {
    await fillMatrixGaps(pool, decks, matrix, source);
  }

  return { decks, matrix };
}

/**
 * Fill empty matrix cells using multiple inference strategies:
 * 1. Inverse: if B vs A exists, A vs B = 1 - B_vs_A
 * 2. Ecosystem predator/prey relationships (direct + tournament-correlated)
 * 3. Win-rate estimation from overall deck strength
 */
async function fillMatrixGaps(
  pool: Pool,
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  source: string
): Promise<void> {
  // Pass 1: Inverse inference — if we have B vs A but not A vs B
  for (const a of decks) {
    for (const b of decks) {
      if (a === b || matrix[a]?.[b]) continue;
      const inverse = matrix[b]?.[a];
      if (inverse) {
        if (!matrix[a]) matrix[a] = {};
        matrix[a][b] = {
          rate: 1 - inverse.rate,
          n_untapped: inverse.n_untapped,
          n_tournament: inverse.n_tournament,
          confidence: inverse.confidence,
          inferred: true,
          inference_method: 'inverse',
        };
      }
    }
  }

  // Pass 2: Ecosystem relationships (predator/prey + anti-correlation)
  try {
    const ecosystem = await computeEcosystemAnalysis(pool, source);
    const deckSet = new Set(decks.map((d) => d.toLowerCase()));

    for (const profile of ecosystem.profiles) {
      const aName = decks.find((d) => d.toLowerCase() === profile.deck.toLowerCase());
      if (!aName) continue;

      // From prey relationships: this deck beats prey
      for (const rel of profile.prey) {
        const bName = decks.find((d) => d.toLowerCase() === rel.prey.toLowerCase());
        if (!bName || aName === bName) continue;
        if (matrix[aName]?.[bName]) continue; // don't overwrite real data
        if (!matrix[aName]) matrix[aName] = {};
        matrix[aName][bName] = {
          rate: rel.win_rate,
          n_untapped: 0,
          n_tournament: 0,
          confidence: rel.confidence,
          inferred: true,
          inference_method: rel.mechanism === 'inferred' ? 'anti-correlation' : 'ecosystem',
        };
      }

      // From predator relationships: this deck loses to predators
      for (const rel of profile.predators) {
        const bName = decks.find((d) => d.toLowerCase() === rel.predator.toLowerCase());
        if (!bName || aName === bName) continue;
        if (matrix[aName]?.[bName]) continue;
        if (!matrix[aName]) matrix[aName] = {};
        matrix[aName][bName] = {
          rate: 1 - rel.win_rate, // flip: predator's win_rate is their advantage
          n_untapped: 0,
          n_tournament: 0,
          confidence: rel.confidence,
          inferred: true,
          inference_method: rel.mechanism === 'inferred' ? 'anti-correlation' : 'ecosystem',
        };
      }
    }

    // Pass 3: Win-rate estimation for remaining gaps
    // Estimate from overall win rates: E(A vs B) ≈ wrA / (wrA + wrB)
    const wrMap = new Map<string, number>();
    const powerMap = new Map<string, number>();
    for (const p of ecosystem.profiles) {
      if (p.win_rate != null) wrMap.set(p.deck.toLowerCase(), p.win_rate);
      if (p.power != null) powerMap.set(p.deck.toLowerCase(), p.power);
    }

    for (const a of decks) {
      for (const b of decks) {
        if (a === b || matrix[a]?.[b]) continue;
        const wrA = wrMap.get(a.toLowerCase());
        const wrB = wrMap.get(b.toLowerCase());
        if (wrA == null || wrB == null) continue;
        // Bradley-Terry model: P(A beats B) ≈ wrA / (wrA + wrB)
        const estimated = wrA / (wrA + wrB);
        if (!matrix[a]) matrix[a] = {};
        matrix[a][b] = {
          rate: estimated,
          n_untapped: 0,
          n_tournament: 0,
          confidence: 'low',
          inferred: true,
          inference_method: 'win-rate-model',
        };
      }
    }

    // Pass 4: Power-based estimation for decks with no win rate
    // Use MDM power rating as a proxy: normalize to 0-1 range, apply Bradley-Terry
    if (powerMap.size > 0) {
      const maxPower = Math.max(...powerMap.values());
      const minPower = Math.min(...powerMap.values());
      const range = maxPower - minPower || 1;

      for (const a of decks) {
        for (const b of decks) {
          if (a === b || matrix[a]?.[b]) continue;
          // Use win rate if available, otherwise estimate from power
          const sA = wrMap.get(a.toLowerCase()) ?? (powerMap.has(a.toLowerCase())
            ? 0.45 + 0.10 * ((powerMap.get(a.toLowerCase())! - minPower) / range)
            : null);
          const sB = wrMap.get(b.toLowerCase()) ?? (powerMap.has(b.toLowerCase())
            ? 0.45 + 0.10 * ((powerMap.get(b.toLowerCase())! - minPower) / range)
            : null);
          if (sA == null || sB == null) continue;
          const estimated = sA / (sA + sB);
          if (!matrix[a]) matrix[a] = {};
          matrix[a][b] = {
            rate: estimated,
            n_untapped: 0,
            n_tournament: 0,
            confidence: 'low',
            inferred: true,
            inference_method: 'power-model',
          };
        }
      }
    }
  } catch {
    // If ecosystem computation fails, gaps remain unfilled
  }
}
```

## File: server/src/services/syncStatusService.ts
```typescript
import { getPool } from '../db/connection.js';
import { run, queryAll } from '../utils/dbHelpers.js';

export type SyncSource = 'ygoprodeck' | 'mdm_deck_types' | 'mdm_tournaments' | 'untapped';
export type SyncStatus = 'success' | 'partial' | 'failed';

export interface SyncRecord {
  source: SyncSource;
  status: SyncStatus;
  detail: string | null;
  synced_at: number;
}

export async function recordSync(source: SyncSource, status: SyncStatus, detail: string | null = null): Promise<void> {
  const pool = getPool();
  await run(pool,
    `INSERT INTO sync_log (source, status, detail, synced_at)
     VALUES ($1, $2, $3, extract(epoch from now())::bigint)
     ON CONFLICT (source) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, synced_at = EXCLUDED.synced_at`,
    [source, status, detail]
  );
}

export async function getSyncStatus(): Promise<SyncRecord[]> {
  const pool = getPool();
  return await queryAll(pool, 'SELECT source, status, detail, synced_at FROM sync_log ORDER BY source ASC') as SyncRecord[];
}
```

## File: .claude/launch.json
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "C:\\Users\\Niall\\Code\\md-meta-app\\server",
      "port": 3001
    },
    {
      "name": "client",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "C:\\Users\\Niall\\Code\\md-meta-app\\client",
      "port": 5173
    }
  ]
}
```

## File: client/src/components/dashboard/TierListView.tsx
```typescript
import { Link } from 'react-router-dom';
import TierBadge from '../common/TierBadge';
import type { TierList, DeckTierEntry } from '../../types/meta';

interface TierListViewProps {
  tierList: TierList;
}

export default function TierListView({ tierList }: TierListViewProps) {
  return (
    <div className="space-y-6">
      {(['0', '1', '2', '3', 'rogue'] as const).map((tierKey) => {
        const decks = tierList[tierKey];
        if (!decks || decks.length === 0) return null;
        const tierNum = tierKey === 'rogue' ? null : parseInt(tierKey);

        return (
          <div key={tierKey} className="bg-gradient-to-br from-md-surface/70 to-md-surface/50 rounded-2xl border border-md-border/40 overflow-hidden backdrop-blur-sm shadow-lg shadow-black/5">
            {/* Tier header with enhanced styling */}
            <div className="px-6 py-5 border-b border-md-border/30 flex items-center gap-4 bg-md-surface/40">
              <TierBadge tier={tierNum} size="lg" />
              <span className="text-md-textMuted text-sm font-medium tabular-nums">
                {decks.length} deck{decks.length !== 1 ? 's' : ''}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-md-blue animate-pulse"></div>
                <span className="text-xs text-md-textMuted uppercase tracking-wider">Active Meta</span>
              </div>
            </div>

            {/* Deck rows with enhanced styling */}
            <div className="divide-y divide-md-border/20">
              {decks.map((deck: DeckTierEntry) => (
                <Link
                  key={deck.id}
                  to={`/decks/${encodeURIComponent(deck.name)}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-4 hover:bg-md-surfaceHover/30 transition-all duration-200 group"
                >
                  {/* Card images — overlapping thumbnails */}
                  <div className="flex items-center min-w-[8rem]">
                    {deck.cards && deck.cards.length > 0 ? (
                      deck.cards.map((card, index) => (
                        <div
                          key={index}
                          className={`relative w-24 h-16 rounded-lg overflow-hidden border border-md-border/40 bg-gradient-to-br from-md-surface to-md-bg flex-shrink-0 shadow-card ${index > 0 ? '-ml-10' : ''}`}
                          style={{ zIndex: index }}
                        >
                          {/* Placeholder icon (behind image) */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-5 h-5 text-md-textMuted/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                              <path d="M3 16l5-5 4 4 4-4 5 5" strokeWidth="1.5" strokeLinejoin="round" />
                              <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                            </svg>
                          </div>
                          {/* Image layer */}
                          {card.image && (
                            <img
                              src={card.image}
                              alt={card.name}
                              className="absolute inset-0 w-full h-full object-cover object-top"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                        </div>
                      ))
                    ) : deck.thumbnail_image ? (
                      <div className="relative w-24 h-16 rounded-lg overflow-hidden border border-md-border/40 bg-gradient-to-br from-md-surface to-md-bg flex-shrink-0">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-5 h-5 text-md-textMuted/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                            <path d="M3 16l5-5 4 4 4-4 5 5" strokeWidth="1.5" strokeLinejoin="round" />
                            <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                          </svg>
                        </div>
                        <img
                          src={deck.thumbnail_image}
                          alt={deck.name}
                          className="absolute inset-0 w-full h-full object-cover object-top"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-16 rounded-lg border border-red-500/40 bg-gradient-to-br from-md-surface to-md-bg flex-shrink-0 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                          <path d="M3 16l5-5 4 4 4-4 5 5" strokeWidth="1.5" strokeLinejoin="round" />
                          <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Name + secondary stats */}
                  <div className="min-w-0">
                    <p className="font-bold text-md-text group-hover:text-md-blue transition-all duration-200 truncate text-lg">
                      {deck.name}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-md-textMuted mt-1.5 tabular-nums">
                      {typeof deck.power === 'number' && (
                        <span className="font-mono bg-md-surface/50 px-2 py-1 rounded-md border border-md-border/30">
                          {deck.power.toFixed(1)} power
                        </span>
                      )}
                      {typeof deck.pop_rank === 'number' && (
                        <span className="bg-md-surface/50 px-2 py-1 rounded-md border border-md-border/30">
                          #{deck.pop_rank} popularity
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: stats + arrow */}
                  <div className="flex items-center gap-5 flex-shrink-0">
                    <div className="flex flex-col items-end gap-1 text-sm tabular-nums">
                      {typeof deck.win_rate === 'number' && (
                        <span className={`font-bold ${deck.win_rate >= 55 ? 'text-md-winRate' : deck.win_rate <= 45 ? 'text-md-red' : 'text-md-text'}`}>
                          {deck.win_rate.toFixed(1)}%<span className="text-md-textMuted font-normal ml-1 text-xs">win</span>
                        </span>
                      )}
                      {typeof deck.play_rate === 'number' && (
                        <span className="text-md-playRate font-medium">
                          {deck.play_rate.toFixed(1)}%<span className="text-md-textMuted ml-1 text-xs">play</span>
                        </span>
                      )}
                      {typeof deck.power_trend === 'number' && deck.power_trend !== 0 && (
                        <span className={`font-semibold text-xs ${deck.power_trend > 0 ? 'text-md-winRate' : 'text-md-red'}`}>
                          trend: {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <svg
                      className="w-5 h-5 text-md-textMuted/40 group-hover:text-md-textMuted group-hover:translate-x-1 transition-all duration-200 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

## File: client/src/pages/BanList.tsx
```typescript
import { useState, useEffect } from 'react';
import { getBanList } from '../api/meta';
import type { BanListData, BanCard } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';

const RARITY_BORDER: Record<string, string> = {
  UR: 'border-b-2 border-rarity-ur',
  SR: 'border-b-2 border-rarity-sr',
  R: 'border-b-2 border-rarity-r',
  N: 'border-b-2 border-md-textMuted/40',
};

const RARITY_LABEL: Record<string, string> = {
  UR: 'text-rarity-ur',
  SR: 'text-rarity-sr',
  R: 'text-rarity-r',
  N: 'text-md-textMuted',
};

function BanCardCell({ card }: { card: BanCard }) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rarityBorder = card.rarity ? (RARITY_BORDER[card.rarity] ?? '') : '';
  const hasNegate = card.negate_effectiveness != null && card.negate_effectiveness > 0;

  return (
    <div
      className={`group cursor-default relative ${rarityBorder}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative w-full aspect-[7/10] rounded-md overflow-hidden bg-md-surfaceAlt shadow-card">
        {card.image_small_url && !imgError ? (
          <img
            src={card.image_small_url}
            alt={card.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-1">
            <span className="text-md-textMuted text-[9px] text-center leading-tight">{card.name.slice(0, 20)}</span>
          </div>
        )}
        {card.rarity && (
          <span className={`absolute top-0.5 right-0.5 text-[8px] font-bold px-1 rounded ${RARITY_LABEL[card.rarity] ?? 'text-md-textMuted'} bg-black/60`}>
            {card.rarity}
          </span>
        )}
        {hasNegate && (
          <span className={`absolute bottom-0.5 left-0.5 text-[8px] font-bold px-1 rounded bg-black/70 ${card.negate_effectiveness! > 8 ? 'text-md-red' : card.negate_effectiveness! > 4 ? 'text-md-orange' : 'text-yellow-400'}`}>
            +{card.negate_effectiveness!.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[10px] mt-1 truncate text-md-textSecondary leading-tight" title={card.name}>{card.name}</p>
      {hovered && hasNegate && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-md-surface border border-md-border rounded-lg p-2 shadow-lg whitespace-nowrap pointer-events-none">
          <p className={`text-xs font-semibold ${card.negate_effectiveness! > 8 ? 'text-md-red' : card.negate_effectiveness! > 4 ? 'text-md-orange' : 'text-yellow-400'}`}>
            Negate Impact: +{card.negate_effectiveness!.toFixed(1)}%
          </p>
          {card.not_negated_win_rate != null && card.negated_win_rate != null && (
            <p className="text-[10px] text-md-textMuted mt-0.5">
              WR: <span className="text-md-green">{card.not_negated_win_rate.toFixed(1)}%</span> / Negated: <span className="text-md-red">{card.negated_win_rate.toFixed(1)}%</span>
            </p>
          )}
          {card.negate_sample_size != null && card.negate_sample_size > 0 && (
            <p className="text-[9px] text-md-textMuted mt-0.5">{card.negate_sample_size.toLocaleString()} games</p>
          )}
        </div>
      )}
    </div>
  );
}

function BanSection({
  title,
  subtitle,
  cards,
  accentColor,
}: {
  title: string;
  subtitle: string;
  cards: BanCard[];
  accentColor: string;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="bg-md-surface rounded-xl border border-md-border overflow-hidden">
      <div className="px-5 py-3.5 border-b border-md-border/60 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <h3 className="font-semibold text-sm">{title}</h3>
        <span className="text-md-textMuted text-xs">{subtitle}</span>
        <span className="text-md-textMuted text-xs ml-auto font-mono">{cards.length}</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2.5 p-4">
        {cards.map((card) => (
          <BanCardCell key={card.name} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function BanList() {
  const [data, setData] = useState<BanListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    getBanList()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          <span className="text-shimmer">Ban List</span>
        </h2>
        <div className="flex items-center gap-4 text-xs text-md-textMuted mt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-md-red" />
            {data.forbidden.length} Forbidden
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-md-orange" />
            {data.limited.length} Limited 1
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            {data.semiLimited.length} Limited 2
          </span>
          <span className="text-md-textMuted/50 ml-1">Source: MasterDuelMeta</span>
        </div>
      </div>

      <BanSection title="Forbidden" subtitle="0 copies allowed" cards={data.forbidden} accentColor="#ff4d5e" />
      <BanSection title="Limited 1" subtitle="1 copy max" cards={data.limited} accentColor="#ff9147" />
      <BanSection title="Limited 2" subtitle="2 copies max" cards={data.semiLimited} accentColor="#facc15" />
    </div>
  );
}
```

## File: client/src/pages/DeckProfile.tsx
```typescript
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDeckProfile } from '../api/meta';
import type { DeckProfile as DeckProfileType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import TierBadge from '../components/common/TierBadge';
import CardImage from '../components/common/CardImage';
import DecklistView from '../components/decks/DecklistView';

function HeaderCardFan({ deck }: { deck: DeckProfileType }) {
  // Get top 3 archetype cards from the first top decklist
  const deckNameLower = deck.name.toLowerCase();
  const deckWords = deckNameLower.split(/\s+/).filter(w => w.length > 2);
  const firstDeck = deck.topDecks?.[0];
  const allCards = [...(firstDeck?.main_deck_json || []), ...(firstDeck?.extra_deck_json || [])];
  const archetypeCards = allCards.filter(c => {
    const arch = (c.archetype || '').toLowerCase();
    const name = c.cardName.toLowerCase();
    return deckWords.some(w => arch.includes(w) || name.includes(w));
  }).filter(c => c.imageUrl).slice(0, 3);

  if (archetypeCards.length === 0) return null;

  const count = archetypeCards.length;
  const totalSpread = 30;
  const angles = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -totalSpread / 2 + (i * totalSpread) / (count - 1)
  );
  const xOffsets = Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : -14 * (count - 1) / 2 + i * 14
  );

  return (
    <div className="relative flex items-end justify-center shrink-0" style={{ height: '120px', width: '120px' }}>
      {archetypeCards.map((card, i) => (
        <div
          key={card.cardName}
          className="absolute bottom-0"
          style={{
            transform: `translateX(${xOffsets[i]}px) rotate(${angles[i]}deg)`,
            transformOrigin: 'bottom center',
            zIndex: i,
          }}
        >
          <img
            src={card.imageUrl!}
            alt={card.cardName}
            className="rounded shadow-lg border border-md-border/50"
            style={{ width: '64px', height: '94px', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ))}
    </div>
  );
}

export default function DeckProfile() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<DeckProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    getDeckProfile(decodeURIComponent(name))
      .then((d) => {
        setDeck(d);
        if (d.topDecks?.[0]?.id) setExpandedDeck(d.topDecks[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBanner message={error} />;
  if (!deck) return null;

  const breakdown = deck.breakdown_json;
  const mainCards = Array.isArray(breakdown?.main) ? breakdown.main : [];
  const extraCards = Array.isArray(breakdown?.extra) ? breakdown.extra : [];

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="text-md-blue text-sm hover:underline">&larr; Back</button>

      {/* Header */}
      <div className="bg-md-surface border border-md-border rounded-lg p-6">
        <div className="flex items-start gap-6">
          <HeaderCardFan deck={deck} />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold">{deck.name}</h2>
              <TierBadge tier={deck.tier} size="lg" />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-md-textMuted">
              {deck.power != null && <span>Power: <span className="text-md-gold font-semibold">{deck.power.toFixed(1)}</span></span>}
              {deck.power_trend != null && (
                <span>
                  Trend: <span className={deck.power_trend > 0 ? 'text-md-green' : 'text-md-red'}>
                    {deck.power_trend > 0 ? '+' : ''}{deck.power_trend.toFixed(1)}
                  </span>
                </span>
              )}
              {deck.avg_ur_price != null && <span>UR: {Math.round(deck.avg_ur_price)}</span>}
              {deck.avg_sr_price != null && <span>SR: {Math.round(deck.avg_sr_price)}</span>}
            </div>
            {/* untapped.gg stats */}
            {(deck.win_rate != null || deck.play_rate != null) && (
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                <span className="text-xs text-md-textMuted font-medium uppercase tracking-wider">untapped.gg</span>
                {deck.win_rate != null && (
                  <span className={`font-semibold ${deck.win_rate >= 55 ? 'text-md-green' : deck.win_rate <= 45 ? 'text-md-red' : 'text-md-text'}`}>
                    Win Rate: {deck.win_rate.toFixed(1)}%
                  </span>
                )}
                {deck.play_rate != null && (
                  <span className="text-md-blue font-semibold">Play Rate: {deck.play_rate.toFixed(1)}%</span>
                )}
                {deck.sample_size != null && (
                  <span className="text-md-textMuted">{deck.sample_size.toLocaleString()} games</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty State — no breakdown and no top decklists */}
      {mainCards.length === 0 && extraCards.length === 0 && (!deck.topDecks || deck.topDecks.length === 0) && (
        <div className="bg-md-surface border border-md-border rounded-lg p-10 text-center">
          <svg className="w-12 h-12 mx-auto text-md-textMuted/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
            <path d="M8 12h8M12 8v8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h3 className="text-lg font-semibold text-md-textSecondary mb-1">No Decklist Available</h3>
          <p className="text-sm text-md-textMuted max-w-md mx-auto">
            No decklist data is currently available for <span className="text-md-text font-medium">{deck.name}</span>. This archetype may be newly tracked or awaiting tournament results.
          </p>
        </div>
      )}

      {/* Deck Breakdown */}
      {mainCards.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Main Deck Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {mainCards.sort((a, b) => (b.percentage || b.usage || 0) - (a.percentage || a.usage || 0)).map((card, i) => {
              const usage = card.percentage || card.usage || 0;
              const cardName = card.cardName || card.name || '';
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-md-bg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cardName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-md-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-md-blue rounded-full"
                          style={{ width: `${Math.min(usage, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-md-textMuted w-10 text-right">{usage}%</span>
                    </div>
                  </div>
                  {card.amount && <span className="text-xs text-md-textMuted">x{card.amount}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {extraCards.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Extra Deck Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {extraCards.sort((a, b) => (b.percentage || b.usage || 0) - (a.percentage || a.usage || 0)).map((card, i) => {
              const usage = card.percentage || card.usage || 0;
              const cardName = card.cardName || card.name || '';
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-md-bg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cardName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-md-border rounded-full overflow-hidden">
                        <div className="h-full bg-md-purple rounded-full" style={{ width: `${Math.min(usage, 100)}%` }} />
                      </div>
                      <span className="text-xs text-md-textMuted w-10 text-right">{usage}%</span>
                    </div>
                  </div>
                  {card.amount && <span className="text-xs text-md-textMuted">x{card.amount}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Decklists */}
      {deck.topDecks && deck.topDecks.length > 0 && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Top Decklists ({deck.topDecks.length})</h3>
          <div className="space-y-3">
            {deck.topDecks.slice(0, 5).map((td, idx) => {
              const isExpanded = expandedDeck === td.id;
              return (
                <div key={td.id} className="bg-md-bg rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedDeck(isExpanded ? null : td.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-md-surface/50 transition-colors text-left"
                  >
                    <div>
                      {td.author && <p className="text-sm font-medium">{td.author}</p>}
                      <div className="flex items-center gap-3 text-xs text-md-textMuted">
                        {td.tournament_name && <span>{td.tournament_name}</span>}
                        {td.tournament_placement && <span>#{td.tournament_placement}</span>}
                        {td.ranked_type && (() => {
                          try {
                            const parsed = JSON.parse(td.ranked_type);
                            const label = parsed.shortName || parsed.name;
                            return label ? <span>{label}</span> : null;
                          } catch {
                            return <span>{td.ranked_type}</span>;
                          }
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 text-xs text-md-textMuted">
                        {td.ur_price != null && <span className="text-rarity-ur">{td.ur_price} UR</span>}
                        {td.sr_price != null && <span className="text-rarity-sr">{td.sr_price} SR</span>}
                      </div>
                      <span className={`text-md-textMuted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9660;</span>
                    </div>
                  </button>
                  {isExpanded && td.main_deck_json && (
                    <div className="px-4 pb-4">
                      <DecklistView
                        mainDeck={td.main_deck_json}
                        extraDeck={td.extra_deck_json || []}
                        deckArchetype={deck.name}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

## File: client/src/pages/Tournaments.tsx
```typescript
import { useState, useEffect } from 'react';
import { getTournaments, getRecentTournamentResults } from '../api/tournaments';
import type { Tournament, TournamentResult } from '../types/meta';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';

const MDM_DOMAIN = 'https://www.masterduelmeta.com';

function resolveBannerUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${MDM_DOMAIN}${url}` : url;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function placementMeta(placement: string): { label: string; color: string; ringColor: string } {
  const p = (placement ?? '').toLowerCase();
  if (p.startsWith('1st')) return { label: '1st', color: 'text-md-gold', ringColor: 'border-md-gold/40' };
  if (p.startsWith('2nd')) return { label: '2nd', color: 'text-[#a1a1aa]', ringColor: 'border-[#a1a1aa]/40' };
  if (p.startsWith('3rd')) return { label: '3rd', color: 'text-[#cd7f32]', ringColor: 'border-[#cd7f32]/40' };
  return { label: placement, color: 'text-md-textMuted', ringColor: 'border-md-border' };
}

// ─── Tournament Card ───────────────────────────────────────────────────────────

function TournamentCard({ t }: { t: Tournament }) {
  const portraitUrl = t.winner_deck_thumbnail ?? resolveBannerUrl(t.banner_image);

  return (
    <div className="group relative featured-card rounded-xl overflow-hidden card-hover flex flex-col">
      {/* Gold top accent line */}
      <div
        className="absolute top-0 inset-x-0 h-px z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }}
      />

      {/* Portrait / banner area */}
      <div className="relative h-44 w-full overflow-hidden bg-md-surfaceAlt flex-shrink-0">
        {portraitUrl ? (
          <>
            <img
              src={portraitUrl}
              alt={t.winner_deck_name ?? t.name}
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111113] via-[#111113]/30 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-md-surfaceAlt to-md-bg" />
        )}

        {/* Winner deck chip overlaid at bottom of portrait */}
        {t.winner_deck_name && (
          <div className="absolute bottom-2.5 left-3 right-3 z-10">
            <span className="inline-flex items-center gap-1.5 bg-black/55 backdrop-blur-sm border border-white/10 rounded-md px-2.5 py-1 text-xs font-medium text-md-gold truncate max-w-full">
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 1L7.5 4.5H11L8.25 6.75L9.25 10.5L6 8.25L2.75 10.5L3.75 6.75L1 4.5H4.5L6 1Z" />
              </svg>
              {t.winner_deck_name}
            </span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div>
          <h3 className="font-semibold text-[15px] leading-snug text-md-text group-hover:text-md-gold transition-colors duration-300">
            {t.name}
          </h3>
          {t.short_name && t.short_name !== t.name && (
            <p className="text-xs text-md-textMuted mt-0.5">{t.short_name}</p>
          )}
        </div>

        {t.next_date && (
          <div className="inline-flex items-center gap-1.5 self-start bg-md-surfaceAlt border border-white/[0.07] rounded-md px-2 py-0.5">
            <svg className="w-3 h-3 text-md-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.5" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] text-md-textMuted tabular-nums">{formatDate(t.next_date)}</span>
          </div>
        )}

        {/* Prize structure */}
        {t.placements_json && t.placements_json.length > 0 && (
          <div className="mt-auto pt-3 border-t border-white/[0.05] space-y-1">
            <p className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium mb-1.5">Prize Structure</p>
            {t.placements_json.slice(0, 3).map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs tabular-nums">
                <span className="text-md-gold font-semibold w-14 shrink-0">{p.place ?? `#${i + 1}`}</span>
                <span className="truncate text-md-textMuted">
                  {p.tpcPoints != null ? `${p.tpcPoints} TPC pts` : (p.prize ?? '—')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recent Result Row ─────────────────────────────────────────────────────────

function ResultRow({ r }: { r: TournamentResult }) {
  const { label, color, ringColor } = placementMeta(r.tournament_placement ?? '');
  return (
    <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-4 px-5 py-3.5 hover:bg-white/[0.025] transition-colors duration-150 group">
      <span className={`inline-flex items-center justify-center text-xs font-bold border rounded-md px-2 py-0.5 bg-white/[0.03] ${color} ${ringColor}`}>
        {label}
      </span>

      <div className="min-w-0">
        {r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-md-text group-hover:text-md-gold transition-colors duration-150 truncate block"
          >
            {r.deck_type_name}
          </a>
        ) : (
          <span className="text-sm font-medium text-md-text truncate block">{r.deck_type_name}</span>
        )}
        {r.author && (
          <span className="text-[11px] text-md-textMuted">{r.author}</span>
        )}
      </div>

      <span className="text-xs text-md-textMuted tabular-nums flex-shrink-0">{formatDate(r.created_at)}</span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Tournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getTournaments(), getRecentTournamentResults()])
      .then(([t, r]) => { setTournaments(t); setResults(r); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-8">

      {/* Hero header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          <span className="text-shimmer">Tournaments</span>
        </h2>
        <p className="text-md-textMuted text-sm mt-1.5">
          {tournaments.length > 0
            ? `${tournaments.length} tournament format${tournaments.length !== 1 ? 's' : ''} tracked`
            : 'Yu-Gi-Oh! Master Duel competitive tournaments'}
        </p>
      </div>

      {/* Tournament Formats grid */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 rounded-full bg-md-gold" />
          <h3 className="text-xs font-semibold text-md-textMuted uppercase tracking-widest">Tournament Formats</h3>
        </div>

        {tournaments.length === 0 ? (
          <div className="featured-card rounded-xl p-8 text-center text-md-textMuted">
            No tournament data available yet. Click "Sync Data" to fetch the latest data.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tournaments.map((t) => <TournamentCard key={t.id} t={t} />)}
          </div>
        )}
      </section>

      {/* Recent Top Results */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 rounded-full bg-md-blue" />
          <h3 className="text-xs font-semibold text-md-textMuted uppercase tracking-widest">Recent Top Results</h3>
        </div>

        {results.length === 0 ? (
          <div className="featured-card rounded-xl p-8 text-center text-md-textMuted">
            No placement data available yet.
          </div>
        ) : (
          <div className="featured-card rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[5rem_1fr_auto] gap-4 px-5 py-3.5 border-b border-white/[0.05]">
              <span className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium">Place</span>
              <span className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium">Deck / Player</span>
              <span className="text-[10px] text-md-textMuted uppercase tracking-widest font-medium">Date</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {results.map((r, i) => <ResultRow key={i} r={r} />)}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
```

## File: client/src/types/deck.ts
```typescript
export interface DeckType {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  pop_rank: number | null;
  master_pop_rank: number | null;
  overview: string | null;
  thumbnail_image: string | null;
  avg_ur_price: number | null;
  avg_sr_price: number | null;
  breakdown_json: DeckBreakdown | null;
  win_rate: number | null;
  play_rate: number | null;
  sample_size: number | null;
  untapped_tier: number | null;
}

export interface DeckBreakdown {
  main?: DeckBreakdownCard[];
  extra?: DeckBreakdownCard[];
}

export interface DeckBreakdownCard {
  cardName?: string;
  name?: string;
  amount?: number;
  percentage?: number;
  usage?: number;
  rarity?: string;
}

export interface TopDeck {
  id: string;
  deck_type_name: string;
  author: string | null;
  main_deck_json: EnrichedDeckCard[] | null;
  extra_deck_json: EnrichedDeckCard[] | null;
  side_deck_json: EnrichedDeckCard[] | null;
  tournament_name: string | null;
  tournament_placement: string | null;
  ranked_type: string | null;
  created_at: string | null;
  gems_price: number | null;
  ur_price: number | null;
  sr_price: number | null;
}

export interface DeckCard {
  cardName: string;
  amount: number;
  rarity?: string;
}

export interface EnrichedDeckCard extends DeckCard {
  imageUrl?: string | null;
  type?: string | null;
  frameType?: string | null;
  archetype?: string | null;
  negate_effectiveness?: number | null;
  negated_win_rate?: number | null;
  not_negated_win_rate?: number | null;
  negate_sample_size?: number | null;
}

export interface DeckProfile extends DeckType {
  topDecks: TopDeck[];
}
```

## File: server/package.json
```json
{
  "name": "md-meta-server",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && node -e \"require('fs').cpSync('src/db/schema.sql','dist/db/schema.sql')\"",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@neondatabase/serverless": "^1.0.2",
    "axios": "^1.7.7",
    "cheerio": "^1.0.0",
    "cors": "^2.8.5",
    "dotenv": "^17.4.0",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "keytar": "^7.9.0",
    "node-cron": "^3.0.3",
    "puppeteer": "^24.40.0",
    "ws": "^8.20.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "@types/ws": "^8.18.1",
    "better-sqlite3": "^12.9.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

## File: server/src/db/connection.ts
```typescript
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Required for Node.js environments (Render, local dev)
neonConfig.webSocketConstructor = ws;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  await p.query(schema);
  console.log('[DB] Schema initialized');
}
```

## File: server/src/routes/tournaments.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tournaments = await queryAll(pool, `
      SELECT
        t.id, t.name, t.short_name, t.banner_image, t.next_date, t.placements_json,
        (
          SELECT dt.thumbnail_image
          FROM top_decks td JOIN deck_types dt ON dt.name = td.deck_type_name
          WHERE (td.tournament_name = t.name OR td.tournament_name = t.short_name)
            AND td.tournament_placement IS NOT NULL
          ORDER BY CASE WHEN td.tournament_placement LIKE '1st%' THEN 0 ELSE 1 END ASC,
                   td.created_at DESC
          LIMIT 1
        ) AS winner_deck_thumbnail,
        (
          SELECT td2.deck_type_name
          FROM top_decks td2
          WHERE (td2.tournament_name = t.name OR td2.tournament_name = t.short_name)
            AND td2.tournament_placement IS NOT NULL
          ORDER BY CASE WHEN td2.tournament_placement LIKE '1st%' THEN 0 ELSE 1 END ASC,
                   td2.created_at DESC
          LIMIT 1
        ) AS winner_deck_name
      FROM tournaments t
      ORDER BY t.next_date DESC
    `);
    res.json(tournaments.map((t: any) => ({
      ...t,
      placements_json: t.placements_json ? JSON.parse(t.placements_json) : null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent-results', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const results = await queryAll(pool,
      `SELECT deck_type_name, tournament_placement, author, created_at, url
       FROM top_decks
       WHERE tournament_placement IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tournament = await queryOne(pool, 'SELECT * FROM tournaments WHERE id = $1', [req.params.id]);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    res.json({
      ...tournament,
      placements_json: tournament.placements_json ? JSON.parse(tournament.placements_json) : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## File: server/src/services/mdmService.ts
```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { getCached, setCache } from './cacheService.js';

const api = axios.create({
  baseURL: config.mdmBaseUrl,
  headers: { 'User-Agent': 'MDMetaApp/1.0' },
});

const siteApi = axios.create({
  baseURL: config.mdmSiteUrl,
  headers: { 'User-Agent': 'MDMetaApp/1.0' },
});

let lastRequestTime = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < config.rateLimit.mdmDelayMs) {
    await new Promise(r => setTimeout(r, config.rateLimit.mdmDelayMs - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithCache<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached) return cached;
  await throttle();
  const data = await fetcher();
  await setCache(key, data, ttl);
  return data;
}

export interface MDMDeckType {
  _id: string;
  name: string;
  tier?: number | null;
  // API now uses tournamentPower instead of power
  power?: number;
  tournamentPower?: number;
  powerTrend?: number;
  tournamentPowerTrend?: number;
  popRank?: number;
  masterPopRank?: number;
  overview?: string;
  parsedOverview?: string;
  // API uses thumbnailImage instead of image
  image?: string;
  thumbnailImage?: string;
  deckBreakdown?: any;
  tournamentStats?: any;
  avgURPrice?: number;
  avgSRPrice?: number;
  // API uses lowercase 'r' in Ur/Sr
  avgUrPrice?: number;
  avgSrPrice?: number;
}

export interface MDMTopDeck {
  _id: string;
  deckType?: { name: string };
  author?: string;
  mainDeck?: Array<{ cardName: string; amount: number; rarity?: string }>;
  extraDeck?: Array<{ cardName: string; amount: number; rarity?: string }>;
  sideDeck?: Array<{ cardName: string; amount: number; rarity?: string }>;
  tournamentName?: string;
  tournamentPlacement?: string;
  rankedType?: string;
  createdAt?: string;
  gemsPrice?: number;
  urPrice?: number;
  srPrice?: number;
  url?: string;
}

export interface MDMTournament {
  _id: string;
  name: string;
  shortName?: string;
  bannerImage?: string;
  nextDate?: string;
  placements?: any[];
}

export async function getDeckTypes(): Promise<MDMDeckType[]> {
  return fetchWithCache('mdm:deck-types', config.cache.tierListTtl, async () => {
    const res = await api.get('/deck-types', {
      params: { 'game-format': 'master-duel', sort: '-tournamentPower' },
    });
    return Array.isArray(res.data) ? res.data : [];
  });
}

export async function getTopDecks(params?: Record<string, string>): Promise<MDMTopDeck[]> {
  const queryStr = new URLSearchParams(params || {}).toString();
  return fetchWithCache(`mdm:top-decks:${queryStr}`, config.cache.topDecksTtl, async () => {
    const res = await api.get('/top-decks', {
      params: { 'game-format': 'master-duel', sort: '-created', ...params },
    });
    return Array.isArray(res.data) ? res.data : [];
  });
}

export async function getTournaments(): Promise<MDMTournament[]> {
  return fetchWithCache('mdm:tournaments', config.cache.tournamentsTtl, async () => {
    const res = await api.get('/tournaments', {
      params: { 'game-format': 'master-duel' },
    });
    return Array.isArray(res.data) ? res.data : [];
  });
}

export async function scrapeTierList(): Promise<Array<{ name: string; tier: number; power: number }>> {
  return fetchWithCache('mdm:tier-list-scraped', config.cache.tierListTtl, async () => {
    const res = await siteApi.get('/tier-list');
    const html = res.data as string;
    const entries: Array<{ name: string; tier: number; power: number }> = [];

    // Find tier section boundaries via alt="Tier N" images
    const tierBounds: Array<{ tier: number; index: number }> = [];
    const tierImgRe = /alt="Tier\s*(\d)"/g;
    let m: RegExpExecArray | null;
    while ((m = tierImgRe.exec(html)) !== null) {
      tierBounds.push({ tier: parseInt(m[1]), index: m.index });
    }
    // Add sentinel for content after last tier
    tierBounds.push({ tier: tierBounds.length > 0 ? tierBounds[tierBounds.length - 1].tier : 3, index: html.length });

    // Extract deck entries: label div followed by power-label div
    const entryRe = /<div class="label[^"]*">([^<]+)<\/div>\s*<\/a>\s*\n*\s*<\/div>\s*\n*\s*<div class="power-label[^"]*">Power:\s*<b>(\d+\.?\d*)<\/b>/g;
    while ((m = entryRe.exec(html)) !== null) {
      const name = m[1].trim();
      const power = parseFloat(m[2]);
      const pos = m.index;

      // Determine tier from position between tier boundaries
      let tier = 3;
      for (let i = 0; i < tierBounds.length - 1; i++) {
        if (pos >= tierBounds[i].index && pos < tierBounds[i + 1].index) {
          tier = tierBounds[i].tier;
          break;
        }
      }

      if (name && !isNaN(power)) {
        entries.push({ name, tier, power });
      }
    }

    console.log(`[MDM Scraper] Extracted ${entries.length} decks from tier list page`);
    return entries;
  });
}

export interface MDMBanCard {
  name: string;
  banStatus: 'Forbidden' | 'Limited 1' | 'Limited 2';
  rarity: string | null;
  konamiID: string | null;
  banListDate: string | null;
}

export interface MDMBanList {
  forbidden: MDMBanCard[];
  limited: MDMBanCard[];
  semiLimited: MDMBanCard[];
}

export async function getBanList(): Promise<MDMBanList> {
  return fetchWithCache('mdm:ban-list', 3600, async () => {
    const fetchStatus = async (status: string): Promise<MDMBanCard[]> => {
      const res = await api.get('/cards', {
        params: { banStatus: status, limit: 500 },
      });
      const data = Array.isArray(res.data) ? res.data : [];
      if (data.length > 0) console.log('[MDM ban-list fields]', Object.keys(data[0]));
      // Deduplicate by name
      const seen = new Set<string>();
      return data.filter((c: any) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      }).map((c: any) => ({
        name: c.name,
        banStatus: status as MDMBanCard['banStatus'],
        rarity: c.rarity ?? null,
        konamiID: c.konamiID ?? null,
        banListDate: c.banListDate ?? c.startDate ?? c.date ?? null,
      }));
    };

    const [forbidden, limited, semiLimited] = await Promise.all([
      fetchStatus('Forbidden'),
      fetchStatus('Limited 1'),
      fetchStatus('Limited 2'),
    ]);

    return { forbidden, limited, semiLimited };
  });
}

export async function scrapeMatchups(deckName: string): Promise<Array<{ opponent: string; winRate: number; sampleSize: number }>> {
  const slug = deckName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const cacheKey = `mdm:matchup:${slug}`;
  return fetchWithCache(cacheKey, config.cache.matchupsTtl, async () => {
    try {
      const res = await siteApi.get(`/tier-list/deck-types/${slug}`);
      const $ = cheerio.load(res.data);
      const matchups: Array<{ opponent: string; winRate: number; sampleSize: number }> = [];

      $('table').each((_i, table) => {
        $(table).find('tr').each((_j, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 2) {
            const opponent = $(cells[0]).text().trim();
            const winText = $(cells[1]).text().trim();
            const winRate = parseFloat(winText);
            const sizeText = cells.length >= 3 ? $(cells[2]).text().trim() : '0';
            const sampleSize = parseInt(sizeText.replace(/\D/g, '')) || 0;
            if (opponent && !isNaN(winRate)) {
              matchups.push({ opponent, winRate, sampleSize });
            }
          }
        });
      });

      return matchups;
    } catch {
      return [];
    }
  });
}
```

## File: server/src/services/untappedService.ts
```typescript
import axios from 'axios';
import { config } from '../config.js';
import { getCached, setCache } from './cacheService.js';

export interface UntappedArchetype {
  name: string;
  tier: number | null;
  winRate: number | null;
  playRate: number | null;
  sampleSize: number | null;
}

const api = axios.create({
  baseURL: 'https://api.ygom.untapped.gg/api/v1',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Origin': 'https://ygom.untapped.gg',
    'Referer': 'https://ygom.untapped.gg/',
    'Accept': '*/*',
  },
});

interface ArchetypeStats {
  ALL: [number, number, number, number]; // [games_first, games_second, wins_first, wins_second]
  tier: number | null;
  [rank: string]: any;
}

interface ManifestEntry {
  arch_name: string;
  type: number;
  type_name: string;
}

interface RawUntappedData {
  statsData: Record<string, ArchetypeStats>;
  manifestData: Record<string, ManifestEntry>;
}

export interface UntappedMatchupPairing {
  deckA: string;
  deckB: string;
  winRate: number;   // 0-1 decimal
  sampleSize: number;
}

async function fetchRawStats(): Promise<RawUntappedData> {
  const cacheKey = 'untapped:raw-stats';
  const cached = await getCached<RawUntappedData>(cacheKey);
  if (cached) return cached;

  const [statsRes, manifestRes] = await Promise.all([
    api.get('/analytics/query/archetypes_by_rank_v3/free', {
      params: { TimeRangeFilter: 'CURRENT_META_PERIOD' },
    }),
    api.get('/analytics/query/archetypes_manifest'),
  ]);

  const result: RawUntappedData = {
    statsData: statsRes.data?.data || {},
    manifestData: manifestRes.data?.data || {},
  };

  await setCache(cacheKey, result, config.cache.untappedTtl);
  return result;
}

/**
 * Returns per-opponent matchup win rates from untapped.gg's public API.
 * Each entry is win rate of deckA against deckB (0–1 decimal).
 */
export async function getMatchupPairings(): Promise<UntappedMatchupPairing[]> {
  const cacheKey = 'untapped:matchup-pairings';
  const cached = await getCached<UntappedMatchupPairing[]>(cacheKey);
  if (cached) return cached;

  try {
    const { statsData, manifestData } = await fetchRawStats();
    const pairings: UntappedMatchupPairing[] = [];

    for (const [idA, archA] of Object.entries(statsData)) {
      const manifestA = manifestData[idA];
      if (!manifestA) continue;

      for (const [key, stats] of Object.entries(archA)) {
        if (key === 'ALL' || key === 'tier') continue;
        const manifestB = manifestData[key];
        if (!manifestB) continue;

        const [gFirst, gSecond, wFirst, wSecond] = stats as [number, number, number, number];
        const totalGames = gFirst + gSecond;
        if (totalGames < 20) continue;

        pairings.push({
          deckA: manifestA.arch_name,
          deckB: manifestB.arch_name,
          winRate: (wFirst + wSecond) / totalGames,
          sampleSize: Math.round(totalGames / 2),
        });
      }
    }

    await setCache(cacheKey, pairings, config.cache.untappedTtl);
    console.log(`[Untapped] Got ${pairings.length} matchup pairings`);
    return pairings;
  } catch (err) {
    console.error('[Untapped] Matchup pairing fetch failed:', (err as Error).message);
    return [];
  }
}

/**
 * Fetches archetype stats from untapped.gg's public API.
 * Returns win rate, play rate, and sample size for each archetype.
 */
export async function scrapeTierList(): Promise<UntappedArchetype[]> {
  const cacheKey = 'untapped:tier-list';
  const cached = await getCached<UntappedArchetype[]>(cacheKey);
  if (cached) return cached;

  console.log('[Untapped] Fetching archetype stats from API...');

  try {
    const { statsData, manifestData } = await fetchRawStats();
    // Compute total games across all archetypes (each game counted for both players)
    let totalPlayerGames = 0;
    for (const arch of Object.values(statsData)) {
      totalPlayerGames += arch.ALL[0] + arch.ALL[1];
    }
    const totalGames = totalPlayerGames / 2;

    const results: UntappedArchetype[] = [];

    for (const [id, arch] of Object.entries(statsData)) {
      const manifest = manifestData[id];
      if (!manifest) continue;

      const [gamesFirst, gamesSecond, winsFirst, winsSecond] = arch.ALL;
      const totalArchGames = gamesFirst + gamesSecond;
      const totalWins = winsFirst + winsSecond;

      if (totalArchGames < 20) continue; // skip very low sample sizes

      // Win rate: total wins / total games
      // Note: this is ~3-5% higher than untapped.gg displays because they
      // apply a mirror match correction client-side. The raw rate is still
      // useful for relative comparisons.
      const winRate = Math.round((totalWins / totalArchGames) * 1000) / 10;

      // Play rate: archetype's games / total games (each game counted once per player)
      const playRate = Math.round((totalArchGames / 2 / totalGames) * 1000) / 10;

      // Sample size: number of games this archetype appeared in
      const sampleSize = Math.round(totalArchGames / 2);

      results.push({
        name: manifest.arch_name,
        tier: arch.tier,
        winRate,
        playRate,
        sampleSize,
      });
    }

    // Sort by play rate descending
    results.sort((a, b) => (b.playRate ?? 0) - (a.playRate ?? 0));

    await setCache(cacheKey, results, config.cache.untappedTtl);
    console.log(`[Untapped] Got ${results.length} archetypes from API`);

    const sample = results.slice(0, 5).map(r =>
      `${r.name} wr=${r.winRate}% pr=${r.playRate}%`
    ).join(', ');
    console.log(`[Untapped] Top 5: ${sample}`);

    return results;
  } catch (err) {
    console.error('[Untapped] API fetch failed:', (err as Error).message);
    return [];
  }
}

/**
 * No longer needed — kept as a no-op for backwards compatibility.
 */
export async function closeBrowser(): Promise<void> {}

export interface CardNegateData {
  cardName: string;
  negateEffectiveness: number; // win rate delta % when this card is negated
}

/**
 * Scrapes card negate effectiveness from untapped.gg.
 *
 * Strategy A: Try known /free API query names directly.
 * Strategy B: Use Puppeteer to navigate the site and intercept XHR requests
 *             to discover the actual endpoint, then parse the response.
 * Strategy C: DOM scraping fallback — render a deck page and extract card
 *             impact stats from the HTML.
 */
export async function scrapeCardNegateEffectiveness(): Promise<CardNegateData[]> {
  const cacheKey = 'untapped:card-negate';
  const cached = await getCached<CardNegateData[]>(cacheKey);
  if (cached) return cached;

  console.log('[Untapped] Fetching card negate effectiveness...');

  // Strategy A: Try likely public API query names
  const candidateQueries = [
    'cards_negate_impact_v3',
    'card_negate_stats_v3',
    'card_impact_stats_v3',
    'cards_impact_v3',
    'card_stats_v3',
    'negate_cards_v3',
  ];

  for (const queryName of candidateQueries) {
    try {
      const res = await api.get(`/analytics/query/${queryName}/free`, {
        params: { TimeRangeFilter: 'CURRENT_META_PERIOD' },
      });
      const data = res.data?.data;
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        console.log(`[Untapped] Found card negate data at query: ${queryName}`);
        const results = parseCardNegateResponse(data);
        if (results.length > 0) {
          await setCache(cacheKey, results, config.cache.untappedTtl);
          return results;
        }
      }
    } catch {
      // "No registered query" — try next
    }
  }

  // Strategy B: Puppeteer network interception
  console.log('[Untapped] Strategy A failed — trying Puppeteer network interception...');
  try {
    const puppeteerResults = await scrapeViaPuppeteer();
    if (puppeteerResults.length > 0) {
      await setCache(cacheKey, puppeteerResults, config.cache.untappedTtl);
      return puppeteerResults;
    }
  } catch (err) {
    console.error('[Untapped] Puppeteer scrape failed:', (err as Error).message);
  }

  console.warn('[Untapped] No card negate data found from any strategy.');
  return [];
}

/**
 * Attempts to parse various API response shapes into CardNegateData[].
 * Handles both {cardName, winDelta} and raw stat arrays.
 */
function parseCardNegateResponse(data: Record<string, any>): CardNegateData[] {
  const results: CardNegateData[] = [];
  for (const [key, value] of Object.entries(data)) {
    // Shape: { name: string, win_delta: number } or { name: string, negate_win_rate: number }
    const cardName: string = value?.name || value?.card_name || value?.cardName || key;
    const winDelta: number | undefined =
      value?.win_delta ?? value?.negate_win_delta ?? value?.negate_impact ??
      value?.winDelta ?? value?.impact;

    if (typeof cardName === 'string' && cardName && typeof winDelta === 'number') {
      results.push({ cardName, negateEffectiveness: Math.round(winDelta * 10) / 10 });
    }
  }
  return results;
}

/**
 * Uses Puppeteer to navigate untapped.gg, intercept XHR calls to the analytics
 * API, and extract card negate effectiveness data.
 */
async function scrapeViaPuppeteer(): Promise<CardNegateData[]> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const capturedData: CardNegateData[] = [];
    let discoveredEndpoint: string | null = null;

    // Intercept responses from the untapped analytics API
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('api.ygom.untapped.gg')) return;
      try {
        const json = await response.json();
        const data = json?.data;
        if (data && typeof data === 'object') {
          const parsed = parseCardNegateResponse(data);
          if (parsed.length > 0) {
            discoveredEndpoint = url;
            console.log(`[Untapped] Discovered card negate endpoint: ${url}`);
            capturedData.push(...parsed);
          }
        }
      } catch { /* non-JSON response */ }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    );

    // Navigate to decks page and wait for content to load
    await page.goto('https://ygom.untapped.gg/en/decks', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Try to click the first deck link to trigger card-level API calls
    try {
      await page.waitForSelector('a[href*="/en/decks/"]', { timeout: 10000 });
      const deckLinks = await page.$$('a[href*="/en/decks/"]');
      if (deckLinks.length > 0) {
        await deckLinks[0].click();
        await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
      }
    } catch { /* no deck links found */ }

    if (capturedData.length === 0) {
      // Strategy C: scrape rendered DOM for card impact stats
      const domResults = await scrapeCardImpactFromDom(page);
      capturedData.push(...domResults);
    }

    if (discoveredEndpoint) {
      console.log(`[Untapped] Discovered endpoint for future use: ${discoveredEndpoint}`);
    }

    return capturedData;
  } finally {
    await browser.close();
  }
}

/**
 * Scrapes card impact stats from the rendered DOM of the current Puppeteer page.
 * Looks for elements containing card names paired with win delta percentages.
 */
async function scrapeCardImpactFromDom(page: any): Promise<CardNegateData[]> {
  return page.evaluate(() => {
    const results: Array<{ cardName: string; negateEffectiveness: number }> = [];
    // Look for any section labelled "negate", "impact", "card impact" etc.
    const allText = document.querySelectorAll('[class*="negate"], [class*="impact"], [class*="card-stat"]');
    allText.forEach((el) => {
      const nameEl = el.querySelector('[class*="name"], [class*="card"]');
      const valueEl = el.querySelector('[class*="delta"], [class*="value"], [class*="rate"]');
      if (nameEl && valueEl) {
        const cardName = nameEl.textContent?.trim();
        const rawValue = valueEl.textContent?.replace('%', '').trim();
        const value = parseFloat(rawValue || '');
        if (cardName && !isNaN(value)) {
          results.push({ cardName, negateEffectiveness: value });
        }
      }
    });
    return results;
  });
}

/**
 * Fetches stats for a specific archetype by name.
 * Returns data from the cached tier list.
 */
export async function scrapeArchetypeStats(
  _archetypeId: number,
  slug: string
): Promise<Omit<UntappedArchetype, 'name' | 'tier'> | null> {
  const cacheKey = `untapped:archetype:${slug}`;
  const cached = await getCached<Omit<UntappedArchetype, 'name' | 'tier'>>(cacheKey);
  if (cached) return cached;

  // Get from the main tier list data
  const tierList = await scrapeTierList();
  const name = slug.replace(/-/g, ' ');
  const match = tierList.find(a =>
    a.name.toLowerCase() === name.toLowerCase()
  );

  if (!match) return null;

  const result = {
    winRate: match.winRate,
    playRate: match.playRate,
    sampleSize: match.sampleSize,
  };

  await setCache(cacheKey, result, config.cache.untappedTtl);
  return result;
}
```

## File: client/src/api/matchups.ts
```typescript
import api from './client';
import type { Matchup, EcosystemAnalysis, DeckEcosystemResponse } from '../types/meta';

export interface MatchupMatrixCell {
  rate: number;
  n_untapped: number;
  n_tournament: number;
  confidence: 'high' | 'medium' | 'low';
  inferred?: boolean;
  inference_method?: string;
}

export interface MatchupMatrix {
  decks: string[];
  matrix: Record<string, Record<string, MatchupMatrixCell>>;
}

export interface AdvisorOpponent {
  opponent: string;
  field_pct: number;
  win_rate: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface AdvisorResult {
  deck: string;
  opponents: AdvisorOpponent[];
  weighted_win_rate: number;
}

export async function getMatchups(deck?: string, signal?: AbortSignal): Promise<Matchup[]> {
  const res = await api.get('/matchups', { params: deck ? { deck } : {}, signal });
  return res.data;
}

export async function getMatchupMatrix(source: 'blended' | 'untapped' | 'tournament' = 'blended', infer: boolean = false, signal?: AbortSignal): Promise<MatchupMatrix> {
  const res = await api.get('/matchups/matrix', { params: { source, ...(infer ? { infer: 'true' } : {}) }, signal });
  return res.data;
}

export async function getMatchupAdvisor(deck: string, signal?: AbortSignal): Promise<AdvisorResult> {
  const res = await api.get('/matchups/advisor', { params: { deck }, signal });
  return res.data;
}

export async function getEcosystemAnalysis(signal?: AbortSignal): Promise<EcosystemAnalysis> {
  const res = await api.get('/matchups/ecosystem', { signal });
  return res.data;
}

export async function getDeckEcosystem(deck: string, signal?: AbortSignal): Promise<DeckEcosystemResponse> {
  const res = await api.get('/matchups/ecosystem', { params: { deck }, signal });
  return res.data;
}
```

## File: client/src/pages/CardSearch.tsx
```typescript
import { useState, useEffect } from 'react';
import axios from 'axios';
import { searchCards, getArchetypes } from '../api/cards';
import type { Card, CardSearchResult } from '../types/card';
import { useDebounce } from '../hooks/useDebounce';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SearchInput from '../components/common/SearchInput';
import Pagination from '../components/common/Pagination';
import CardImage from '../components/common/CardImage';
import NegateImpact from '../components/common/NegateImpact';
import ErrorBanner from '../components/common/ErrorBanner';

const CARD_TYPES = ['Effect Monster', 'Normal Monster', 'Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster', 'Ritual Monster', 'Spell Card', 'Trap Card'];
const ATTRIBUTES = ['DARK', 'LIGHT', 'WATER', 'FIRE', 'EARTH', 'WIND', 'DIVINE'];

const selectClass = "bg-md-bg border border-md-border rounded-lg px-3 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue/50 focus:ring-1 focus:ring-md-blue/20 transition-colors";

function negateColorClass(value: number): string {
  if (value > 8) return 'text-md-red border-md-red/20 bg-md-red/10';
  if (value > 4) return 'text-md-orange border-md-orange/20 bg-md-orange/10';
  return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10';
}

export default function CardSearch() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [attribute, setAttribute] = useState('');
  const [archetype, setArchetype] = useState('');
  const [sort, setSort] = useState('popular');
  const [result, setResult] = useState<CardSearchResult | null>(null);
  const [archetypes, setArchetypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    getArchetypes().then(setArchetypes).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { setPage(1); }, [debouncedQuery, type, attribute, archetype, sort]);

  useEffect(() => {
    const controller = new AbortController();
    const params: Record<string, string> = { page: String(page), limit: '30', sort };
    if (debouncedQuery) params.q = debouncedQuery;
    if (type) params.type = type;
    if (attribute) params.attribute = attribute;
    if (archetype) params.archetype = archetype;

    setLoading(true);
    searchCards(params, controller.signal)
      .then(setResult)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQuery, type, attribute, archetype, sort, page]);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold tracking-tight"><span className="text-shimmer">Card Search</span></h2>

      {/* Filters */}
      <div className="bg-md-surface border border-md-border rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search cards..." />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
            <option value="popular">MDM Popular</option>
            <option value="name">Alphabetical</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            <option value="">All Types</option>
            {CARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={attribute} onChange={(e) => setAttribute(e.target.value)} className={selectClass}>
            <option value="">All Attributes</option>
            {ATTRIBUTES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={archetype} onChange={(e) => setArchetype(e.target.value)} className={selectClass}>
            <option value="">All Archetypes</option>
            {archetypes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : result ? (
        <>
          <p className="text-xs text-md-textMuted font-mono">{result.total.toLocaleString()} results</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {result.cards.map((card) => (
              <div
                key={card.id}
                className="bg-md-surface border border-md-border rounded-lg overflow-hidden card-hover cursor-pointer group"
                onClick={() => setSelectedCard(card)}
              >
                <div className="overflow-hidden">
                  <CardImage src={card.image_small_url} alt={card.name} size="lg" className="w-full h-auto transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate group-hover:text-md-blue transition-colors">{card.name}</p>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {card.ban_status_md && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${card.ban_status_md === 'Banned' ? 'bg-md-red/10 text-md-red border border-md-red/20' : card.ban_status_md === 'Limited' ? 'bg-md-orange/10 text-md-orange border border-md-orange/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                        {card.ban_status_md}
                      </span>
                    )}
                    {card.md_rarity && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${card.md_rarity === 'UR' ? 'bg-rarity-ur/10 text-rarity-ur border border-rarity-ur/20' : card.md_rarity === 'SR' ? 'bg-rarity-sr/10 text-rarity-sr border border-rarity-sr/20' : 'bg-rarity-r/10 text-rarity-r border border-rarity-r/20'}`}>
                        {card.md_rarity}
                      </span>
                    )}
                    {card.negate_effectiveness != null && card.negate_effectiveness > 2 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium border ${negateColorClass(card.negate_effectiveness)}`}>
                        ⛔ +{card.negate_effectiveness.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Pagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />
          </div>
        </>
      ) : null}

      {/* Card Detail Modal */}
      {selectedCard && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-md-surface border border-md-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-surface-lg animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-6">
              <CardImage src={selectedCard.image_url} alt={selectedCard.name} size="lg" className="w-80 h-220 flex-shrink-0 rounded-lg shadow-card" />
              <div className="flex-1 space-y-1">
                <h3 className="text-xl font-bold tracking-tight">{selectedCard.name}</h3>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 bg-md-surfaceAlt rounded-md text-xs text-md-textSecondary border border-md-border/50">{selectedCard.type}</span>
                  {selectedCard.attribute && <span className="px-2 py-0.5 bg-md-surfaceAlt rounded-md text-xs text-md-textSecondary border border-md-border/50">{selectedCard.attribute}</span>}
                  {selectedCard.race && <span className="px-2 py-0.5 bg-md-surfaceAlt rounded-md text-xs text-md-textSecondary border border-md-border/50">{selectedCard.race}</span>}
                  {selectedCard.archetype && <span className="px-2 py-0.5 bg-md-blue/10 rounded-md text-xs text-md-blue border border-md-blue/20">{selectedCard.archetype}</span>}
                </div>
                <div className="flex gap-4 text-sm">
                  {selectedCard.atk != null && <span className="text-md-textMuted">ATK <span className="text-md-red font-bold">{selectedCard.atk}</span></span>}
                  {selectedCard.def != null && <span className="text-md-textMuted">DEF <span className="text-md-blue font-bold">{selectedCard.def}</span></span>}
                  {selectedCard.level != null && <span className="text-md-textMuted">LV <span className="text-md-gold font-bold">{selectedCard.level}</span></span>}
                  {selectedCard.link_val != null && <span className="text-md-textMuted">Link <span className="text-md-blue font-bold">{selectedCard.link_val}</span></span>}
                </div>
                <p className="text-sm text-md-textSecondary leading-relaxed">{selectedCard.description}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedCard.ban_status_md && (
                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${selectedCard.ban_status_md === 'Banned' ? 'bg-md-red/10 text-md-red border border-md-red/20' : 'bg-md-orange/10 text-md-orange border border-md-orange/20'}`}>
                      {selectedCard.ban_status_md}
                    </span>
                  )}
                  {selectedCard.md_rarity && (
                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${selectedCard.md_rarity === 'UR' ? 'bg-rarity-ur/10 text-rarity-ur border border-rarity-ur/20' : 'bg-rarity-sr/10 text-rarity-sr border border-rarity-sr/20'}`}>
                      {selectedCard.md_rarity}
                    </span>
                  )}
                </div>
                <NegateImpact card={selectedCard} />
              </div>
            </div>
            <button
              onClick={() => setSelectedCard(null)}
              className="mt-5 w-full py-2 bg-md-surfaceAlt border border-md-border rounded-lg text-sm text-md-textMuted hover:text-md-text hover:bg-md-surfaceHover transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

## File: server/src/db/schema.sql
```sql
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  frame_type TEXT,
  description TEXT,
  atk INTEGER,
  def INTEGER,
  level INTEGER,
  race TEXT,
  attribute TEXT,
  archetype TEXT,
  link_val INTEGER,
  link_markers TEXT,
  scale INTEGER,
  image_url TEXT,
  image_small_url TEXT,
  image_cropped_url TEXT,
  ban_status_md TEXT,
  md_rarity TEXT,
  negate_effectiveness REAL,
  negated_win_rate REAL,
  not_negated_win_rate REAL,
  negate_sample_size INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_archetype ON cards(archetype);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
CREATE INDEX IF NOT EXISTS idx_cards_attribute ON cards(attribute);

CREATE TABLE IF NOT EXISTS archetypes (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS deck_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier INTEGER,
  power REAL,
  power_trend REAL,
  pop_rank INTEGER,
  master_pop_rank INTEGER,
  overview TEXT,
  thumbnail_image TEXT,
  avg_ur_price REAL,
  avg_sr_price REAL,
  breakdown_json TEXT,
  win_rate REAL,
  play_rate REAL,
  sample_size INTEGER,
  untapped_tier INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS top_decks (
  id TEXT PRIMARY KEY,
  deck_type_name TEXT,
  author TEXT,
  main_deck_json TEXT,
  extra_deck_json TEXT,
  side_deck_json TEXT,
  tournament_name TEXT,
  tournament_placement TEXT,
  ranked_type TEXT,
  created_at TEXT,
  gems_price INTEGER,
  ur_price INTEGER,
  sr_price INTEGER,
  url TEXT,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT,
  short_name TEXT,
  banner_image TEXT,
  next_date TEXT,
  placements_json TEXT,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS meta_snapshots (
  id SERIAL PRIMARY KEY,
  deck_type_name TEXT NOT NULL,
  tier INTEGER,
  power REAL,
  pop_rank REAL,
  snapshot_date TEXT NOT NULL,
  UNIQUE(deck_type_name, snapshot_date)
);

CREATE TABLE IF NOT EXISTS matchups (
  deck_a TEXT,
  deck_b TEXT,
  win_rate_a REAL,
  sample_size INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  PRIMARY KEY (deck_a, deck_b)
);

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  data TEXT,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_log (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  detail TEXT,
  synced_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
);

CREATE TABLE IF NOT EXISTS matchup_sources (
  deck_a TEXT NOT NULL,
  deck_b TEXT NOT NULL,
  source TEXT NOT NULL,
  win_rate REAL NOT NULL,
  sample_size INTEGER,
  updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  PRIMARY KEY (deck_a, deck_b, source)
);
```

## File: server/src/routes/banList.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryOne } from '../utils/dbHelpers.js';
import * as mdm from '../services/mdmService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const banList = await mdm.getBanList();

    const enrichCard = async (card: mdm.MDMBanCard) => {
      const local = await queryOne(pool,
        'SELECT image_small_url, image_cropped_url, id, md_rarity, negate_effectiveness, negated_win_rate, not_negated_win_rate, negate_sample_size FROM cards WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [card.name]
      );
      return {
        ...card,
        id: local?.id ?? null,
        image_small_url: local?.image_small_url ?? null,
        image_cropped_url: local?.image_cropped_url ?? null,
        rarity: card.rarity ?? local?.md_rarity ?? null,
        negate_effectiveness: local?.negate_effectiveness ?? null,
        negated_win_rate: local?.negated_win_rate ?? null,
        not_negated_win_rate: local?.not_negated_win_rate ?? null,
        negate_sample_size: local?.negate_sample_size ?? null,
      };
    };

    const sortByDate = (cards: Awaited<ReturnType<typeof enrichCard>>[]) =>
      [...cards].sort((a, b) => {
        if (!a.banListDate && !b.banListDate) return 0;
        if (!a.banListDate) return 1;
        if (!b.banListDate) return -1;
        return b.banListDate.localeCompare(a.banListDate);
      });

    const forbidden = sortByDate(await Promise.all(banList.forbidden.map(enrichCard)));
    const limited = sortByDate(await Promise.all(banList.limited.map(enrichCard)));
    const semiLimited = sortByDate(await Promise.all(banList.semiLimited.map(enrichCard)));

    res.json({ forbidden, limited, semiLimited });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Temporary debug - remove after checking
router.get('/debug-raw', async (_req: Request, res: Response) => {
  const axios = (await import('axios')).default;
  try {
    const r = await axios.get('https://www.masterduelmeta.com/api/v1/cards', {
      params: { banStatus: 'Forbidden', limit: 2 },
    });
    const data = Array.isArray(r.data) ? r.data : [];
    res.json({ fields: data[0] ? Object.keys(data[0]) : [], sample: data[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
```

## File: server/src/routes/sync.ts
```typescript
import { Router, Request, Response } from 'express';
import {
  syncCards, syncArchetypes, syncDeckTypes, syncTopDecks,
  syncTournaments, syncUntapped, syncCardNegateEffectiveness
} from '../services/syncService.js';
import { recordSync, getSyncStatus, SyncSource } from '../services/syncStatusService.js';
import { clearCache } from '../services/cacheService.js';

const router = Router();

router.post('/cards', async (_req: Request, res: Response) => {
  try {
    const count = await syncCards();
    await syncArchetypes();
    await recordSync('ygoprodeck', 'success');
    res.json({ message: `Synced ${count} cards` });
  } catch (err: any) {
    await recordSync('ygoprodeck', 'failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/meta', async (_req: Request, res: Response) => {
  let step = 'init';
  try {
    await clearCache('mdm');
    step = 'syncDeckTypes';
    const dtCount = await syncDeckTypes();
    step = 'syncTopDecks';
    const tdCount = await syncTopDecks();
    await recordSync('mdm_deck_types', 'success');
    step = 'syncTournaments';
    const tCount = await syncTournaments();
    await recordSync('mdm_tournaments', 'success');
    step = 'syncUntapped';
    const uCount = await syncUntapped();
    await recordSync('untapped', 'success');
    res.json({ message: `Synced ${dtCount} deck types, ${tdCount} top decks, ${tCount} tournaments, ${uCount} untapped archetypes` });
  } catch (err: any) {
    const source =
      step === 'syncTournaments' ? 'mdm_tournaments' :
      step === 'syncUntapped'    ? 'untapped'        : 'mdm_deck_types';
    await recordSync(source as SyncSource, 'failed', String(err?.message || err));
    console.error(`[Sync] Meta sync failed at step "${step}":`, err);
    res.status(500).json({ error: `${step}: ${String(err?.message || err)}` });
  }
});

router.post('/untapped', async (_req: Request, res: Response) => {
  try {
    await clearCache('untapped');
    const count = await syncUntapped();
    await recordSync('untapped', 'success');
    res.json({ message: `Synced ${count} archetypes from untapped.gg` });
  } catch (err: any) {
    await recordSync('untapped', 'failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/negate', async (_req: Request, res: Response) => {
  try {
    await clearCache('untapped:card-negate');
    const count = await syncCardNegateEffectiveness();
    res.json({ message: `Updated ${count} cards with negate effectiveness data` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/all', async (_req: Request, res: Response) => {
  let step = 'init';
  try {
    await clearCache('mdm');
    step = 'syncCards';
    const cardCount = await syncCards();
    await syncArchetypes();
    await recordSync('ygoprodeck', 'success');
    step = 'syncDeckTypes';
    const dtCount = await syncDeckTypes();
    step = 'syncTopDecks';
    const tdCount = await syncTopDecks();
    await recordSync('mdm_deck_types', 'success');
    step = 'syncTournaments';
    const tCount = await syncTournaments();
    await recordSync('mdm_tournaments', 'success');
    step = 'syncUntapped';
    const uCount = await syncUntapped();
    await recordSync('untapped', 'success');
    step = 'syncNegate';
    const nCount = await syncCardNegateEffectiveness();
    res.json({
      message: 'Full sync complete',
      cards: cardCount, deckTypes: dtCount, topDecks: tdCount,
      tournaments: tCount, untappedArchetypes: uCount, cardNegateEffectiveness: nCount,
    });
  } catch (err: any) {
    const source: SyncSource =
      step === 'syncTournaments' ? 'mdm_tournaments' :
      step === 'syncUntapped'    ? 'untapped'        :
      (step === 'syncDeckTypes' || step === 'syncTopDecks') ? 'mdm_deck_types' : 'ygoprodeck';
    await recordSync(source, 'failed', String(err?.message || err));
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json(await getSyncStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## File: server/src/routes/decks.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { tier } = req.query;
    let decks;
    if (tier != null) {
      decks = await queryAll(pool, 'SELECT * FROM deck_types WHERE tier = $1 ORDER BY power DESC', [parseInt(tier as string)]);
    } else {
      decks = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');
    }
    res.json(decks.map((d: any) => ({
      ...d,
      breakdown_json: d.breakdown_json ? JSON.parse(d.breakdown_json) : null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/decks/featured — top 3 archetypes with most-used card images for dashboard
router.get('/featured', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const top3 = await queryAll(pool,
      `SELECT id, name, tier, power, power_trend, thumbnail_image, win_rate, play_rate
       FROM deck_types
       WHERE power IS NOT NULL AND power > 0
       ORDER BY power DESC
       LIMIT 3`
    );

    // Build a set of archetype card names from the cards table for filtering
    const archetypeCards = new Map<string, Set<string>>();
    const allArchCards = await queryAll(pool,
      `SELECT name, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`
    );
    for (const c of allArchCards) {
      const key = (c.archetype as string).toLowerCase();
      if (!archetypeCards.has(key)) archetypeCards.set(key, new Set());
      archetypeCards.get(key)!.add(c.name as string);
    }

    const result = [];
    for (const deck of top3) {
      // Determine which archetypes belong to this deck
      const deckNameLower = (deck.name as string).toLowerCase();
      const deckArchetypeNames = new Set<string>();
      for (const [archKey, cardSet] of archetypeCards) {
        if (deckNameLower.includes(archKey) || archKey.includes(deckNameLower)) {
          for (const name of cardSet) deckArchetypeNames.add(name);
        }
      }

      // Get recent top decks for this archetype
      const topDecks = await queryAll(pool,
        `SELECT main_deck_json FROM top_decks
         WHERE LOWER(deck_type_name) = LOWER($1)
         ORDER BY created_at DESC LIMIT 20`,
        [deck.name]
      );

      // Aggregate card frequencies — only count cards that belong to the deck's archetype(s)
      const freq = new Map<string, number>();
      for (const td of topDecks) {
        if (!td.main_deck_json) continue;
        try {
          const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
          for (const c of cards) {
            if (c.cardName && c.cardName !== 'Unknown' && deckArchetypeNames.has(c.cardName)) {
              freq.set(c.cardName, (freq.get(c.cardName) || 0) + 1);
            }
          }
        } catch { /* skip */ }
      }

      // Sort by frequency, take top 5
      let topCardNames = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      // Fallback for engine decks with no tournament data: use archetype cards directly
      if (topCardNames.length === 0 && deckArchetypeNames.size > 0) {
        const names = [...deckArchetypeNames];
        const placeholders = names.map((_, i) => `$${i + 1}`).join(',');
        const archetypeCardRows = await queryAll(pool,
          `SELECT name, image_small_url, image_cropped_url FROM cards WHERE LOWER(name) IN (${placeholders}) AND (image_small_url IS NOT NULL OR image_cropped_url IS NOT NULL) LIMIT 5`,
          names.map(n => n.toLowerCase())
        );
        const cards = archetypeCardRows.map((c: any) => ({
          name: c.name,
          image: c.image_cropped_url || c.image_small_url,
        }));
        result.push({ ...deck, cards });
        continue;
      }

      // Fetch card images
      const cards = [];
      for (const cardName of topCardNames) {
        const card = await queryOne(pool,
          `SELECT name, image_small_url, image_cropped_url FROM cards WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [cardName]
        );
        if (card) {
          cards.push({
            name: card.name,
            image: card.image_cropped_url || card.image_small_url,
          });
        }
      }

      result.push({ ...deck, cards });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const deck = await queryOne(pool, 'SELECT * FROM deck_types WHERE LOWER(name) = LOWER($1)', [req.params.name]);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    let topDecks = await queryAll(pool,
      'SELECT * FROM top_decks WHERE LOWER(deck_type_name) = LOWER($1) ORDER BY created_at DESC LIMIT 10',
      [req.params.name]);

    // Fuzzy fallback: if no exact match, try LIKE-based matching (e.g. "Snake-Eye" → "Snake-Eye Fire King")
    if (topDecks.length === 0) {
      const words = req.params.name.split(/[\s\-]+/).filter((w: string) => w.length >= 3);
      if (words.length > 0) {
        const likeClause = words.map((_, i) => `LOWER(deck_type_name) LIKE $${i + 1}`).join(' AND ');
        const likeParams = words.map((w: string) => `%${w.toLowerCase()}%`);
        topDecks = await queryAll(pool,
          `SELECT * FROM top_decks WHERE ${likeClause} ORDER BY created_at DESC LIMIT 10`,
          likeParams);
      }
    }

    // Parse breakdown and resolve card IDs to names if needed
    let breakdown = deck.breakdown_json ? JSON.parse(deck.breakdown_json) : null;
    if (breakdown?.cards) {
      // MDM breakdown cards have {card: "<id>", per: <usage%>, avgAt: <avg copies>}
      // Try to enrich with card names from top deck data
      const allCardNames = new Map<string, string>();
      for (const td of topDecks) {
        const main = td.main_deck_json ? JSON.parse(td.main_deck_json) : [];
        for (const c of main) {
          if (c.cardName) allCardNames.set(c.cardName.toLowerCase(), c.cardName);
        }
      }

      breakdown.cards = breakdown.cards.map((c: any) => ({
        ...c,
        cardName: c.cardName || c.name || null,
        percentage: c.per ?? c.percentage,
        amount: c.avgAt ?? c.at ?? c.amount,
      }));
    }

    // Collect all unique card names from top decks for batch enrichment
    const allNames = new Set<string>();
    const parsedTopDecks = topDecks.map((d: any) => {
      const main = d.main_deck_json ? JSON.parse(d.main_deck_json) : null;
      const extra = d.extra_deck_json ? JSON.parse(d.extra_deck_json) : null;
      const side = d.side_deck_json ? JSON.parse(d.side_deck_json) : null;
      for (const arr of [main, extra, side]) {
        if (arr) for (const c of arr) if (c.cardName) allNames.add(c.cardName);
      }
      return { ...d, main_deck_json: main, extra_deck_json: extra, side_deck_json: side };
    });

    // Batch lookup card info (images, type, archetype)
    const cardInfoMap = new Map<string, any>();
    if (allNames.size > 0) {
      const names = Array.from(allNames);
      const placeholders = names.map((_, i) => `$${i + 1}`).join(',');
      const cardRows = await queryAll(pool,
        `SELECT name, type, frame_type, archetype, image_small_url, negate_effectiveness, negated_win_rate, not_negated_win_rate, negate_sample_size FROM cards WHERE LOWER(name) IN (${placeholders})`,
        names.map(n => n.toLowerCase()));
      for (const row of cardRows) {
        cardInfoMap.set(row.name.toLowerCase(), row);
      }
    }

    const enrichCard = (c: any) => {
      const info = cardInfoMap.get((c.cardName || '').toLowerCase());
      return {
        ...c,
        imageUrl: info?.image_small_url || null,
        type: info?.type || null,
        frameType: info?.frame_type || null,
        archetype: info?.archetype || null,
        negate_effectiveness: info?.negate_effectiveness ?? null,
        negated_win_rate: info?.negated_win_rate ?? null,
        not_negated_win_rate: info?.not_negated_win_rate ?? null,
        negate_sample_size: info?.negate_sample_size ?? null,
      };
    };

    res.json({
      ...deck,
      breakdown_json: breakdown,
      topDecks: parsedTopDecks.map((d: any) => ({
        ...d,
        main_deck_json: d.main_deck_json?.map(enrichCard) || null,
        extra_deck_json: d.extra_deck_json?.map(enrichCard) || null,
        side_deck_json: d.side_deck_json?.map(enrichCard) || null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name/top-lists', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const topDecks = await queryAll(pool,
      'SELECT * FROM top_decks WHERE LOWER(deck_type_name) = LOWER($1) ORDER BY created_at DESC LIMIT 20',
      [req.params.name]);

    res.json(topDecks.map((d: any) => ({
      ...d,
      main_deck_json: d.main_deck_json ? JSON.parse(d.main_deck_json) : null,
      extra_deck_json: d.extra_deck_json ? JSON.parse(d.extra_deck_json) : null,
      side_deck_json: d.side_deck_json ? JSON.parse(d.side_deck_json) : null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## File: server/src/routes/matchups.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, run } from '../utils/dbHelpers.js';
import * as mdm from '../services/mdmService.js';
import { blendMatchupRates, buildFullMatrix } from '../services/matchupBlendService.js';
import { computeEcosystemAnalysis } from '../services/ecosystemAnalysisService.js';

const router = Router();

// Existing: per-deck matchup list (unchanged behaviour)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { deck } = req.query;
    const pool = getPool();

    if (deck) {
      let rows = await queryAll(pool, 'SELECT * FROM matchups WHERE LOWER(deck_a) = LOWER($1)', [deck as string]);
      if (rows.length === 0) {
        const scraped = await mdm.scrapeMatchups(deck as string);
        for (const m of scraped) {
          await run(pool, "INSERT INTO matchups (deck_a, deck_b, win_rate_a, sample_size, updated_at) VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT (deck_a, deck_b) DO UPDATE SET win_rate_a = EXCLUDED.win_rate_a, sample_size = EXCLUDED.sample_size, updated_at = EXCLUDED.updated_at",
            [deck, m.opponent, m.winRate, m.sampleSize]);
        }
        rows = await queryAll(pool, 'SELECT * FROM matchups WHERE LOWER(deck_a) = LOWER($1)', [deck as string]);
      }
      return res.json(rows);
    }

    res.json(await queryAll(pool, 'SELECT * FROM matchups ORDER BY deck_a, deck_b'));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// New: full NxN heatmap matrix
router.get('/matrix', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string) || 'blended';
    const infer = req.query.infer === 'true';
    const pool = getPool();
    res.json(await buildFullMatrix(pool, source, infer));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// New: ecosystem analysis with predator/prey dynamics
router.get('/ecosystem', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string) || 'blended';
    const deckFilter = req.query.deck as string | undefined;
    const pool = getPool();
    const analysis = await computeEcosystemAnalysis(pool, source);

    if (deckFilter) {
      const profile = analysis.profiles.find(
        (p) => p.deck.toLowerCase() === deckFilter.toLowerCase()
      );
      const relatedCycles = analysis.cycles.filter(
        (c) => c.decks.some((d) => d.toLowerCase() === deckFilter.toLowerCase())
      );
      return res.json({
        profile: profile || null,
        related_cycles: relatedCycles,
        meta_health_index: analysis.meta_health_index,
        computed_at: analysis.computed_at,
      });
    }

    res.json(analysis);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// New: meta advisor for a specific deck
router.get('/advisor', async (req: Request, res: Response) => {
  try {
    const { deck } = req.query;
    if (!deck) return res.status(400).json({ error: 'deck parameter required' });

    const pool = getPool();

    // Field composition from last 3 tournaments
    const tournaments = await queryAll(pool,
      'SELECT placements_json FROM tournaments ORDER BY updated_at DESC LIMIT 3'
    ) as { placements_json: string }[];

    const deckCounts: Record<string, number> = {};
    let total = 0;
    for (const t of tournaments) {
      let placements: any[] = [];
      try { placements = JSON.parse(t.placements_json || '[]'); } catch { /* ignore parse errors */ }
      for (const p of placements) {
        const name: string | undefined = p.deck_type_name || p.deckType || p.deck || p.name;
        if (name) { deckCounts[name] = (deckCounts[name] || 0) + 1; total++; }
      }
    }

    if (total === 0) {
      return res.json({ deck, opponents: [], weighted_win_rate: 0.5, note: 'No tournament placement data available' });
    }

    // Matchup rates: prefer matchup_sources, fall back to legacy matchups table
    const matchupRows = await queryAll(pool,
      'SELECT * FROM matchup_sources WHERE LOWER(deck_a) = LOWER($1)',
      [deck as string]
    ) as { deck_b: string; source: string; win_rate: number; sample_size: number }[];

    const legacyMatchups = await queryAll(pool,
      'SELECT deck_b, win_rate_a, sample_size FROM matchups WHERE LOWER(deck_a) = LOWER($1)',
      [deck as string]
    ) as { deck_b: string; win_rate_a: number; sample_size: number }[];

    const opponents = Object.entries(deckCounts)
      .filter(([name]) => name.toLowerCase() !== (deck as string).toLowerCase())
      .map(([name, count]) => {
        const fieldPct = count / total;
        const nl = name.toLowerCase();
        const untapRow = matchupRows.find((r) => r.deck_b.toLowerCase() === nl && r.source === 'untapped');
        const tournRow = matchupRows.find((r) => r.deck_b.toLowerCase() === nl && r.source === 'tournament');
        const legacyRow = legacyMatchups.find((r) => r.deck_b.toLowerCase() === name.toLowerCase());

        const untappedData = untapRow
          ? { rate: untapRow.win_rate, n: untapRow.sample_size ?? 0 }
          : legacyRow
          ? { rate: legacyRow.win_rate_a / 100, n: legacyRow.sample_size ?? 0 }
          : null;
        const tournData = tournRow ? { rate: tournRow.win_rate, n: tournRow.sample_size ?? 0 } : null;
        const blend = blendMatchupRates(untappedData, tournData);

        return { opponent: name, field_pct: fieldPct, win_rate: blend.rate, confidence: blend.confidence };
      })
      .sort((a, b) => b.field_pct - a.field_pct);

    const totalWeight = opponents.reduce((s, o) => s + o.field_pct, 0) || 1;
    const weightedWinRate = opponents.reduce((s, o) => s + o.win_rate * o.field_pct, 0) / totalWeight;

    res.json({ deck, opponents, weighted_win_rate: weightedWinRate });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
```

## File: server/src/routes/tierList.ts
```typescript
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import { syncDeckTypes } from '../services/syncService.js';

// Manual overrides for MDM deck names → YGOProDeck archetype keys
const ARCHETYPE_OVERRIDES: Record<string, string[]> = {
  'vanquish soul k9': ['vanquish soul'],
  'solfachord yummy': ['solfachord'],
  'mitsurugi yummy': ['mitsurugi'],
  'crystron k9': ['crystron'],
  'white forest azamina': ['white forest', 'azamina'],
  'ryzeal mitsurugi': ['ryzeal', 'mitsurugi'],
  'dinos': ['dinomorphia', 'dinosaur'],
  'earth machine': ['machina', 'infinitrack'],
  'zombies': ['zombie'],
  'telefon combo': ['telefon'],
  // Engine aggregations from MDM website
  'mitsurugi engine': ['mitsurugi'],
  'yummy engine': ['yummy'],
  'k9 engine': ['k9'],
};

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    let deckTypes = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');

    if (deckTypes.length === 0) {
      await syncDeckTypes();
      deckTypes = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');
    }

    // Build archetype → card-names map (same logic as /decks/featured)
    const archetypeCards = new Map<string, Set<string>>();
    const allArchCards = await queryAll(pool,
      `SELECT name, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`
    );
    for (const c of allArchCards) {
      const key = (c.archetype as string).toLowerCase();
      if (!archetypeCards.has(key)) archetypeCards.set(key, new Set());
      archetypeCards.get(key)!.add(c.name as string);
    }

    const grouped: Record<string, any[]> = { '0': [], '1': [], '2': [], '3': [], rogue: [] };
    for (const d of deckTypes) {
      const key = d.tier != null ? String(d.tier) : 'rogue';
      if (!grouped[key]) grouped[key] = [];

      const deckNameLower = (d.name as string).toLowerCase();
      const deckArchetypeNames = new Set<string>();

      // Step 0: Check manual overrides first
      const overrideKeys = ARCHETYPE_OVERRIDES[deckNameLower];
      if (overrideKeys) {
        for (const ok of overrideKeys) {
          const cardSet = archetypeCards.get(ok);
          if (cardSet) for (const name of cardSet) deckArchetypeNames.add(name);
        }
      }

      // Step 1: Substring match against all archetypes
      if (deckArchetypeNames.size === 0) {
        for (const [archKey, cardSet] of archetypeCards) {
          if (deckNameLower.includes(archKey) || archKey.includes(deckNameLower)) {
            for (const name of cardSet) deckArchetypeNames.add(name);
          }
        }
      }

      // Step 2: Get recent top decks for card frequency
      const topDecks = await queryAll(pool,
        `SELECT main_deck_json FROM top_decks
         WHERE LOWER(deck_type_name) = LOWER($1)
         ORDER BY created_at DESC LIMIT 20`,
        [d.name]
      );

      // Step 3: Aggregate card frequencies — prefer archetype-matched cards
      const freq = new Map<string, number>();
      for (const td of topDecks) {
        if (!td.main_deck_json) continue;
        try {
          const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
          for (const c of cards) {
            if (c.cardName && c.cardName !== 'Unknown' && deckArchetypeNames.has(c.cardName)) {
              freq.set(c.cardName, (freq.get(c.cardName) || 0) + 1);
            }
          }
        } catch { /* skip */ }
      }

      // Step 3b: Fallback — use most-played cards overall from top_decks
      if (freq.size === 0) {
        for (const td of topDecks) {
          if (!td.main_deck_json) continue;
          try {
            const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
            for (const c of cards) {
              if (c.cardName && c.cardName !== 'Unknown') {
                freq.set(c.cardName, (freq.get(c.cardName) || 0) + (c.amount || 1));
              }
            }
          } catch { /* skip */ }
        }
      }

      // Step 4: Build cards array from frequency data
      const topCardNames = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      const cards: Array<{ name: string; image: string | null }> = [];
      for (const cardName of topCardNames) {
        const card = await queryOne(pool,
          `SELECT name, image_cropped_url, image_small_url FROM cards WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [cardName]
        );
        if (card) {
          cards.push({
            name: card.name as string,
            image: (card.image_cropped_url || card.image_small_url || null) as string | null,
          });
        }
      }

      // Step 5: If no top_decks data but archetype cards were found, use archetype cards directly
      if (cards.length === 0 && deckArchetypeNames.size > 0) {
        const archNames = [...deckArchetypeNames].slice(0, 50);
        const placeholders = archNames.map((_, i) => `$${i + 1}`).join(',');
        const archCards = await queryAll(pool,
          `SELECT name, image_cropped_url, image_small_url FROM cards
           WHERE LOWER(name) IN (${placeholders})
             AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)
           LIMIT 3`,
          archNames.map(n => n.toLowerCase())
        );
        for (const card of archCards) {
          cards.push({
            name: card.name as string,
            image: (card.image_cropped_url || card.image_small_url || null) as string | null,
          });
        }
      }

      // Step 6: Fuzzy fallback — word-overlap scoring against all archetypes (up to 3 cards)
      if (cards.length === 0) {
        const deckWords = (d.name as string).toLowerCase().split(/[\s\-]+/).filter((w: string) => w.length >= 3);
        let bestMatch: string | null = null;
        let bestScore = 0;
        for (const [archKey] of archetypeCards) {
          const archWords = archKey.split(/[\s\-]+/);
          const score = deckWords.filter((w: string) => archWords.some((aw: string) => aw.includes(w) || w.includes(aw))).length;
          if (score > bestScore) { bestScore = score; bestMatch = archKey; }
        }
        if (bestMatch && bestScore > 0) {
          const matchedCardNames = [...archetypeCards.get(bestMatch)!];
          for (const cardName of matchedCardNames) {
            if (cards.length >= 3) break;
            const card = await queryOne(pool,
              `SELECT name, image_cropped_url, image_small_url FROM cards
               WHERE LOWER(name) = LOWER($1) AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)
               LIMIT 1`,
              [cardName]
            );
            if (card) {
              cards.push({
                name: card.name as string,
                image: (card.image_cropped_url || card.image_small_url || null) as string | null,
              });
            }
          }
        }
      }

      grouped[key].push({
        ...d,
        cards,
        thumbnail_image: d.thumbnail_image || (cards.length > 0 ? cards[0].image : null),
        breakdown_json: d.breakdown_json ? JSON.parse(d.breakdown_json) : null,
      });
    }

    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## File: client/src/pages/Matchups.tsx
```typescript
import { useState, useEffect } from 'react';
import axios from 'axios';
import { getMatchups, getMatchupMatrix, type MatchupMatrix } from '../api/matchups';
import { getDecks } from '../api/meta';
import { getSyncStatus, type SyncRecord } from '../api/sync';
import type { Matchup } from '../types/meta';
import type { DeckType } from '../types/deck';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorBanner from '../components/common/ErrorBanner';
import SyncFreshnessBadge from '../components/common/SyncFreshnessBadge';
import MetaAdvisor from '../components/matchups/MetaAdvisor';
import EcosystemView from '../components/matchups/EcosystemView';
import clsx from 'clsx';

type MatrixSource = 'blended' | 'untapped' | 'tournament';

function getWinRateColor(rate: number): string {
  if (rate >= 0.60) return 'bg-md-green/30 text-md-green';
  if (rate >= 0.55) return 'bg-md-green/15 text-md-green';
  if (rate >= 0.45) return 'bg-md-textMuted/10 text-md-textMuted';
  if (rate >= 0.40) return 'bg-md-red/15 text-md-red';
  return 'bg-md-red/30 text-md-red';
}

function getRelationshipLabel(rate: number): string {
  if (rate >= 0.60) return 'Hard Counter';
  if (rate >= 0.55) return 'Soft Counter';
  if (rate >= 0.48) return 'Neutral';
  if (rate >= 0.40) return 'Unfavoured';
  return 'Hard Countered';
}

function getRelationshipIcon(rate: number): string {
  if (rate >= 0.60) return '\u{1F480}'; // skull
  if (rate >= 0.55) return '\u{1F6E1}'; // shield
  if (rate >= 0.48) return '\u2014';    // dash
  if (rate >= 0.40) return '\u26A0';    // warning
  return '\u{1F480}';                   // skull (you're the prey)
}

export default function Matchups() {
  const [tab, setTab] = useState<'list' | 'matrix' | 'advisor' | 'ecosystem'>('matrix');
  const [decks, setDecks] = useState<DeckType[]>([]);
  const [selectedDeck, setSelectedDeck] = useState('');
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [matrix, setMatrix] = useState<MatchupMatrix | null>(null);
  const [matrixSource, setMatrixSource] = useState<MatrixSource>('blended');
  const [inferGaps, setInferGaps] = useState(true);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getSyncStatus().then(setSyncRecords).catch(() => {});
    getDecks()
      .then((d) => {
        const filtered = d.filter((dk) => dk.tier != null && dk.tier <= 3);
        setDecks(filtered);
        if (filtered.length > 0) setSelectedDeck(filtered[0].name);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'matrix') return;
    const controller = new AbortController();
    setLoading(true);
    getMatchupMatrix(matrixSource, inferGaps, controller.signal)
      .then(setMatrix)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [tab, matrixSource, inferGaps]);

  useEffect(() => {
    if (tab !== 'list' || !selectedDeck) return;
    const controller = new AbortController();
    setLoading(true);
    getMatchups(selectedDeck, controller.signal)
      .then(setMatchups)
      .catch((e) => { if (!axios.isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [tab, selectedDeck]);

  const tabClass = (t: string) => clsx(
    'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
    tab === t
      ? 'bg-md-blue/15 text-md-blue border border-md-blue/20'
      : 'text-md-textMuted hover:text-md-textSecondary hover:bg-md-surfaceHover/40'
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-md-gold">Matchup Analysis</h2>
        <SyncFreshnessBadge records={syncRecords} sources={['mdm_deck_types', 'mdm_tournaments']} />
      </div>

      <div className="flex gap-2">
        <button className={tabClass('matrix')} onClick={() => setTab('matrix')}>Matrix</button>
        <button className={tabClass('ecosystem')} onClick={() => setTab('ecosystem')}>Ecosystem</button>
        <button className={tabClass('advisor')} onClick={() => setTab('advisor')}>Meta Advisor</button>
        <button className={tabClass('list')} onClick={() => setTab('list')}>By Deck</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

      {tab === 'matrix' && (
        <div className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
          <div className="flex gap-2 items-center">
            {(['blended', 'untapped', 'tournament'] as MatrixSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setMatrixSource(s)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                  matrixSource === s
                    ? 'bg-md-blue/15 text-md-blue border-md-blue/30'
                    : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div className="ml-3 border-l border-md-border pl-3">
              <button
                onClick={() => setInferGaps(!inferGaps)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                  inferGaps
                    ? 'bg-md-purple/15 text-md-purple border-md-purple/30'
                    : 'text-md-textMuted border-md-border hover:border-md-borderLight'
                )}
                title="Fill missing cells using ecosystem inference (inverse matchups, predator/prey, win-rate model)"
              >
                Infer Gaps
              </button>
            </div>
          </div>

          {loading ? <LoadingSpinner /> : matrix && matrix.decks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="text-xs border-separate border-spacing-0.5">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1 text-md-textMuted font-medium min-w-[120px]">vs →</th>
                    {matrix.decks.map((d) => (
                      <th key={d} className="px-1 py-1 text-md-textMuted font-medium text-center max-w-[80px] truncate" title={d}>
                        {d.split(' ').slice(0, 2).join(' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.decks.map((rowDeck) => (
                    <tr key={rowDeck}>
                      <td className="px-2 py-1 text-sm font-medium text-md-textSecondary whitespace-nowrap">{rowDeck}</td>
                      {matrix.decks.map((colDeck) => {
                        if (rowDeck === colDeck) {
                          return <td key={colDeck} className="px-2 py-1 text-center bg-md-surfaceAlt rounded text-md-textMuted">—</td>;
                        }
                        const cell = matrix.matrix[rowDeck]?.[colDeck];
                        if (!cell) {
                          return <td key={colDeck} className="px-2 py-1 text-center bg-md-surfaceAlt/50 rounded text-md-textMuted text-xs">?</td>;
                        }
                        const pct = (cell.rate * 100).toFixed(0);
                        const inferLabel = cell.inferred
                          ? ` [${cell.inference_method ?? 'inferred'}]`
                          : '';
                        return (
                          <td
                            key={colDeck}
                            title={`${getRelationshipLabel(cell.rate)}${inferLabel} | Untapped n=${cell.n_untapped} Tournament n=${cell.n_tournament} (${cell.confidence} confidence)`}
                            className={clsx(
                              'px-2 py-1 text-center rounded cursor-default',
                              cell.inferred
                                ? `${getWinRateColor(cell.rate)} opacity-60 italic border border-dashed border-md-border`
                                : `${getWinRateColor(cell.rate)} font-semibold`
                            )}
                          >
                            {pct}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-md-textMuted mt-2">
                Hover a cell to see sample sizes.{' '}
                {inferGaps
                  ? <><span className="italic opacity-60">Italic/dashed</span> = inferred (inverse, ecosystem, or win-rate model).</>
                  : <>? = insufficient data. Enable <strong>Infer Gaps</strong> to estimate.</>
                }
              </p>
            </div>
          ) : (
            <p className="text-sm text-md-textMuted py-4 text-center">
              No matchup data in matrix yet. Use the <em>By Deck</em> tab to load individual matchups, or run a full sync.
            </p>
          )}
        </div>
      )}

      {tab === 'ecosystem' && (
        <EcosystemView deckNames={decks.map((d) => d.name)} />
      )}

      {tab === 'advisor' && (
        <MetaAdvisor decks={decks.map((d) => d.name)} />
      )}

      {tab === 'list' && (
        <>
          <div className="bg-md-surface border border-md-border rounded-lg p-4">
            <label className="text-sm text-md-textMuted block mb-2">Select Deck</label>
            <select
              value={selectedDeck}
              onChange={(e) => setSelectedDeck(e.target.value)}
              className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue w-full max-w-sm"
            >
              {decks.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>

          {loading ? <LoadingSpinner /> : matchups.length > 0 ? (
            <div className="bg-md-surface border border-md-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-md-border">
                    <th className="text-center px-2 py-3 text-sm font-medium text-md-textMuted w-8"></th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-md-textMuted">Opponent</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Win Rate</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Matchup</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-md-textMuted">Sample Size</th>
                    <th className="px-4 py-3 text-sm font-medium text-md-textMuted">Visual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-border">
                  {[...matchups]
                    .sort((a, b) => b.win_rate_a - a.win_rate_a)
                    .map((m) => (
                      <tr key={m.deck_b} className="hover:bg-md-surfaceHover transition-colors">
                        <td className="px-2 py-3 text-center" title={getRelationshipLabel(m.win_rate_a / 100)}>
                          {getRelationshipIcon(m.win_rate_a / 100)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{m.deck_b}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-sm font-semibold ${getWinRateColor(m.win_rate_a / 100)}`}>
                            {m.win_rate_a.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-md-textMuted">{getRelationshipLabel(m.win_rate_a / 100)}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-md-textMuted">{m.sample_size}</td>
                        <td className="px-4 py-3">
                          <div className="w-full h-2 bg-md-bg rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${m.win_rate_a >= 50 ? 'bg-md-green' : 'bg-md-red'}`}
                              style={{ width: `${m.win_rate_a}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-md-surface border border-md-border rounded-lg p-8 text-center text-md-textMuted">
              No matchup data available for this deck.
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

## File: client/src/types/meta.ts
```typescript
export interface TierList {
  '0': DeckTierEntry[];
  '1': DeckTierEntry[];
  '2': DeckTierEntry[];
  '3': DeckTierEntry[];
  rogue: DeckTierEntry[];
}

export interface DeckTierEntry {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  pop_rank: number | null;
  master_pop_rank: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  sample_size: number | null;
  untapped_tier: number | null;
  cards?: Array<{ name: string; image: string | null }>;
}

export interface MetaSnapshot {
  deck_type_name: string;
  tier: number | null;
  power: number | null;
  pop_rank: number | null;
  snapshot_date: string;
}

export interface Matchup {
  deck_a: string;
  deck_b: string;
  win_rate_a: number;
  sample_size: number;
}

export interface Tournament {
  id: string;
  name: string;
  short_name: string | null;
  banner_image: string | null;
  next_date: string | null;
  placements_json: any[] | null;
  winner_deck_thumbnail: string | null;
  winner_deck_name: string | null;
}

export interface TournamentResult {
  deck_type_name: string;
  tournament_placement: string;
  author: string | null;
  created_at: string | null;
  url: string | null;
}

export interface BanCard {
  name: string;
  banStatus: string;
  rarity: string | null;
  konamiID: string | null;
  banListDate: string | null;
  id: number | null;
  image_small_url: string | null;
  image_cropped_url: string | null;
  negate_effectiveness: number | null;
  negated_win_rate: number | null;
  not_negated_win_rate: number | null;
  negate_sample_size: number | null;
}

export interface BanListData {
  forbidden: BanCard[];
  limited: BanCard[];
  semiLimited: BanCard[];
}

// ── Ecosystem / Predator-Prey types ──

export interface PredatorPreyRelationship {
  predator: string;
  prey: string;
  win_rate: number;
  strength: 'hard_counter' | 'soft_counter' | 'slight_edge';
  meta_impact: number;
  confidence: 'high' | 'medium' | 'low';
  sample_size: number;
  mechanism: 'direct' | 'inferred';
}

export interface GameTheoryProfile {
  expected_payoff: number;
  nash_deviation: number;
  best_response_to: string | null;
  dominated_by: string[];
  dominates: string[];
  strategy_type: 'dominant' | 'counter_pick' | 'generalist' | 'niche' | 'dominated';
}

export interface TournamentFieldEntry {
  deck: string;
  field_pct: number;
  top_cut_pct: number;
  conversion_rate: number;
  appearances: number;
}

export interface DeckEcosystemProfile {
  deck: string;
  tier: number | null;
  power: number | null;
  win_rate: number | null;
  play_rate: number | null;
  predators: PredatorPreyRelationship[];
  prey: PredatorPreyRelationship[];
  neutral: string[];
  polarization_index: number;
  suppression_score: number;
  vulnerability_score: number;
  meta_fitness: number;
  matchup_spread: number;
  game_theory: GameTheoryProfile;
}

export interface RockPaperScissorsCycle {
  decks: string[];
  cycle_strength: number;
  meta_relevance: number;
}

export interface EcosystemAnalysis {
  profiles: DeckEcosystemProfile[];
  cycles: RockPaperScissorsCycle[];
  food_chain: PredatorPreyRelationship[];
  meta_health_index: number;
  tournament_field: TournamentFieldEntry[];
  nash_equilibrium: Record<string, number>;
  computed_at: string;
}

export interface DeckEcosystemResponse {
  profile: DeckEcosystemProfile | null;
  related_cycles: RockPaperScissorsCycle[];
  meta_health_index: number;
  computed_at: string;
}
```

## File: server/src/services/syncService.ts
```typescript
import axios from 'axios';
import { getPool } from '../db/connection.js';
import { run, queryAll } from '../utils/dbHelpers.js';
import * as ygopd from './ygoprodeckService.js';
import * as mdm from './mdmService.js';
import * as untapped from './untappedService.js';
import { getValidAccessToken, invalidateToken } from './untappedAuthService.js';

export async function syncCards(): Promise<number> {
  const pool = getPool();
  const cards = await ygopd.getAllCards();

  const BATCH_SIZE = 200;
  const PARAMS_PER_ROW = 19; // 19 parameterized + 1 expression (extract...)

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);
    const params: any[] = [];
    const valueSets: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const img = c.card_images?.[0];
      const banMd = c.banlist_info?.ban_masterduel || null;
      const mdRarity = c.misc_info?.[0]?.md_rarity || null;
      const offset = j * PARAMS_PER_ROW;

      valueSets.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13}, $${offset+14}, $${offset+15}, $${offset+16}, $${offset+17}, $${offset+18}, $${offset+19}, extract(epoch from now())::bigint)`);

      params.push(
        c.id, c.name, c.type, c.frameType, c.desc,
        c.atk ?? null, c.def ?? null, c.level ?? null,
        c.race, c.attribute ?? null, c.archetype ?? null,
        c.linkval ?? null, c.linkmarkers ? JSON.stringify(c.linkmarkers) : null,
        c.scale ?? null,
        img?.image_url ?? null, img?.image_url_small ?? null, img?.image_url_cropped ?? null,
        banMd, mdRarity
      );
    }

    await run(pool, `INSERT INTO cards (id, name, type, frame_type, description, atk, def, level, race, attribute, archetype, link_val, link_markers, scale, image_url, image_small_url, image_cropped_url, ban_status_md, md_rarity, updated_at)
      VALUES ${valueSets.join(', ')}
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, frame_type = EXCLUDED.frame_type, description = EXCLUDED.description, atk = EXCLUDED.atk, def = EXCLUDED.def, level = EXCLUDED.level, race = EXCLUDED.race, attribute = EXCLUDED.attribute, archetype = EXCLUDED.archetype, link_val = EXCLUDED.link_val, link_markers = EXCLUDED.link_markers, scale = EXCLUDED.scale, image_url = EXCLUDED.image_url, image_small_url = EXCLUDED.image_small_url, image_cropped_url = EXCLUDED.image_cropped_url, ban_status_md = EXCLUDED.ban_status_md, md_rarity = EXCLUDED.md_rarity, updated_at = EXCLUDED.updated_at`,
      params);

    if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= cards.length) {
      console.log(`[Sync] Cards progress: ${Math.min(i + BATCH_SIZE, cards.length)}/${cards.length}`);
    }
  }

  console.log(`[Sync] Synced ${cards.length} cards`);
  return cards.length;
}

export async function syncArchetypes(): Promise<number> {
  const pool = getPool();
  const archetypes = await ygopd.getArchetypes();

  const BATCH_SIZE = 200;
  for (let i = 0; i < archetypes.length; i += BATCH_SIZE) {
    const batch = archetypes.slice(i, i + BATCH_SIZE);
    const params: any[] = [];
    const valueSets: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      valueSets.push(`($${j + 1})`);
      params.push(batch[j]);
    }
    await run(pool, `INSERT INTO archetypes (name) VALUES ${valueSets.join(', ')} ON CONFLICT DO NOTHING`, params);
  }

  return archetypes.length;
}

export async function syncDeckTypes(): Promise<number> {
  const pool = getPool();
  const deckTypes = await mdm.getDeckTypes();

  const toStr = (v: any) => v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const toNum = (v: any) => v == null ? null : typeof v === 'number' ? v : Number(v) || null;
  const toInt = (v: any) => { const n = toNum(v); return n == null ? null : Math.round(n); };

  // Reset tier/power for all decks — the loop below will restore values for active decks.
  // This ensures stale decks from old metas don't pollute the tier list.
  await run(pool, `UPDATE deck_types SET tier = NULL, power = NULL, power_trend = NULL`);

  for (const d of deckTypes) {
    // Normalize field names — MDM API uses tournamentPower, avgUrPrice, thumbnailImage, parsedOverview
    const power = toNum(d.tournamentPower ?? d.power);
    const powerTrend = toNum(d.tournamentPowerTrend ?? d.powerTrend);
    const thumbnailImage = toStr(d.thumbnailImage ?? d.image);
    const overview = toStr(d.parsedOverview ?? d.overview);
    const avgUrPrice = toNum(d.avgUrPrice ?? d.avgURPrice);
    const avgSrPrice = toNum(d.avgSrPrice ?? d.avgSRPrice);
    // Use deckBreakdown or tournamentStats (prefer tournamentStats as it has real data)
    const breakdown = d.tournamentStats ?? d.deckBreakdown ?? null;

    // Always derive tier from power — MDM's tier field can be inconsistent
    const tier = deriveTier(power);

    // Use INSERT ... ON CONFLICT DO NOTHING + UPDATE to preserve untapped.gg win_rate/play_rate data
    await run(pool, `INSERT INTO deck_types (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [d._id, d.name]);
    await run(pool, `UPDATE deck_types SET
        name = $1, tier = $2, power = $3, power_trend = $4, pop_rank = $5,
        master_pop_rank = $6, overview = $7, thumbnail_image = $8, avg_ur_price = $9,
        avg_sr_price = $10, breakdown_json = $11, updated_at = extract(epoch from now())::bigint
      WHERE id = $12`,
      [d.name, tier, power, powerTrend,
       toInt(d.popRank), toInt(d.masterPopRank), overview,
       thumbnailImage, avgUrPrice, avgSrPrice,
       breakdown ? JSON.stringify(breakdown) : null, d._id]);

    if (power != null && power > 0) {
      await run(pool, `INSERT INTO meta_snapshots (deck_type_name, tier, power, pop_rank, snapshot_date)
        VALUES ($1, $2, $3, $4, CURRENT_DATE)
        ON CONFLICT (deck_type_name, snapshot_date) DO UPDATE SET tier = EXCLUDED.tier, power = EXCLUDED.power, pop_rank = EXCLUDED.pop_rank`,
        [d.name, tier, power, toInt(d.masterPopRank)]);
    }
  }

  // Remove duplicate deck_types: for each name, keep the MDM entry (has power/tier)
  // and delete slug-based duplicates created by old scraper or untapped sync
  const dupes = await queryAll(pool,
    `SELECT LOWER(name) as lname FROM deck_types GROUP BY LOWER(name) HAVING COUNT(*) > 1`
  );
  for (const d of dupes) {
    // Keep the entry with highest power, or the one with a non-slug ID (MDM IDs are hex ObjectIds)
    const entries = await queryAll(pool,
      `SELECT id, power FROM deck_types WHERE LOWER(name) = $1 ORDER BY power DESC NULLS LAST`,
      [d.lname]
    );
    if (entries.length > 1) {
      // Keep the first (best) entry, delete the rest
      const keepId = entries[0].id;
      for (const e of entries.slice(1)) {
        await run(pool, `DELETE FROM deck_types WHERE id = $1`, [e.id]);
      }
    }
  }

  // Scrape MDM website for authoritative power values (includes engine aggregations)
  try {
    const scraped = await mdm.scrapeTierList();
    const scrapedMap = new Map(scraped.map(s => [s.name.toLowerCase(), s]));

    // Update existing decks with scraped power values (more current than API)
    for (const s of scraped) {
      const existing = await queryAll(pool, `SELECT id FROM deck_types WHERE LOWER(name) = LOWER($1)`, [s.name]);
      const tier = deriveTier(s.power);

      if (existing.length > 0) {
        // Update power/tier to match website
        await run(pool, `UPDATE deck_types SET power = $1, tier = $2, updated_at = extract(epoch from now())::bigint WHERE LOWER(name) = LOWER($3)`,
          [s.power, tier, s.name]);
      } else {
        // Engine deck not in API — create a new entry
        const id = `scraped-${s.name.toLowerCase().replace(/\s+/g, '-')}`;
        await run(pool, `INSERT INTO deck_types (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, s.name]);
        await run(pool, `UPDATE deck_types SET tier = $1, power = $2, updated_at = extract(epoch from now())::bigint WHERE id = $3`,
          [tier, s.power, id]);
      }

      // Snapshot for meta trends
      if (s.power > 0) {
        await run(pool, `INSERT INTO meta_snapshots (deck_type_name, tier, power, pop_rank, snapshot_date)
          VALUES ($1, $2, $3, NULL, CURRENT_DATE)
          ON CONFLICT (deck_type_name, snapshot_date) DO UPDATE SET tier = EXCLUDED.tier, power = EXCLUDED.power, pop_rank = EXCLUDED.pop_rank`,
          [s.name, tier, s.power]);
      }
    }

    console.log(`[Sync] Applied ${scraped.length} scraped power values from MDM website`);
  } catch (err: any) {
    console.warn(`[Sync] MDM scrape failed (non-fatal): ${err.message}`);
  }

  // Clean up stale snapshots:
  // - null/zero power entries
  // - decks no longer in the active tiered meta (must have tier assigned)
  await run(pool, `DELETE FROM meta_snapshots WHERE power IS NULL OR power <= 0`);
  await run(pool, `DELETE FROM meta_snapshots WHERE deck_type_name NOT IN (
    SELECT name FROM deck_types WHERE tier IS NOT NULL
  )`);

  console.log(`[Sync] Synced ${deckTypes.length} deck types`);
  return deckTypes.length;
}

export async function syncTopDecks(): Promise<number> {
  const pool = getPool();
  const decks = await mdm.getTopDecks();

  for (const d of decks as any[]) {
    try {
      const toStr = (v: any) => v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const toNum = (v: any) => v == null ? null : typeof v === 'number' ? v : Number(v) || null;
      const toInt = (v: any) => { const n = toNum(v); return n == null ? null : Math.round(n); };

      const deckTypeName = typeof d.deckType === 'object' ? d.deckType?.name : d.deckType;
      const authorName = typeof d.author === 'object' ? d.author?.username : d.author;

      // MDM API uses main/extra/side with {card: {name, rarity}, amount} format
      // Normalize to {cardName, amount, rarity}
      const normalizeDeck = (arr: any[]) => arr?.map((entry: any) => ({
        cardName: entry.card?.name || entry.cardName || 'Unknown',
        amount: entry.amount || 1,
        rarity: entry.card?.rarity || entry.rarity || null,
      }));

      const mainDeck = d.main || d.mainDeck;
      const extraDeck = d.extra || d.extraDeck;
      const sideDeck = d.side || d.sideDeck;

      await run(pool, `INSERT INTO top_decks (id, deck_type_name, author, main_deck_json, extra_deck_json, side_deck_json, tournament_name, tournament_placement, ranked_type, created_at, gems_price, ur_price, sr_price, url, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, extract(epoch from now())::bigint)
        ON CONFLICT (id) DO UPDATE SET deck_type_name = EXCLUDED.deck_type_name, author = EXCLUDED.author, main_deck_json = EXCLUDED.main_deck_json, extra_deck_json = EXCLUDED.extra_deck_json, side_deck_json = EXCLUDED.side_deck_json, tournament_name = EXCLUDED.tournament_name, tournament_placement = EXCLUDED.tournament_placement, ranked_type = EXCLUDED.ranked_type, created_at = EXCLUDED.created_at, gems_price = EXCLUDED.gems_price, ur_price = EXCLUDED.ur_price, sr_price = EXCLUDED.sr_price, url = EXCLUDED.url, updated_at = EXCLUDED.updated_at`,
        [toStr(d._id), toStr(deckTypeName), toStr(authorName),
         mainDeck ? JSON.stringify(normalizeDeck(mainDeck)) : null,
         extraDeck ? JSON.stringify(normalizeDeck(extraDeck)) : null,
         sideDeck ? JSON.stringify(normalizeDeck(sideDeck)) : null,
         toStr(d.tournamentName), toStr(d.tournamentPlacement),
         toStr(d.rankedType), toStr(d.created || d.createdAt),
         toInt(d.gemsPrice), toInt(d.urPrice), toInt(d.srPrice),
         toStr(d.url)]);
    } catch (e) {
      // Skip individual decks that fail
    }
  }

  console.log(`[Sync] Synced ${decks.length} top decks`);
  return decks.length;
}

export async function syncTournaments(): Promise<number> {
  const pool = getPool();
  const tournaments = await mdm.getTournaments();

  for (const t of tournaments) {
    try {
      const toStr = (v: any) => v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const rawBanner = t.bannerImage ?? null;
      const bannerImage = typeof rawBanner === 'string' && rawBanner.startsWith('/')
        ? `https://www.masterduelmeta.com${rawBanner}`
        : rawBanner;

      await run(pool, `INSERT INTO tournaments (id, name, short_name, banner_image, next_date, placements_json, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, extract(epoch from now())::bigint)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name, banner_image = EXCLUDED.banner_image, next_date = EXCLUDED.next_date, placements_json = EXCLUDED.placements_json, updated_at = EXCLUDED.updated_at`,
        [toStr(t._id), toStr(t.name), toStr(t.shortName),
         bannerImage, toStr(t.nextDate),
         t.placements ? JSON.stringify(t.placements) : null]);
    } catch (e) {
      // Skip individual tournaments that fail
    }
  }

  return tournaments.length;
}

export async function syncUntapped(): Promise<number> {
  const pool = getPool();
  const [archetypes, matchupPairings] = await Promise.all([
    untapped.scrapeTierList(),
    untapped.getMatchupPairings(),
  ]);

  let updated = 0;
  for (const a of archetypes) {
    if (a.winRate === null && a.playRate === null) continue;
    await run(pool,
      `UPDATE deck_types SET
         win_rate = COALESCE($1, win_rate),
         play_rate = COALESCE($2, play_rate),
         sample_size = COALESCE($3, sample_size),
         untapped_tier = COALESCE($4, untapped_tier),
         updated_at = extract(epoch from now())::bigint
       WHERE LOWER(name) = LOWER($5)`,
      [a.winRate, a.playRate, a.sampleSize, a.tier, a.name]
    );
    updated++;
  }

  // Store per-matchup win rates in matchup_sources and legacy matchups table
  let matchupsStored = 0;
  for (const p of matchupPairings) {
    await run(pool,
      `INSERT INTO matchup_sources (deck_a, deck_b, source, win_rate, sample_size, updated_at)
       VALUES (LOWER($1), LOWER($2), 'untapped', $3, $4, extract(epoch from now())::bigint)
       ON CONFLICT (deck_a, deck_b, source) DO UPDATE SET win_rate = EXCLUDED.win_rate, sample_size = EXCLUDED.sample_size, updated_at = EXCLUDED.updated_at`,
      [p.deckA, p.deckB, p.winRate, p.sampleSize]
    );
    // Also populate legacy matchups table (win_rate_a stored as 0-100 percentage)
    await run(pool,
      `INSERT INTO matchups (deck_a, deck_b, win_rate_a, sample_size, updated_at)
       VALUES (LOWER($1), LOWER($2), $3, $4, extract(epoch from now())::bigint)
       ON CONFLICT (deck_a, deck_b) DO UPDATE SET win_rate_a = EXCLUDED.win_rate_a, sample_size = EXCLUDED.sample_size, updated_at = EXCLUDED.updated_at`,
      [p.deckA, p.deckB, Math.round(p.winRate * 1000) / 10, p.sampleSize]
    );
    matchupsStored++;
  }

  console.log(`[Sync] Updated ${updated} deck types and ${matchupsStored} matchup pairings with untapped.gg data`);
  return archetypes.length;
}

interface RealNegateEntry {
  cardId: number;
  negatedWinRate: number;
  notNegatedWinRate: number;
  negateEffectiveness: number;
  sampleSize: number;
}

/**
 * Attempts to fetch real per-card negate data from the Untapped.gg companion API.
 * Requires the Untapped Companion app to be installed and authenticated.
 * Returns null if unavailable (caller falls back to local computation).
 */
async function fetchRealNegateData(): Promise<RealNegateEntry[] | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  try {
    console.log('[Sync] Fetching real negate data from untapped.gg card_impact_analysis...');
    const res = await axios.get(
      'https://api.ygom.untapped.gg/api/v1/analytics/query/card_impact_analysis',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const raw = res.data?.data ?? res.data;

    if (!raw || (Array.isArray(raw) && raw.length === 0) || (typeof raw === 'object' && Object.keys(raw).length === 0)) {
      console.warn('[Sync] card_impact_analysis returned empty data — feature flag may not be enabled for this account');
      return null;
    }

    const entries: RealNegateEntry[] = [];
    // Response is keyed by card ID (numeric string), e.g. { "3401": { playedAnd... }, ... }
    for (const [idStr, item] of Object.entries(raw) as [string, any][]) {
      const cardId = parseInt(idStr, 10);
      if (!cardId) continue;

      const negatedWins = item.playedAndNegatedWins ?? 0;
      const negatedTotal = item.playedAndNegatedTotal ?? 0;
      const notNegatedWins = item.playedAndNotNegatedWins ?? 0;
      const notNegatedTotal = item.playedAndNotNegatedTotal ?? 0;

      if (negatedTotal === 0 || notNegatedTotal === 0) continue;

      const negatedWinRate = Math.round((negatedWins / negatedTotal) * 1000) / 10;
      const notNegatedWinRate = Math.round((notNegatedWins / notNegatedTotal) * 1000) / 10;
      const negateEffectiveness = Math.round((notNegatedWinRate - negatedWinRate) * 10) / 10;
      const sampleSize = negatedTotal + notNegatedTotal;

      entries.push({ cardId, negatedWinRate, notNegatedWinRate, negateEffectiveness, sampleSize });
    }

    console.log(`[Sync] Fetched real negate data for ${entries.length} cards from untapped.gg`);
    return entries.length > 0 ? entries : null;
  } catch (err: any) {
    if (err.response?.status === 401) {
      console.warn('[Sync] 401 from card_impact_analysis — invalidating token, will retry with refresh next run');
      invalidateToken();
    } else if (err.response?.status === 403) {
      console.warn('[Sync] 403 from card_impact_analysis — feature flag uc.ygom-card-impact-stats may not be enabled on this account');
    } else {
      console.warn('[Sync] card_impact_analysis request failed:', err.message);
    }
    return null;
  }
}

/**
 * Syncs card negate effectiveness. Tries the Untapped.gg companion API first
 * (real per-card negate tracking data). Falls back to local computation from
 * archetype win rates if the companion is unavailable or the feature flag is off.
 */
export async function syncCardNegateEffectiveness(): Promise<number> {
  const pool = getPool();

  // Attempt to use real per-card data from the Untapped Companion API
  const realData = await fetchRealNegateData();
  if (realData) {
    let updated = 0;
    for (const entry of realData) {
      await run(pool,
        `UPDATE cards SET
          negate_effectiveness = $1,
          negated_win_rate = $2,
          not_negated_win_rate = $3,
          negate_sample_size = $4
        WHERE id = $5`,
        [entry.negateEffectiveness, entry.negatedWinRate, entry.notNegatedWinRate, entry.sampleSize, entry.cardId]
      );
      updated++;
    }
    console.log(`[Sync] Updated ${updated} cards with real negate data from untapped.gg`);
    return updated;
  }

  console.log('[Sync] Falling back to local negate computation from archetype win rates');

  // Get all deck types with untapped win rate data
  const deckTypes = await queryAll(pool,
    `SELECT name, win_rate, sample_size FROM deck_types WHERE win_rate IS NOT NULL AND sample_size IS NOT NULL AND sample_size > 0`
  ) as Array<{ name: string; win_rate: number; sample_size: number }>;

  if (deckTypes.length === 0) {
    console.log('[Sync] No deck type win rate data available — skipping card negate computation');
    return 0;
  }

  // Build a map of archetype name -> { winRate, sampleSize }
  const archMap = new Map<string, { winRate: number; sampleSize: number }>();
  let totalWeightedWr = 0;
  let totalSamples = 0;
  for (const dt of deckTypes) {
    archMap.set(dt.name.toLowerCase(), { winRate: dt.win_rate, sampleSize: dt.sample_size });
    totalWeightedWr += dt.win_rate * dt.sample_size;
    totalSamples += dt.sample_size;
  }
  const overallAvgWr = totalSamples > 0 ? totalWeightedWr / totalSamples : 50;

  // Get all top decks with their card lists
  const topDecks = await queryAll(pool,
    `SELECT deck_type_name, main_deck_json, extra_deck_json FROM top_decks WHERE main_deck_json IS NOT NULL`
  ) as Array<{ deck_type_name: string; main_deck_json: string; extra_deck_json: string | null }>;

  // For each card, accumulate weighted win rate data across archetypes
  const cardStats = new Map<string, { weightedWr: number; totalSamples: number; archetypes: Set<string> }>();

  // Helper: find best matching archetype for a deck type name
  // e.g. "Vanquish Soul K9" should match "Vanquish Soul"
  const resolveArch = (deckTypeName: string): { winRate: number; sampleSize: number } | undefined => {
    const lower = deckTypeName.toLowerCase();
    // Exact match first
    const exact = archMap.get(lower);
    if (exact) return exact;
    // Try finding a deck_type whose name is contained in the deck_type_name
    let bestMatch: { winRate: number; sampleSize: number } | undefined;
    let bestLen = 0;
    for (const [name, data] of archMap) {
      if (lower.includes(name) && name.length > bestLen) {
        bestMatch = data;
        bestLen = name.length;
      }
    }
    return bestMatch;
  };

  for (const deck of topDecks) {
    const archName = deck.deck_type_name?.toLowerCase();
    if (!archName) continue;
    const archData = resolveArch(deck.deck_type_name);
    if (!archData) continue;

    // Parse card lists from main + extra deck
    const cardNames = new Set<string>();
    for (const json of [deck.main_deck_json, deck.extra_deck_json]) {
      if (!json) continue;
      try {
        const cards = JSON.parse(json) as Array<{ cardName: string; amount: number }>;
        for (const c of cards) {
          if (c.cardName) cardNames.add(c.cardName.toLowerCase());
        }
      } catch { /* skip malformed json */ }
    }

    for (const cardName of cardNames) {
      let stats = cardStats.get(cardName);
      if (!stats) {
        stats = { weightedWr: 0, totalSamples: 0, archetypes: new Set() };
        cardStats.set(cardName, stats);
      }
      // Only count each archetype once per card (not per deck)
      if (!stats.archetypes.has(archName)) {
        stats.archetypes.add(archName);
        stats.weightedWr += archData.winRate * archData.sampleSize;
        stats.totalSamples += archData.sampleSize;
      }
    }
  }

  // Update cards with computed negate effectiveness
  let updated = 0;
  for (const [cardName, stats] of cardStats) {
    if (stats.totalSamples < 100) continue; // skip very low sample sizes

    const cardAvgWr = stats.weightedWr / stats.totalSamples;
    const impact = Math.round((cardAvgWr - overallAvgWr) * 10) / 10;

    // not_negated_win_rate: win rate of decks using this card
    const notNegatedWr = Math.round(cardAvgWr * 10) / 10;
    // negated_win_rate: estimate as overall average (what happens when the card is neutralized)
    const negatedWr = Math.round(overallAvgWr * 10) / 10;

    await run(pool,
      `UPDATE cards SET
        negate_effectiveness = $1,
        negated_win_rate = $2,
        not_negated_win_rate = $3,
        negate_sample_size = $4
      WHERE LOWER(name) = LOWER($5)`,
      [impact, negatedWr, notNegatedWr, stats.totalSamples, cardName]
    );
    updated++;
  }

  console.log(`[Sync] Computed negate effectiveness for ${updated} cards (overall avg WR: ${overallAvgWr.toFixed(1)}%)`);
  return updated;
}

function deriveTier(power?: number | null): number | null {
  if (power == null || power <= 0) return null;
  if (power >= 12) return 1;   // Tier 1: power >= 12 (matches MDM definition)
  if (power >= 7) return 2;    // Tier 2: 7–12 (matches MDM definition)
  if (power >= 3) return 3;    // Tier 3: 3–7 (matches MDM definition)
  return null;                 // rogue: < 3
}
```
