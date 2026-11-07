import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchPage, type FetchPageOptions } from './fetch-page';

const HTML =
  '<!doctype html><html><head><title>Hallo</title></head><body><p>Text</p></body></html>';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;
const routes: Record<string, Handler> = {
  '/page': (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(HTML);
  },
  '/host': (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<p>${request.headers.host}</p>`);
  },
  '/gzip': (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
    response.end(gzipSync(HTML));
  },
  '/pdf': (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/pdf' });
    response.end('%PDF-1.7');
  },
  '/missing': (_request, response) => {
    response.writeHead(404, { 'content-type': 'text/html' });
    response.end('<p>Nicht gefunden</p>');
  },
  '/huge': (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('x'.repeat(5000));
  },
  '/huge-gzip': (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
    response.end(gzipSync('x'.repeat(5000)));
  },
  '/slow': (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.write('<p>');
    setTimeout(() => response.end('</p>'), 2000).unref();
  },
  '/slow-gzip': (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
    response.write(gzipSync(HTML).subarray(0, 10));
    setTimeout(() => response.end(), 2000).unref();
  },
  '/to-page': (_request, response) => {
    response.writeHead(302, { location: '/page' });
    response.end();
  },
  '/to-metadata': (_request, response) => {
    response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    response.end();
  },
  '/to-internal-host': (_request, response) => {
    response.writeHead(301, { location: `http://intranet.test:${port}/page` });
    response.end();
  },
  '/to-file': (_request, response) => {
    response.writeHead(302, { location: 'file:///etc/passwd' });
    response.end();
  },
  '/loop': (_request, response) => {
    response.writeHead(302, { location: '/loop' });
    response.end();
  },
};

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((request, response) => {
    const handler = routes[request.url ?? ''];
    if (handler) return handler(request, response);
    response.writeHead(500);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

// In these tests the fixture server's loopback address stands in for a public
// one; `intranet.test` resolves to a private address, like an internal host.
const DNS: Record<string, string[]> = {
  'site.test': ['127.0.0.1'],
  'intranet.test': ['10.0.0.7'],
  'mixed.test': ['127.0.0.1', '192.168.0.10'],
};

function options(overrides: Partial<FetchPageOptions> = {}): FetchPageOptions {
  return {
    resolve: async (hostname) => {
      const addresses = DNS[hostname];
      if (!addresses) throw new Error(`ENOTFOUND ${hostname}`);
      return addresses;
    },
    isAllowedAddress: (address) => address === '127.0.0.1',
    ...overrides,
  };
}

const at = (path: string, host = 'site.test') => `http://${host}:${port}${path}`;

describe('fetchPage', () => {
  it('fetches an HTML page through the checked address', async () => {
    const result = await fetchPage(at('/page'), options());
    expect(result).toMatchObject({ ok: true, page: { url: at('/page') } });
    if (!result.ok) return;
    expect(result.page.contentType).toBe('text/html; charset=utf-8');
    expect(result.page.body.toString('utf8')).toBe(HTML);
  });

  it('keeps the host name for the Host header', async () => {
    const result = await fetchPage(at('/host'), options());
    expect(result.ok && result.page.body.toString()).toBe(`<p>site.test:${port}</p>`);
  });

  it('decompresses a gzip body', async () => {
    const result = await fetchPage(at('/gzip'), options());
    expect(result.ok && result.page.body.toString()).toBe(HTML);
  });

  it.each(['ftp://site.test/page', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://x/'])(
    'only allows http and https, not %s',
    async (url) => {
      expect(await fetchPage(url, options())).toEqual({ ok: false, error: 'url_not_allowed' });
    },
  );

  it('rejects text that is not a URL', async () => {
    expect(await fetchPage('keine adresse', options())).toEqual({
      ok: false,
      error: 'invalid_url',
    });
  });

  it('rejects URLs with credentials', async () => {
    expect(await fetchPage(`http://user:pw@site.test:${port}/page`, options())).toEqual({
      ok: false,
      error: 'url_not_allowed',
    });
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://10.0.0.1/',
    'http://2130706433/',
    'http://0x7f.1/',
  ])('blocks the literal private address in %s with the default policy', async (url) => {
    let resolved = false;
    const result = await fetchPage(url, {
      resolve: async () => {
        resolved = true;
        return ['127.0.0.1'];
      },
    });
    expect(result).toEqual({ ok: false, error: 'url_not_allowed' });
    expect(resolved).toBe(false);
  });

  it('blocks a host name that resolves to a private address', async () => {
    expect(await fetchPage(at('/page', 'intranet.test'), options())).toEqual({
      ok: false,
      error: 'url_not_allowed',
    });
  });

  it('blocks a host name if any of its addresses is private', async () => {
    expect(await fetchPage(at('/page', 'mixed.test'), options())).toEqual({
      ok: false,
      error: 'url_not_allowed',
    });
  });

  it('connects to the address it checked, so a DNS rebind cannot swap in another', async () => {
    const answers = [['127.0.0.1'], ['10.0.0.7']];
    let lookups = 0;
    const result = await fetchPage(
      at('/page', 'rebind.test'),
      options({ resolve: async () => answers[Math.min(lookups++, 1)] ?? [] }),
    );
    expect(result.ok).toBe(true);
    expect(lookups).toBe(1);
  });

  it('follows a redirect and reports the final URL', async () => {
    const result = await fetchPage(at('/to-page'), options());
    expect(result).toMatchObject({ ok: true, page: { url: at('/page') } });
  });

  it('blocks a redirect to the metadata address', async () => {
    expect(await fetchPage(at('/to-metadata'), options())).toEqual({
      ok: false,
      error: 'url_not_allowed',
    });
  });

  it('re-checks DNS on a redirect to a host that resolves privately', async () => {
    expect(await fetchPage(at('/to-internal-host'), options())).toEqual({
      ok: false,
      error: 'url_not_allowed',
    });
  });

  it('blocks a redirect to another scheme', async () => {
    expect(await fetchPage(at('/to-file'), options())).toEqual({
      ok: false,
      error: 'url_not_allowed',
    });
  });

  it('gives up after too many redirects', async () => {
    expect(await fetchPage(at('/loop'), options())).toEqual({
      ok: false,
      error: 'url_too_many_redirects',
    });
  });

  it('only accepts HTML', async () => {
    expect(await fetchPage(at('/pdf'), options())).toEqual({ ok: false, error: 'url_not_html' });
  });

  it('reports an error status', async () => {
    expect(await fetchPage(at('/missing'), options())).toEqual({
      ok: false,
      error: 'url_http_error',
    });
  });

  it('stops reading past the size cap, also after decompression', async () => {
    const capped = options({ maxBytes: 1000 });
    expect(await fetchPage(at('/huge'), capped)).toEqual({ ok: false, error: 'url_too_large' });
    expect(await fetchPage(at('/huge-gzip'), capped)).toEqual({
      ok: false,
      error: 'url_too_large',
    });
  });

  it('times out a slow page', async () => {
    expect(await fetchPage(at('/slow'), options({ timeoutMs: 200 }))).toEqual({
      ok: false,
      error: 'url_timeout',
    });
    expect(await fetchPage(at('/slow-gzip'), options({ timeoutMs: 200 }))).toEqual({
      ok: false,
      error: 'url_timeout',
    });
  });

  it('times out a host name that takes too long to resolve', async () => {
    const hanging = options({ timeoutMs: 200, resolve: () => new Promise<string[]>(() => {}) });
    expect(await fetchPage(at('/page', 'slow-dns.test'), hanging)).toEqual({
      ok: false,
      error: 'url_timeout',
    });
  });

  it('reports a host that does not resolve as unreachable', async () => {
    expect(await fetchPage(at('/page', 'nowhere.test'), options())).toEqual({
      ok: false,
      error: 'url_unreachable',
    });
  });
});
