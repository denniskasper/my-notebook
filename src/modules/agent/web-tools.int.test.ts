import { createServer, type Server, type ServerResponse } from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook } from '@/modules/notebooks';
import { listSources } from '@/modules/sources';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import type { AgentTool } from '@/platform/llm';
import { resetDatabase } from '@/test/database';

import { createNotebookTools, type StepUpdate } from '.';

// The integration project lets the guarded fetcher reach 127.0.0.1 on this port only.
const PORT = Number(process.env.URL_FETCH_TEST_LOOPBACK_PORT);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const page = (title: string, paragraphs: string[]) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body><nav>Start · Politik</nav><article>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</article>
<footer>Impressum</footer></body></html>`;

const PRESS_RELEASE = page('KI-Aufsicht startet', [
  'Die Behörde übernimmt die Marktüberwachung für KI-Systeme in Deutschland.',
  'Eine zentrale Anlaufstelle berät Unternehmen bei Fragen zur Verordnung.',
]);

const html = (response: ServerResponse, body: string) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
};
const routes: Record<string, (response: ServerResponse) => void> = {
  '/pressemitteilung': (response) => html(response, PRESS_RELEASE),
  '/lang': (response) =>
    html(
      response,
      page(
        'Lang',
        Array.from({ length: 20 }, (_, i) => `Absatz ${i} ${'x'.repeat(60)}.`),
      ),
    ),
  '/metadaten': (response) => {
    response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    response.end();
  },
  '/leer': (response) => html(response, '<html><body><img src="a.png"></body></html>'),
};

let server: Server;
beforeAll(async () => {
  server = createServer((request, response) => {
    const route = routes[request.url ?? ''];
    if (route) return route(response);
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

let visitor: string;
let notebook: string;
beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'KI-Verordnung')).id;
});

function toolbox(options: Parameters<typeof createNotebookTools>[1] = {}, visitorId = visitor) {
  const steps: StepUpdate[] = [];
  const box = createNotebookTools(
    { visitorId, notebookId: notebook },
    { ...options, onStep: (step) => steps.push(step) },
  );
  const call = async (name: string, input: unknown) => {
    const tool: AgentTool | undefined = box.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    const result = await tool.run(input);
    return { ...result, json: result.isError ? null : (JSON.parse(result.text) as unknown) };
  };
  return { ...box, steps, call };
}

describe('read_web_page', () => {
  it('returns the page’s cleaned text as material that is not a Source', async () => {
    const { call, steps, passage } = toolbox();

    const result = await call('read_web_page', { url: `${ORIGIN}/pressemitteilung` });

    expect(result.json).toEqual({
      url: `${ORIGIN}/pressemitteilung`,
      title: 'KI-Aufsicht startet',
      text:
        'Die Behörde übernimmt die Marktüberwachung für KI-Systeme in Deutschland.\n\n' +
        'Eine zentrale Anlaufstelle berät Unternehmen bei Fragen zur Verordnung.',
      truncated: false,
      note: expect.stringContaining('add_url_source'),
    });
    // Nothing on a web page can be cited until it is added and read as a Source.
    expect(passage('q1-0')).toBeUndefined();
    expect(steps).toEqual([
      { id: 's1', tool: 'read_web_page', argument: `127.0.0.1:${PORT}`, status: 'running' },
      { id: 's1', tool: 'read_web_page', argument: `127.0.0.1:${PORT}`, status: 'done' },
    ]);
  });

  it('truncates a long page', async () => {
    const { call } = toolbox({ pageMaxChars: 200 });
    const result = await call('read_web_page', { url: `${ORIGIN}/lang` });
    expect(result.json).toMatchObject({ truncated: true });
    const { text } = result.json as { text: string };
    expect(text.length).toBeLessThanOrEqual(200);
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'url_not_allowed'],
    [`${ORIGIN}/metadaten`, 'url_not_allowed'],
    [`${ORIGIN}/leer`, 'url_no_content'],
    [`${ORIGIN}/fehlt`, 'url_http_error'],
  ])('refuses %s as an error the Agent sees (%s)', async (url, code) => {
    const { call, steps } = toolbox();
    expect(await call('read_web_page', { url })).toMatchObject({
      isError: true,
      text: expect.stringContaining(code),
    });
    expect(steps.at(-1)).toMatchObject({ tool: 'read_web_page', status: 'failed' });
  });

  it('reads at most five pages per run', async () => {
    const { call } = toolbox();
    const url = `${ORIGIN}/pressemitteilung`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call('read_web_page', { url })),
    );
    expect(results.filter((result) => result.isError)).toEqual([
      expect.objectContaining({ text: expect.stringContaining('5') }),
    ]);
  });
});

describe('add_url_source', () => {
  it('adds the page as a ready Source the Agent can then read and cite', async () => {
    const added: string[] = [];
    const { call, steps, passage } = toolbox({ onSourceAdded: (id) => added.push(id) });

    const result = await call('add_url_source', { url: `${ORIGIN}/pressemitteilung` });

    const [source] = await listSources(visitor, notebook);
    expect(source).toMatchObject({ kind: 'url', status: 'ready', title: 'KI-Aufsicht startet' });
    expect(result.json).toEqual({
      sourceId: source?.id,
      title: 'KI-Aufsicht startet',
      status: 'ready',
      hint: expect.stringContaining('read_source'),
    });
    expect(added).toEqual([source?.id]);
    expect(steps.at(-1)).toMatchObject({
      tool: 'add_url_source',
      argument: `127.0.0.1:${PORT}`,
      status: 'done',
    });

    await call('read_source', { sourceId: source?.id });
    expect(passage('q1-1')).toMatchObject({ sourceId: source?.id, ordinal: 1 });
  });

  it('reports a page that fails as an error, keeping the failed Source visible', async () => {
    const added: string[] = [];
    const { call } = toolbox({ onSourceAdded: (id) => added.push(id) });
    expect(await call('add_url_source', { url: `${ORIGIN}/leer` })).toMatchObject({
      isError: true,
      text: expect.stringContaining('url_no_content'),
    });
    const [source] = await listSources(visitor, notebook);
    expect(source).toMatchObject({ status: 'failed', errorCode: 'url_no_content' });
    expect(added).toEqual([source?.id]);
  });

  it('refuses an address that must not be fetched without adding anything', async () => {
    const { call } = toolbox();
    expect(
      await call('add_url_source', { url: 'http://169.254.169.254/latest/meta-data/' }),
    ).toMatchObject({ isError: true, text: expect.stringContaining('url_not_allowed') });
    expect(await listSources(visitor, notebook)).toEqual([]);
  });

  it('adds at most two Sources per run, even when the calls run at once', async () => {
    const { call } = toolbox();
    const url = `${ORIGIN}/pressemitteilung`;
    const results = await Promise.all(
      Array.from({ length: 3 }, () => call('add_url_source', { url })),
    );
    expect(results.filter((result) => result.isError)).toEqual([
      expect.objectContaining({ text: expect.stringContaining('2') }),
    ]);
    expect(await listSources(visitor, notebook)).toHaveLength(2);
  });
});

describe('web search', () => {
  it('reports each search as a Step and refuses the fourth one in a run', () => {
    const { webSearch, steps, webSearches } = toolbox();

    for (const id of ['a', 'b', 'c']) {
      expect(webSearch.begin(id, `KI-Verordnung ${id}`)).toBeNull();
      webSearch.end(id, true);
    }
    expect(webSearch.begin('d', 'KI-Verordnung d')).toEqual(expect.stringContaining('3'));

    expect(webSearches()).toBe(3);
    expect(steps.filter((step) => step.status !== 'running')).toEqual([
      { id: 's1', tool: 'web_search', argument: 'KI-Verordnung a', status: 'done' },
      { id: 's2', tool: 'web_search', argument: 'KI-Verordnung b', status: 'done' },
      { id: 's3', tool: 'web_search', argument: 'KI-Verordnung c', status: 'done' },
      { id: 's4', tool: 'web_search', argument: 'KI-Verordnung d', status: 'failed' },
    ]);
  });

  it('marks a search that failed', () => {
    const { webSearch, steps } = toolbox();
    webSearch.begin('a', 'KI-Verordnung');
    webSearch.end('a', false);
    expect(steps.at(-1)).toMatchObject({ tool: 'web_search', status: 'failed' });
  });
});
