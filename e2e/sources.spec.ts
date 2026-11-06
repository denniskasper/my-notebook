import { expect, test } from '@playwright/test';

import { format, strings } from '../src/ui/strings';

test('a Visitor adds a text Source, watches it get ready and reads it in the reader', async ({
  page,
}) => {
  const title = `Heizungsgesetz ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: strings.sources.kinds.text }).click();
  const dialog = page.getByRole('dialog', { name: strings.sources.addText.title });
  await dialog.getByLabel(strings.sources.addText.titleLabel).fill(title);
  await dialog
    .getByLabel(strings.sources.addText.textLabel)
    .fill(
      'Ab 2024 soll jede neu eingebaute Heizung zu 65 Prozent mit erneuerbaren Energien betrieben werden.\n\n' +
        'Für bestehende Heizungen gelten Übergangsfristen.\n\n' +
        'Die Förderung deckt einen Teil der Kosten.',
    );
  await dialog.getByRole('button', { name: strings.sources.addText.submit }).click();
  await expect(dialog).toBeHidden();

  const sidebar = page.getByRole('complementary', { name: strings.sidebar.label });
  const source = sidebar.getByRole('listitem').filter({ hasText: title });
  await expect(source.getByRole('switch', { name: strings.sources.enabledLabel })).toBeChecked();
  await expect(
    page.getByText(format(strings.notebook.activeSources, { count: 1, total: 1 })).first(),
  ).toBeVisible();

  await source.getByRole('link', { name: title }).click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();
  await expect(reader.getByText('Für bestehende Heizungen gelten Übergangsfristen.')).toBeVisible();

  // A Citation opens the reader on its Passages; the second Passage is ordinal 1.
  await page.goto(`${page.url()}&p=1`);
  const highlighted = reader.locator('[data-highlighted]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toHaveText('Für bestehende Heizungen gelten Übergangsfristen.');

  await source.getByRole('switch', { name: strings.sources.enabledLabel }).click();
  await expect(
    page.getByText(format(strings.notebook.activeSources, { count: 0, total: 1 })).first(),
  ).toBeVisible();
});
