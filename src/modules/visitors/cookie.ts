import { cookies, headers } from 'next/headers';

import { env } from '@/platform/env';

import { clientIp, hashIp } from './ip-hash';
import { parseVisitorId, resolveVisitor } from './store';

const VISITOR_COOKIE = 'visitor';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * The Visitor id from the cookie, for reads. Never creates a Visitor: a page
 * view alone leaves no trace in the database.
 */
export async function currentVisitorId(): Promise<string | null> {
  return parseVisitorId((await cookies()).get(VISITOR_COOKIE)?.value);
}

/**
 * The Visitor for a mutation (Server Actions only): creates the Visitor and
 * its cookie lazily on the first mutation, and refreshes the cookie after.
 */
export async function ensureVisitor(): Promise<string> {
  const cookieStore = await cookies();
  const ip = clientIp(await headers());
  const { visitorId } = await resolveVisitor({
    cookieValue: cookieStore.get(VISITOR_COOKIE)?.value,
    ipHash: ip ? hashIp(ip, env().IP_HASH_SECRET) : null,
  });
  cookieStore.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  return visitorId;
}
