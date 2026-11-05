import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

// Any constant works; it only has to be the same for every app instance.
const MIGRATION_LOCK_ID = 727_001;

/**
 * Applies the committed SQL migrations. An advisory lock keeps two starting
 * instances (start-first deploys) from migrating at the same time.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle({ client }), { migrationsFolder: 'drizzle' });
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on the process environment.
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  await runMigrations(url);
  console.log('Migrations applied');
}
