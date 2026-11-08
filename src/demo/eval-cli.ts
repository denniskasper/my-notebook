import { appendFile, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { closeDb } from '@/platform/db';
import { env } from '@/platform/env';

import { resultPassed, formatReport } from './eval-report';
import { runEvals } from './eval-run';
import { parseEvalSet } from './evals';
import { seedRefusal } from './seed-target';

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the process environment.
}

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    'no-briefing': { type: 'boolean', default: false },
    budget: { type: 'string', default: '2' },
  },
});
const only = values.only
  ?.split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const budgetUsd = z.coerce.number().positive().max(5).parse(values.budget);

// The run's Visitor is new, so its Daily allowance is the run's budget. The Demo budget
// would count the whole database's spend (a local one has history), so it is lifted.
process.env.DAILY_ALLOWANCE_USD = String(budgetUsd);
process.env.DEMO_BUDGET_DAILY_USD = '1000';
process.env.DEMO_BUDGET_TOTAL_USD = '1000';
process.env.LOG_LEVEL ??= 'warn';

const config = env();
const refusal = seedRefusal(
  { nodeEnv: config.NODE_ENV, databaseUrl: config.DATABASE_URL },
  'the eval run',
);
if (refusal) {
  console.error(`Refusing to run the evals: ${refusal}.`);
  process.exit(1);
}
if (config.LLM_MODE !== 'real') {
  console.error(
    'LLM_MODE is not `real`: the evals run against the scripted fake (no cost), ' +
      'so key facts and the uncovered question will fail.',
  );
}

let failed = true;
try {
  const evalSet = parseEvalSet(JSON.parse(await readFile('demo/evals.json', 'utf8')));
  const report = await runEvals({
    demoDir: 'demo',
    evalSet,
    briefing: !values['no-briefing'],
    only,
    onResult: (result) =>
      console.error(`${resultPassed(result) ? 'pass' : 'FAIL'} ${result.id} (${result.mode})`),
  });
  const summary = `## AI evals (${config.LLM_MODE})\n\n${formatReport(report)}\n`;
  console.log(summary);
  // In GitHub Actions the table also lands in the job summary.
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  failed = !report.results.every(resultPassed);
} catch (error) {
  console.error(error);
} finally {
  await closeDb();
}
process.exit(failed ? 1 : 0);
