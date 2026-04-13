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
