import { expect, test } from '@playwright/test';

import { format, strings } from '../src/ui/strings';

test('a Visitor asks a question, opens a Citation in the reader and keeps it after deleting the Source', async ({
  page,
}) => {
  const title = `Heizungsgesetz ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('main').getByRole('button', { name: strings.sources.kinds.text }).click();
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
  await expect(
    page.getByText(format(strings.notebook.activeSources, { count: 1, total: 1 })).first(),
  ).toBeVisible();

  const composer = page.getByRole('textbox', { name: strings.conversation.composerPlaceholder });
  await composer.fill('Was gilt für bestehende Heizungen?');
  await composer.press('Enter');

  const thread = page.getByRole('log', { name: strings.chat.label });
  await expect(thread.getByText('Was gilt für bestehende Heizungen?')).toBeVisible();
  // The answer streams in: the Stop button is there until it is complete.
  await expect(page.getByRole('button', { name: strings.chat.stop })).toBeVisible();
  const answer = thread.getByRole('article', { name: strings.chat.answer });
  await expect(answer).toHaveAttribute('data-status', 'complete');
  await expect(page.getByRole('button', { name: strings.conversation.send })).toBeVisible();

  // The second Citation points at the second Passage (ordinal 1).
  const citation = answer.getByRole('link', {
    name: format(strings.chat.citation, { n: 2, title }),
  });
  await citation.click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.getByRole('heading', { name: title })).toBeVisible();
  const highlighted = reader.locator('[data-highlighted]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toHaveText('Für bestehende Heizungen gelten Übergangsfristen.');
  await expect(citation).toHaveAttribute('aria-current', 'true');

  // Deleting the Source keeps the Citation's quote, marked as deleted, without a link.
  const sidebar = page.getByRole('complementary', { name: strings.sidebar.label });
  page.once('dialog', (confirm) => void confirm.accept());
  await sidebar
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: strings.sources.delete })
    .click();
  await expect(answer.getByRole('link')).toHaveCount(0);
  await expect(answer.getByLabel(format(strings.chat.citationDeleted, { n: 2 }))).toBeVisible();
});
