import { env } from '@/platform/env';

import { isPublicAddress } from './address-guard';
import { checkUrl, fetchPage, type FetchPageError, type FetchPageResult } from './fetch-page';

export { isPublicAddress } from './address-guard';
export type { FetchedPage, FetchPageError, FetchPageResult } from './fetch-page';

/** Public addresses only, plus the loopback fixture port when tests set one. */
function isAllowedAddress(address: string, port: number): boolean {
  if (isPublicAddress(address)) return true;
  const testPort = env().URL_FETCH_TEST_LOOPBACK_PORT;
  return testPort !== undefined && port === testPort && address === '127.0.0.1';
}

/**
 * Fetches a web page through the SSRF-guarded fetcher: the one way server code
 * fetches a URL (URL Sources, the Agent's `read_web_page`).
 */
export function fetchWebPage(url: string): Promise<FetchPageResult> {
  return fetchPage(url, { isAllowedAddress });
}

/** The fetcher's checks that need no network, for rejecting a URL before it is queued. */
export function checkWebPageUrl(url: string): FetchPageError | null {
  return checkUrl(url, { isAllowedAddress });
}
