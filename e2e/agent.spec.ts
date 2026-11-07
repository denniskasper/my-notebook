import { expect, test, type Page } from '@playwright/test';

import { format, stepLabel, strings } from '../src/ui/strings';

async function notebookWithSource(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: strings.sources.kinds.text }).click();
  const dialog = page.getByRole('dialog', { name: strings.sources.addText.title });
  await dialog.getByLabel(strings.sources.addText.titleLabel).fill(title);
  await dialog
    .getByLabel(strings.sources.addText.textLabel)
    .fill(
      'Die Kommune muss bis 2028 einen Wärmeplan vorlegen.\n\n' +
        'Das Stadtwerk liefert dafür die Verbrauchsdaten.',
    );
  await dialog.getByRole('button', { name: strings.sources.addText.submit }).click();
  await expect(
    page.getByText(format(strings.notebook.activeSources, { count: 1, total: 1 })).first(),
  ).toBeVisible();
}

async function giveAgentTask(page: Page, task: string) {
  await page.getByRole('radio', { name: strings.conversation.modeAgent }).click();
  const composer = page.getByRole('textbox', { name: strings.conversation.agentPlaceholder });
  await composer.fill(task);
  await composer.press('Enter');
  return page
    .getByRole('log', { name: strings.chat.label })
    .getByRole('article', { name: strings.agent.answer });
}

test('a Visitor gives the Agent a task, watches its Steps and gets a Note and a Citation', async ({
  page,
}) => {
  const title = `Wärmeplanung ${Date.now()}`;
  await notebookWithSource(page, title);

  const answer = await giveAgentTask(
    page,
    'Fass die Pflichten zusammen und halte sie als Notiz fest.',
  );

  // The timeline shows each Step live, then folds into a count once the run is done.
  const steps = answer.getByRole('list', { name: strings.agent.steps });
  await expect(steps.getByText(stepLabel('read_source', title))).toBeVisible();
  await expect(answer).toHaveAttribute('data-status', 'complete');
  await expect(answer.getByRole('button', { name: '3 Schritte' })).toBeVisible();
  await answer.getByRole('button', { name: '3 Schritte' }).click();
  await expect(steps.getByRole('listitem')).toHaveText(
    [
      stepLabel('list_sources', null),
      stepLabel('read_source', title),
      stepLabel('create_note', 'Vergleich der Quellen'),
    ].map((label) => new RegExp(label)),
  );

  // The Note the Agent wrote is in the Notes tab.
  const drawer = page.getByRole('complementary', { name: strings.drawer.label });
  await drawer.getByRole('tab', { name: strings.drawer.tabs.notes }).click();
  await expect(drawer.getByText('Vergleich der Quellen')).toBeVisible();

  // The answer's Citation opens the reader on the cited Passage; the invented one is gone.
  await expect(answer).not.toContainText('[[');
  await answer.getByRole('link', { name: format(strings.chat.citation, { n: 2, title }) }).click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.locator('[data-highlighted]')).toHaveText(
    'Das Stadtwerk liefert dafür die Verbrauchsdaten.',
  );

  // After a reload the run replays from the stored message, Steps included.
  await page.reload();
  const stored = page
    .getByRole('log', { name: strings.chat.label })
    .getByRole('article', { name: strings.agent.answer });
  await expect(stored.getByRole('button', { name: '3 Schritte' })).toBeVisible();
});

test('a Visitor stops the Agent and keeps the partial run, marked as stopped', async ({ page }) => {
  await notebookWithSource(page, `Stopp ${Date.now()}`);

  const answer = await giveAgentTask(page, 'Lies alles gründlich.');
  await expect(
    answer.getByRole('list', { name: strings.agent.steps }).getByRole('listitem').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: strings.agent.stop }).click();

  await expect(answer).toHaveAttribute('data-status', 'stopped');
  await expect(answer.getByText(strings.agent.stopped)).toBeVisible();
  await page.reload();
  const stored = page
    .getByRole('log', { name: strings.chat.label })
    .getByRole('article', { name: strings.agent.answer });
  await expect(stored).toHaveAttribute('data-status', 'stopped');
  await expect(stored.getByText(strings.agent.stopped)).toBeVisible();
});
