import { createServer, type Server, type ServerResponse } from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook } from '@/modules/notebooks';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import {
  addUrlSource,
  getSourceWithPassages,
  processSource,
  readWebPage,
  retrySource,
  type Source,
} from '.';

// The integration project lets the guarded fetcher reach 127.0.0.1 on this port only.
const PORT = Number(process.env.URL_FETCH_TEST_LOOPBACK_PORT);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const ARTICLE = `<!doctype html><html><head><meta charset="utf-8"><title>Die Wärmewende</title></head>
<body><nav>Start · Politik</nav><article>
<p>Die Wärmewende ist der Umbau der Heizungen auf erneuerbare Energien, Haus für Haus und Straße für Straße.</p>
<p>Kommunen legen bis 2028 Wärme­pläne vor, die zeigen, wo Wärmenetze entstehen und wo Wärmepumpen sinnvoll sind.</p>
</article><footer>Impressum</footer></body></html>`;

let flakyCalls = 0;
const html = (response: ServerResponse, body: string) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
};
const routes: Record<string, (response: ServerResponse) => void> = {
  '/artikel': (response) => html(response, ARTICLE),
  '/weiter': (response) => {
    response.writeHead(302, { location: '/artikel' });
    response.end();
  },
  '/metadaten': (response) => {
    response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    response.end();
  },
  '/bericht.pdf': (response) => {
    response.writeHead(200, { 'content-type': 'application/pdf' });
    response.end('%PDF-1.7');
  },
  '/ohne-titel': (response) => html(response, ARTICLE.replace('<title>Die Wärmewende</title>', '')),
  '/leer': (response) => html(response, '<html><body><img src="a.png"></body></html>'),
  '/wackelig': (response) => {
    if (flakyCalls++ === 0) {
      response.writeHead(503, { 'content-type': 'text/html' });
      response.end('<p>Später</p>');
    } else html(response, ARTICLE);
  },
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
  flakyCalls = 0;
  visitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'Wärmewende')).id;
});

async function add(url: string): Promise<Source> {
  const result = await addUrlSource(visitor, notebook, { url });
  if (!result.ok) throw new Error(`URL Source was not added: ${result.error}`);
  return result.source;
}

describe('addUrlSource', () => {
  it('adds the web page as a processing Source named after its address', async () => {
    const source = await add(`  ${ORIGIN}/artikel  `);
    expect(source).toMatchObject({
      notebookId: notebook,
      kind: 'url',
      title: `127.0.0.1:${PORT}/artikel`,
      url: `${ORIGIN}/artikel`,
      status: 'processing',
    });
  });

  it('fetches the page into Passages, titled after the page, when processed', async () => {
    const source = await add(`${ORIGIN}/artikel`);
    expect(await processSource(source.id)).toMatchObject({
      status: 'ready',
      title: 'Die Wärmewende',
      url: `${ORIGIN}/artikel`,
    });
    const read = await getSourceWithPassages(visitor, notebook, source.id);
    expect(read?.passages.map((passage) => passage.text)).toEqual([
      'Die Wärmewende ist der Umbau der Heizungen auf erneuerbare Energien, Haus für Haus und Straße für Straße.',
      'Kommunen legen bis 2028 Wärmepläne vor, die zeigen, wo Wärmenetze entstehen und wo Wärmepumpen sinnvoll sind.',
    ]);
  });

  it('keeps the address as the title of a page without one', async () => {
    const source = await add(`${ORIGIN}/ohne-titel`);
    expect(await processSource(source.id)).toMatchObject({
      status: 'ready',
      title: `127.0.0.1:${PORT}/ohne-titel`,
    });
  });

  it('follows a redirect', async () => {
    const source = await add(`${ORIGIN}/weiter`);
    expect(await processSource(source.id)).toMatchObject({ status: 'ready' });
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'url_not_allowed'],
    ['http://[::1]:3000/', 'url_not_allowed'],
    ['file:///etc/passwd', 'url_not_allowed'],
    ['keine Adresse', 'invalid_url'],
  ] as const)('refuses %s right away', async (url, error) => {
    expect(await addUrlSource(visitor, notebook, { url })).toEqual({ ok: false, error });
  });

  it('does not add to another Visitor’s Notebook', async () => {
    const other = await createVisitor({ ipHash: null });
    expect(await addUrlSource(other, notebook, { url: `${ORIGIN}/artikel` })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('processing a URL Source', () => {
  it.each([
    // localhost resolves to loopback: only the DNS check can catch it.
    [`http://localhost:${PORT + 1}/`, 'url_not_allowed'],
    [`${ORIGIN}/metadaten`, 'url_not_allowed'],
    [`${ORIGIN}/bericht.pdf`, 'url_not_html'],
    [`${ORIGIN}/fehlt`, 'url_http_error'],
    [`${ORIGIN}/leer`, 'url_no_content'],
  ])('fails %s with %s', async (url, errorCode) => {
    const source = await add(url);
    expect(await processSource(source.id)).toMatchObject({ status: 'failed', errorCode });
    expect((await getSourceWithPassages(visitor, notebook, source.id))?.passages).toEqual([]);
  });

  it('fetches the page again on retry after a failed fetch', async () => {
    const source = await add(`${ORIGIN}/wackelig`);
    expect(await processSource(source.id)).toMatchObject({ status: 'failed' });
    await retrySource(visitor, notebook, source.id);
    expect(await processSource(source.id)).toMatchObject({ status: 'ready' });
    expect((await getSourceWithPassages(visitor, notebook, source.id))?.passages).toHaveLength(2);
  });
});

describe('readWebPage', () => {
  it('reads a page’s article as text without adding a Source', async () => {
    expect(await readWebPage(`${ORIGIN}/weiter`)).toEqual({
      ok: true,
      url: `${ORIGIN}/artikel`,
      title: 'Die Wärmewende',
      text:
        'Die Wärmewende ist der Umbau der Heizungen auf erneuerbare Energien, Haus für Haus und Straße für Straße.\n\n' +
        'Kommunen legen bis 2028 Wärmepläne vor, die zeigen, wo Wärmenetze entstehen und wo Wärmepumpen sinnvoll sind.',
    });
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'url_not_allowed'],
    [`${ORIGIN}/metadaten`, 'url_not_allowed'],
    [`${ORIGIN}/bericht.pdf`, 'url_not_html'],
    [`${ORIGIN}/leer`, 'url_no_content'],
    ['keine Adresse', 'invalid_url'],
  ])('refuses %s with %s', async (url, error) => {
    expect(await readWebPage(url)).toEqual({ ok: false, error });
  });
});
