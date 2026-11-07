import { expect, test } from '@playwright/test';

import { format, formatUsd, strings } from '../src/ui/strings';

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

  // Default caps: $2 per day, $13 in total. Other specs spend, so only the cap is asserted.
  const spendOf = (limitMicroUsd: number) => {
    const suffix = format(strings.status.spendOf, { spent: '', limit: formatUsd(limitMicroUsd) });
    return new RegExp(`${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  };
  const today = page.getByRole('meter', { name: strings.status.spendToday });
  await expect(today).toHaveAttribute('aria-valuetext', spendOf(2_000_000));
  const total = page.getByRole('meter', { name: strings.status.spendTotal });
  await expect(total).toHaveAttribute('aria-valuetext', spendOf(13_000_000));
});
