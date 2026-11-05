import { runMigrations } from '../platform/db/migrate';

/** Migrates the `_test` database once before the integration tests run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set for integration tests');
  await runMigrations(url);
}
