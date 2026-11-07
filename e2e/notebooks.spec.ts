import { expect, test } from '@playwright/test';

import packageJson from '../package.json' with { type: 'json' };
import { strings } from '../src/ui/strings';
import { E2E_COMMIT } from './build';

test('a Visitor creates a Notebook, renames it and finds it again', async ({ page }) => {
  const title = `Wärmewende ${Date.now()}`;

  await page.goto('/');

  // Without these the browser falls back to a blank tab icon and asks for a 404ing /favicon.ico.
  await expect(page.locator('head link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
  const iconLinks = page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]');
  const iconHrefs = await iconLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href') ?? ''),
  );
  for (const href of [...iconHrefs, '/favicon.ico']) {
    // An empty href would resolve to the page itself and pass the status check.
    expect(href).not.toBe('');
    expect((await page.request.get(href)).status(), href).toBe(200);
  }

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

  // The running build, linked to its commit.
  const version = sidebar.getByRole('link', { name: `v${packageJson.version} · e2e0000` });
  await expect(version).toBeVisible();
  await expect(version).toHaveAttribute('href', new RegExp(`/commit/${E2E_COMMIT}$`));

  // The Visitor cookie brings the Notebook back on the next visit.
  await page.goto('/');
  await sidebar.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});
