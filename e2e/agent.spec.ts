import { expect, test, type Page } from '@playwright/test';

import { format, stepLabel, strings } from '../src/ui/strings';

// The pages the fake Agent's web search finds (e2e/fixtures/web-page-server.mjs).
const OFFICIAL_URL = 'http://127.0.0.1:3101/ki-verordnung/bundesnetzagentur';
const OFFICIAL_TITLE = 'KI-Verordnung: Zuständigkeiten in Deutschland';
const READ_ONLY_URL = 'http://127.0.0.1:3101/ki-verordnung/einordnung';
// The folded timeline: the Step count and what the run cost.
const folded = (count: number) => new RegExp(`^${count} Schritte · (< )?\\d+,\\d{2}\\s\\$$`);

async function notebookWithSource(page: Page, title: string, text?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: strings.welcome.cta }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: strings.sources.kinds.text }).click();
  const dialog = page.getByRole('dialog', { name: strings.sources.addText.title });
  await dialog.getByLabel(strings.sources.addText.titleLabel).fill(title);
  await dialog
    .getByLabel(strings.sources.addText.textLabel)
    .fill(
      text ??
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
  await expect(answer.getByRole('button', { name: folded(3) })).toBeVisible();
  await answer.getByRole('button', { name: folded(3) }).click();
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
  await expect(stored.getByRole('button', { name: folded(3) })).toBeVisible();
});

test('a Visitor has the Agent research the web, add an official Source and note the findings', async ({
  page,
}) => {
  const title = `KI-Verordnung ${Date.now()}`;
  const query = 'Wie ist der aktuelle Stand der Umsetzung der KI-Verordnung in Deutschland';
  await notebookWithSource(
    page,
    title,
    'Die KI-Verordnung der EU gilt seit 2024 und wird schrittweise wirksam.\n\n' +
      'Die Mitgliedstaaten benennen Behörden für die Marktüberwachung.',
  );

  const answer = await giveAgentTask(
    page,
    'Wie ist der aktuelle Stand der Umsetzung der KI-Verordnung in Deutschland? Füge eine aktuelle offizielle Quelle hinzu und halte die Zuständigkeiten in einer Notiz fest.',
  );

  // The research Steps appear live, then the timeline folds into count and cost.
  const steps = answer.getByRole('list', { name: strings.agent.steps });
  await expect(steps.getByText(stepLabel('web_search', query))).toBeVisible();
  await expect(answer).toHaveAttribute('data-status', 'complete');
  const summary = answer.getByRole('button', { name: folded(8) });
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(steps.getByRole('listitem')).toContainText([
    stepLabel('list_sources', null),
    stepLabel('read_source', title),
    stepLabel('web_search', query),
    stepLabel('read_web_page', '127.0.0.1:3101'),
    stepLabel('read_web_page', '127.0.0.1:3101'),
    stepLabel('add_url_source', '127.0.0.1:3101'),
    stepLabel('read_source', OFFICIAL_TITLE),
    stepLabel('create_note', 'Vergleich der Quellen'),
  ]);

  // The official page is now a ready Source in the sidebar.
  const sidebar = page.getByRole('complementary', { name: strings.sidebar.label });
  // The innermost list item: the Notebook's own item contains its Sources.
  const added = sidebar.getByRole('listitem').filter({ hasText: OFFICIAL_TITLE }).last();
  await expect(added.getByRole('switch', { name: strings.sources.enabledLabel })).toBeChecked();

  // The page read but not added is a plain link, not a Citation.
  await expect(answer.getByRole('link', { name: READ_ONLY_URL })).toHaveAttribute(
    'href',
    READ_ONLY_URL,
  );
  await expect(answer.getByRole('link', { name: OFFICIAL_URL })).toHaveCount(0);

  // The Note with the findings is in the Notes tab.
  const drawer = page.getByRole('complementary', { name: strings.drawer.label });
  await drawer.getByRole('tab', { name: strings.drawer.tabs.notes }).click();
  await expect(drawer.getByText('Vergleich der Quellen')).toBeVisible();

  // A Citation of the added Source opens the reader on its Passage.
  await answer
    .getByRole('link', { name: new RegExp(OFFICIAL_TITLE) })
    .first()
    .click();
  const reader = page.getByRole('region', { name: strings.reader.label });
  await expect(reader.locator('[data-highlighted]').first()).toHaveText(
    'Die Bundesnetzagentur wird zentrale Marktüberwachungsbehörde für KI-Systeme in Deutschland.',
  );

  // After a reload the folded timeline still shows count and cost.
  await page.reload();
  const stored = page
    .getByRole('log', { name: strings.chat.label })
    .getByRole('article', { name: strings.agent.answer });
  await expect(stored.getByRole('button', { name: folded(8) })).toBeVisible();
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
