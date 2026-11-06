import { expect, test } from '@playwright/test';

import { strings } from '../src/ui/strings';

test('a Visitor creates a Notebook, renames it and finds it again', async ({ page }) => {
  const title = `Wärmewende ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();

  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.notebook.untitled);
  await expect(page.getByText(strings.conversation.emptyTitle)).toBeVisible();
  await expect(page.getByRole('tab', { name: strings.drawer.tabs.sources })).toBeVisible();

  await page.getByRole('button', { name: strings.notebook.actions }).click();
  await page.getByRole('menuitem', { name: strings.notebook.rename }).click();
  await page.getByLabel(strings.notebook.renameLabel).fill(title);
  await page.getByRole('button', { name: strings.notebook.renameSave }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  const sidebar = page.getByRole('complementary', { name: strings.sidebar.label });
  await expect(sidebar.getByRole('link', { name: title })).toBeVisible();

  // The Visitor cookie brings the Notebook back on the next visit.
  await page.goto('/');
  await sidebar.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});
