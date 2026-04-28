import type { Pool } from '@neondatabase/serverless';

export async function queryAll<T = any>(pool: Pool, sql: string, params: any[] = []): Promise<T[]> {
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
