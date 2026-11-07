import { expect, test } from '@playwright/test';

import { format, strings } from '../src/ui/strings';

test('a Visitor generates a Briefing and opens one of its Citations in the reader', async ({
  page,
}) => {
  const title = `Wärmepumpen-Förderung ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: strings.sources.kinds.text }).click();
  const dialog = page.getByRole('dialog', { name: strings.sources.addText.title });
  await dialog.getByLabel(strings.sources.addText.titleLabel).fill(title);
  await dialog
    .getByLabel(strings.sources.addText.textLabel)
    .fill(
      'Das Programm fördert neue Wärmepumpen.\n\n' +
        'Anträge sind bis Ende 2027 möglich.\n\n' +
        'Die Förderung deckt bis zu 70 Prozent der Kosten.',
    );
  await dialog.getByRole('button', { name: strings.sources.addText.submit }).click();
  await expect(
    page.getByText(format(strings.notebook.activeSources, { count: 1, total: 1 })).first(),
  ).toBeVisible();

  const drawer = page.getByRole('complementary', { name: strings.drawer.label });
  await drawer.getByRole('tab', { name: strings.drawer.tabs.studio }).click();
  const studio = drawer.getByRole('region', { name: strings.studio.label });
  await studio.getByRole('button', { name: strings.studio.generate }).click();

  // The Briefing shows up processing, then complete with its key points.
  const briefing = studio.getByRole('article').first();
  await expect(briefing).toHaveAttribute('data-status', 'complete', { timeout: 15_000 });
  await expect(briefing.getByRole('heading', { name: 'Kernpunkte' })).toBeVisible();

  // Its last Citation points at the second Passage and opens the reader there.
  const citations = briefing.getByRole('link', { name: new RegExp(title) });
  await citations.last().click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();
  const highlighted = reader.locator('[data-highlighted]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toHaveText('Anträge sind bis Ende 2027 möglich.');
});
