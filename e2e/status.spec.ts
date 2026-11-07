import { expect, test } from '@playwright/test';

import { strings } from '../src/ui/strings';

test('anyone can open the Status page and see the commit, database and AI spend', async ({
  page,
}) => {
  await page.goto('/status');

  await expect(page.getByRole('heading', { level: 1, name: strings.status.title })).toBeVisible();
  await expect(page.getByText(strings.status.verdict.ok)).toBeVisible();

  const facts = page.getByRole('definition');
  // The e2e server runs with COMMIT=e2e.
  await expect(facts.filter({ hasText: 'e2e' })).toBeVisible();
  await expect(facts.filter({ hasText: strings.status.database.ok })).toBeVisible();

  // Default caps: $2 per day, $13 in total.
  const today = page.getByRole('meter', { name: strings.status.spendToday });
  await expect(today).toHaveAttribute('aria-valuetext', /von 2,00\s\$/);
  const total = page.getByRole('meter', { name: strings.status.spendTotal });
  await expect(total).toHaveAttribute('aria-valuetext', /von 13,00\s\$/);
});
