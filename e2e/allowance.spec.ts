import { expect, test } from '@playwright/test';

import { errorMessage, format, strings } from '../src/ui/strings';

test('a Visitor whose Daily allowance is used up sees the composer closed until midnight', async ({
  page,
}) => {
  await page.goto('/');
  const meter = page.getByRole('meter', { name: strings.usage.meterLabel });
  await expect(meter).toHaveAttribute('aria-valuenow', '100');

  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: strings.sources.kinds.text }).click();
  const dialog = page.getByRole('dialog', { name: strings.sources.addText.title });
  await dialog.getByLabel(strings.sources.addText.titleLabel).fill(`Tarif ${Date.now()}`);
  await dialog
    .getByLabel(strings.sources.addText.textLabel)
    .fill('Der Grundpreis beträgt 12 Euro im Monat.');
  await dialog.getByRole('button', { name: strings.sources.addText.submit }).click();
  await expect(
    page.getByText(format(strings.notebook.activeSources, { count: 1, total: 1 })).first(),
  ).toBeVisible();

  // The e2e server's allowance is one micro-dollar: the first answer uses it up.
  const composer = page.getByRole('textbox', { name: strings.conversation.composerPlaceholder });
  await composer.fill('Was kostet der Tarif?');
  await composer.press('Enter');
  const answer = page
    .getByRole('log', { name: strings.chat.label })
    .getByRole('article', { name: strings.chat.answer });
  await expect(answer).toHaveAttribute('data-status', 'complete');

  // Midnight in Berlin always reads 00:00 there.
  const message = errorMessage('daily_allowance', { time: '00:00' });
  await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveAttribute('placeholder', strings.usage.composerPaused);
  await expect(meter).toHaveAttribute('aria-valuenow', '0');
});
