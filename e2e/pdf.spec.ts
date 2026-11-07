import { expect, test } from '@playwright/test';

import { scannedPdf, textPdf } from '../src/test/pdf';
import { errorMessage, format, strings } from '../src/ui/strings';

const pdf = (name: string, data: Uint8Array) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(data),
});

test('a Visitor uploads a PDF, follows a Citation into it and sees its page', async ({ page }) => {
  const stamp = Date.now();
  const title = `KI-Verordnung ${stamp}`;

  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: strings.sources.kinds.pdf }).click();
  const dialog = page.getByRole('dialog', { name: strings.sources.addPdf.title });
  const file = dialog.getByLabel(strings.sources.addPdf.fileLabel);

  // A scan has no text layer: refused with a message, nothing added.
  await file.setInputFiles(pdf('scan.pdf', scannedPdf(2)));
  await expect(dialog.getByRole('alert')).toHaveText(errorMessage('pdf_no_text'));

  await file.setInputFiles(
    pdf(
      `${title}.pdf`,
      textPdf([
        ['Die KI-Verordnung ordnet KI-Systeme nach ihrem Risiko ein.'],
        ['Verboten ist das soziale Scoring', 'durch Behörden.'],
      ]),
    ),
  );
  await expect(dialog).toBeHidden();

  const sidebar = page.getByRole('complementary', { name: strings.sidebar.label });
  const source = sidebar.getByRole('listitem').filter({ hasText: title });
  await expect(source.getByRole('switch', { name: strings.sources.enabledLabel })).toBeChecked();

  const composer = page.getByRole('textbox', { name: strings.conversation.composerPlaceholder });
  await composer.fill('Was ist verboten?');
  await composer.press('Enter');
  const answer = page
    .getByRole('log', { name: strings.chat.label })
    .getByRole('article', { name: strings.chat.answer });
  await expect(answer).toHaveAttribute('data-status', 'complete');

  // The fake's second Citation points at the second Passage, which is on page 2.
  await answer.getByRole('link', { name: format(strings.chat.citation, { n: 2, title }) }).click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();
  const highlighted = reader.locator('[data-highlighted]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toHaveText('Verboten ist das soziale Scoring durch Behörden.');
  // Its page starts right above it.
  await expect(
    reader.locator('li[data-ordinal="1"]').getByText(format(strings.reader.page, { n: 2 })),
  ).toBeVisible();
});
