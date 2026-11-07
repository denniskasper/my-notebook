import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '@/platform/env';

export type Database = NodePgDatabase;

type DbState = { pool: Pool; db: Database };

// Survives Next.js dev reloads so hot module replacement does not leak pools.
const globalForDb = globalThis as typeof globalThis & { __myNotebookDb?: DbState };

function state(): DbState {
  if (!globalForDb.__myNotebookDb) {
    const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
    globalForDb.__myNotebookDb = { pool, db: drizzle({ client: pool }) };
  }
  return globalForDb.__myNotebookDb;
}

/** The shared Drizzle client. Modules own their tables; this client knows none of them. */
export function db(): Database {
  return state().db;
}

/**
 * Runs `fn` on one connection held for its whole duration, for session-level
 * state such as advisory locks that must be released on the same connection.
 */
export async function withConnection<T>(fn: (connection: Database) => Promise<T>): Promise<T> {
  const client = await state().pool.connect();
  try {
    return await fn(drizzle({ client }));
  } finally {
    client.release();
  }
}

/** Closes the pool (tests and scripts). */
export async function closeDb(): Promise<void> {
  const current = globalForDb.__myNotebookDb;
  globalForDb.__myNotebookDb = undefined;
  await current?.pool.end();
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await db().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
