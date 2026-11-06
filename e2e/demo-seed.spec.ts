import { execFileSync } from 'node:child_process';

import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { strings } from '../src/ui/strings';

const seededSchema = z.object({ visitorId: z.uuid(), notebookId: z.uuid() });

/** Runs the demo seed against the e2e database, as a developer would locally. */
function seedDemoNotebook(): z.infer<typeof seededSchema> {
  const output = execFileSync('pnpm', ['--silent', 'demo:seed'], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, LOG_LEVEL: 'warn' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return seededSchema.parse(JSON.parse(output));
}

test('a Visitor finds the seeded demo Notebook and reads the demo text Source', async ({
  page,
  context,
  baseURL,
}) => {
  const seeded = seedDemoNotebook();
  await context.addCookies([{ name: 'visitor', value: seeded.visitorId, url: baseURL }]);

  await page.goto(`/notebooks/${seeded.notebookId}`);

  const sidebar = page.getByRole('complementary', { name: strings.sidebar.label });
  const title = 'Meine Notizen zur KI-Verordnung';
  const source = sidebar.getByRole('listitem').filter({ hasText: title });
  await expect(source.getByRole('switch', { name: strings.sources.enabledLabel })).toBeChecked();

  await source.getByRole('link', { name: title }).click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();
  await expect(
    reader.getByText(/Er hat drei Felder: Zweck, Risikoklasse und Kennzeichnung\./),
  ).toBeVisible();
});
