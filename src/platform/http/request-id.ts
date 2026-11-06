export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Keeps a well-formed incoming request id (e.g. from a reverse proxy) so logs
 * line up across hops; anything else is replaced with a fresh UUID.
 */
export function resolveRequestId(incoming: string | null | undefined): string {
  if (incoming && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return crypto.randomUUID();
}
