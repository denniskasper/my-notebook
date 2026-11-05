import { runMigrations } from '../platform/db/migrate';
import { databaseUrlSchema } from '../platform/env';

/** Migrates the `_test` database once before the integration tests run. */
export default async function setup() {
  const url = databaseUrlSchema.safeParse(process.env.TEST_DATABASE_URL);
  if (!url.success)
    throw new Error('TEST_DATABASE_URL must be a Postgres URL for integration tests');
  await runMigrations(url.data);
}
