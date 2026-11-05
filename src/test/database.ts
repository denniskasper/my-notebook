import { sql } from 'drizzle-orm';

import { db } from '@/platform/db';

/** Empties every table; Visitors cascade to everything they own. */
export async function resetDatabase(): Promise<void> {
  await db().execute(sql`truncate table visitors cascade`);
}
