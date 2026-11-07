import { expect, test } from '@playwright/test';

import { format, strings } from '../src/ui/strings';

test('a Visitor saves an answer as a Note and opens its Citation in the reader', async ({
  page,
}) => {
  const title = `Förderprogramm ${Date.now()}`;

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

  const composer = page.getByRole('textbox', { name: strings.conversation.composerPlaceholder });
  await composer.fill('Bis wann kann ich einen Antrag stellen?');
  await composer.press('Enter');
  const answer = page
    .getByRole('log', { name: strings.chat.label })
    .getByRole('article', { name: strings.chat.answer });
  await expect(answer).toHaveAttribute('data-status', 'complete');

  await answer.getByRole('button', { name: strings.chat.saveAsNote }).click();

  // The Note opens in the drawer's Notes tab, titled by the question.
  await expect(page.getByRole('tab', { name: strings.drawer.tabs.notes })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const note = page.getByRole('region', { name: 'Bis wann kann ich einen Antrag stellen?' });
  await expect(
    note.getByRole('heading', { name: 'Bis wann kann ich einen Antrag stellen?' }),
  ).toBeVisible();

  // Its second Citation opens the reader on the second Passage.
  await note.getByRole('link', { name: format(strings.chat.citation, { n: 2, title }) }).click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();
  const highlighted = reader.locator('[data-highlighted]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toHaveText('Anträge sind bis Ende 2027 möglich.');

  // Back in the Notes tab, the Note is still open; deleting the marker [1] drops its chip.
  const drawer = page.getByRole('complementary', { name: strings.drawer.label });
  await drawer.getByRole('tab', { name: strings.drawer.tabs.notes }).click();
  await note.getByRole('button', { name: strings.notes.edit }).click();
  const body = drawer.getByRole('textbox', { name: strings.notes.bodyLabel });
  await body.fill((await body.inputValue()).replace('[1]', ''));
  await drawer.getByRole('button', { name: strings.notes.save, exact: true }).click();
  await expect(
    note.getByRole('link', { name: format(strings.chat.citation, { n: 2, title }) }),
  ).toBeVisible();
  await expect(
    note.getByRole('link', { name: format(strings.chat.citation, { n: 1, title }) }),
  ).toHaveCount(0);
});
