import { readFileSync } from 'node:fs';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from './migrate';

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const scratchName = `my_notebook_migrate_${process.pid}`;
const scratchUrl = (() => {
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${scratchName}`;
  return url.toString();
})();

const journal: { entries: unknown[] } = JSON.parse(
  readFileSync('drizzle/meta/_journal.json', 'utf8'),
);

async function onTestServer(statement: string): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

// A fresh, empty database: the `_test` one is already migrated by the global setup.
beforeAll(() => onTestServer(`create database ${scratchName}`));
afterAll(() => onTestServer(`drop database if exists ${scratchName} with (force)`));

describe('runMigrations', () => {
  it('lets two instances starting at once migrate an empty database without colliding', async () => {
    await expect(
      Promise.all([runMigrations(scratchUrl), runMigrations(scratchUrl)]),
    ).resolves.toBeDefined();

    const client = new Client({ connectionString: scratchUrl });
    await client.connect();
    try {
      const applied = await client.query('select hash from drizzle.__drizzle_migrations');
      expect(applied.rowCount).toBe(journal.entries.length);
    } finally {
      await client.end();
    }
  });
});
