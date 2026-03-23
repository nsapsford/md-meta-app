import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

export async function initDb(): Promise<Database> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs();
    let buffer: Buffer | null = null;
    try {
      buffer = fs.readFileSync(DB_PATH);
    } catch {}

    db = buffer ? new SQL.Database(buffer) : new SQL.Database();
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.run(schema);

    // Migrate existing deck_types table to add untapped.gg columns
    const migrations = [
      'ALTER TABLE deck_types ADD COLUMN win_rate REAL',
      'ALTER TABLE deck_types ADD COLUMN play_rate REAL',
      'ALTER TABLE deck_types ADD COLUMN sample_size INTEGER',
      'ALTER TABLE deck_types ADD COLUMN untapped_tier INTEGER',
    ];
    for (const sql of migrations) {
      try { db.run(sql); } catch { /* column already exists */ }
    }

    console.log('[DB] Schema migrated successfully');

    // Auto-save every 30 seconds
    setInterval(() => saveDb(), 30000);

    return db;
  })();

  return initPromise;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}
