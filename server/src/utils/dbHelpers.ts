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
