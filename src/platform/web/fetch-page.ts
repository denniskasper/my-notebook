import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { pipeline, type Readable, type Transform } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

import { isPublicAddress } from './address-guard';

/** Why a page could not be fetched; each maps to its own German message. */
export type FetchPageError =
  | 'invalid_url'
  | 'url_not_allowed'
  | 'url_unreachable'
  | 'url_timeout'
  | 'url_too_large'
  | 'url_not_html'
  | 'url_http_error'
  | 'url_too_many_redirects';

/** A fetched HTML page: the URL it was finally served from, its content type and raw body. */
export type FetchedPage = { url: string; contentType: string; body: Buffer };

export type FetchPageResult =
  { ok: true; page: FetchedPage } | { ok: false; error: FetchPageError };

export type FetchPageOptions = {
  /** All addresses of a host name; defaults to the system resolver. */
  resolve?: (hostname: string) => Promise<string[]>;
  /** Whether the fetcher may connect to this address and port; defaults to public addresses only. */
  isAllowedAddress?: (address: string, port: number) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
// Far above any article's HTML; the cap is there to stop a stream, not to judge pages.
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
const USER_AGENT = 'Mozilla/5.0 (compatible; MyNotebook/0.1; +source fetcher)';

class FetchFailure extends Error {
  constructor(readonly code: FetchPageError) {
    super(code);
  }
}

/**
 * Fetches an HTML page behind SSRF guards: http/https only, no credentials;
 * the host is resolved once and every address checked, and the connection goes
 * to the checked address (so a DNS rebind can't swap it); each redirect is
 * checked again; overall timeout, size cap (after decompression) and HTML only.
 * Anything that fetches a URL on the server goes through here.
 */
export async function fetchPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<FetchPageResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const page = await follow(url, options, signal);
    return { ok: true, page };
  } catch (error) {
    if (error instanceof FetchFailure) return { ok: false, error: error.code };
    if (signal.aborted) return { ok: false, error: 'url_timeout' };
    return { ok: false, error: 'url_unreachable' };
  }
}

/**
 * The checks that need no network: a valid http(s) URL without credentials,
 * and, if its host is an IP address, an allowed one. Null if it may be fetched.
 */
export function checkUrl(
  url: string,
  options: Pick<FetchPageOptions, 'isAllowedAddress'> = {},
): FetchPageError | null {
  try {
    const parsed = parseUrl(url);
    const { hostname, port } = target(parsed);
    const isAllowed = options.isAllowedAddress ?? isPublicAddress;
    if (isIP(hostname) && !isAllowed(hostname, port)) return 'url_not_allowed';
    return null;
  } catch (error) {
    if (error instanceof FetchFailure) return error.code;
    throw error;
  }
}

async function follow(
  startUrl: string,
  options: FetchPageOptions,
  signal: AbortSignal,
): Promise<FetchedPage> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let current = parseUrl(startUrl);
  for (let redirects = 0; ; redirects++) {
    const response = await requestChecked(current, options, signal);
    const location = response.headers.location;
    if (isRedirect(response.statusCode) && location) {
      response.resume();
      if (redirects >= maxRedirects) throw new FetchFailure('url_too_many_redirects');
      current = parseUrl(location, current);
      continue;
    }
    return readPage(current, response, options.maxBytes ?? DEFAULT_MAX_BYTES);
  }
}

/** A URL the fetcher may try: valid, http(s), without credentials. */
function parseUrl(text: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(text, base);
  } catch {
    throw new FetchFailure('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new FetchFailure('url_not_allowed');
  if (url.username || url.password) throw new FetchFailure('url_not_allowed');
  return url;
}

function isRedirect(status: number | undefined): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Resolves, checks every address, then requests the URL pinned to the checked address. */
async function requestChecked(
  url: URL,
  options: FetchPageOptions,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const { hostname, port } = target(url);
  const isAllowed = options.isAllowedAddress ?? isPublicAddress;

  const addresses = isIP(hostname)
    ? [hostname]
    : await (options.resolve ?? resolveHost)(hostname).catch(() => {
        throw new FetchFailure('url_unreachable');
      });
  if (addresses.length === 0) throw new FetchFailure('url_unreachable');
  if (!addresses.every((address) => isAllowed(address, port)))
    throw new FetchFailure('url_not_allowed');
  const [address] = addresses as [string, ...string[]];

  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const requestOptions: RequestOptions = {
    protocol: url.protocol,
    hostname,
    port,
    path: `${url.pathname}${url.search}`,
    method: 'GET',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
      'accept-encoding': 'gzip, deflate, br',
    },
    // The host name stays for the Host header and TLS (SNI, certificate); the
    // socket only ever connects to the address checked above.
    lookup: pinnedLookup(address),
    agent: false,
    signal,
  };
  return new Promise((resolve, reject) => {
    const outgoing = request(requestOptions, resolve);
    outgoing.on('error', reject);
    outgoing.end();
  });
}

/** The host (IPv6 without brackets) and port a URL connects to. */
function target(url: URL): { hostname: string; port: number } {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  return { hostname, port };
}

async function resolveHost(hostname: string): Promise<string[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address);
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

async function readPage(
  url: URL,
  response: IncomingMessage,
  maxBytes: number,
): Promise<FetchedPage> {
  const status = response.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    response.resume();
    throw new FetchFailure('url_http_error');
  }
  const contentType = response.headers['content-type'] ?? '';
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!HTML_TYPES.includes(mediaType)) {
    response.resume();
    throw new FetchFailure('url_not_html');
  }
  if (Number(response.headers['content-length'] ?? 0) > maxBytes) {
    response.destroy();
    throw new FetchFailure('url_too_large');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of decoded(response)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > maxBytes) {
      response.destroy();
      throw new FetchFailure('url_too_large');
    }
    chunks.push(buffer);
  }
  return { url: url.href, contentType, body: Buffer.concat(chunks) };
}

/** The body with its content encoding undone; the size cap applies to what comes out. */
function decoded(response: IncomingMessage): Readable {
  const encoding = (response.headers['content-encoding'] ?? '').trim().toLowerCase();
  let decoder: Transform | null = null;
  if (encoding === 'gzip' || encoding === 'x-gzip') decoder = createGunzip();
  else if (encoding === 'deflate') decoder = createInflate();
  else if (encoding === 'br') decoder = createBrotliDecompress();
  if (!decoder) return response;
  // pipeline (unlike pipe) tears the decoder down when the response is aborted.
  return pipeline(response, decoder, () => {});
}
