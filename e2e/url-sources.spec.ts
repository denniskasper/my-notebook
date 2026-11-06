import { expect, test } from '@playwright/test';

import { errorMessage, format, strings } from '../src/ui/strings';

// Served by e2e/fixtures/web-page-server.mjs (see playwright.config.ts).
const PAGE_URL = 'http://127.0.0.1:3101/waermeplanung';

test('a Visitor adds a web page as a Source and reads it with a link to the original', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: strings.sources.kinds.url, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: strings.sources.addUrl.title });
  const address = dialog.getByLabel(strings.sources.addUrl.urlLabel);

  // The cloud metadata address is refused before anything is fetched.
  await address.fill('http://169.254.169.254/latest/meta-data/');
  await dialog.getByRole('button', { name: strings.sources.addUrl.submit }).click();
  await expect(dialog.getByRole('alert')).toHaveText(errorMessage('url_not_allowed'));
  await expect(address).toHaveValue('http://169.254.169.254/latest/meta-data/');

  await address.fill(PAGE_URL);
  await dialog.getByRole('button', { name: strings.sources.addUrl.submit }).click();
  await expect(dialog).toBeHidden();

  const sidebar = page.getByRole('complementary', { name: strings.sidebar.label });
  const source = sidebar.getByRole('listitem').filter({ hasText: 'Kommunale Wärmeplanung' });
  await expect(source.getByRole('switch', { name: strings.sources.enabledLabel })).toBeChecked();
  await expect(
    page.getByText(format(strings.notebook.activeSources, { count: 1, total: 1 })),
  ).toBeVisible();

  await source.getByRole('link', { name: 'Kommunale Wärmeplanung' }).click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.getByRole('heading', { name: 'Kommunale Wärmeplanung' })).toBeVisible();
  await expect(
    reader.getByText('Große Städte müssen ihre Wärmepläne bis Mitte 2026 vorlegen', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(reader.getByRole('link', { name: '127.0.0.1:3101/waermeplanung' })).toHaveAttribute(
    'href',
    PAGE_URL,
  );
});
