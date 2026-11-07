import { parseArgs } from 'node:util';

import { z } from 'zod';

import { closeDb } from '@/platform/db';
import { env } from '@/platform/env';

import { seedDemoNotebook } from './seed';
import { seedRefusal } from './seed-target';

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the process environment.
}

const { values } = parseArgs({ options: { visitor: { type: 'string' } } });
const visitorId = z.uuid().optional().parse(values.visitor);

const refusal = seedRefusal({ nodeEnv: env().NODE_ENV, databaseUrl: env().DATABASE_URL });
if (refusal) {
  console.error(`Refusing to seed: ${refusal}.`);
  process.exit(1);
}

try {
  const seeded = await seedDemoNotebook({ demoDir: 'demo', visitorId });
  // stdout is machine-readable for the e2e tests; the hints go to stderr.
  console.log(JSON.stringify({ visitorId: seeded.visitorId, notebookId: seeded.notebookId }));
  for (const source of seeded.sources) {
    console.error(`${source.status.padEnd(6)} ${source.title} (${source.tokenCount} tokens)`);
  }
  if (!visitorId) {
    console.error(
      `New Visitor: set the \`visitor\` cookie to ${seeded.visitorId} to see the Notebook, ` +
        'or pass --visitor <your cookie value> next time.',
    );
  }
} finally {
  await closeDb();
}
