import { and, count, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { berlinDayStart } from '@/modules/usage';
import { db } from '@/platform/db';
import { env } from '@/platform/env';

import { visitors } from './schema';

const visitorIdSchema = z.uuid();

/** Cookie values are untrusted: anything that is not a UUID can't be a Visitor. */
export function parseVisitorId(value: string | undefined): string | null {
  const result = visitorIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

export async function createVisitor(input: { ipHash: string | null }): Promise<string> {
  const [row] = await db()
    .insert(visitors)
    .values({ createdIpHash: input.ipHash })
    .returning({ id: visitors.id });
  if (!row) throw new Error('Visitor insert returned no row');
  return row.id;
}

/** Marks the Visitor as active now; false if it no longer exists (e.g. purged). */
export async function touchVisitor(visitorId: string): Promise<boolean> {
  const rows = await db()
    .update(visitors)
    .set({ lastSeenAt: new Date() })
    .where(eq(visitors.id, visitorId))
    .returning({ id: visitors.id });
  return rows.length > 0;
}

export async function findVisitor(visitorId: string) {
  const [row] = await db().select().from(visitors).where(eq(visitors.id, visitorId));
  return row ?? null;
}

/** A new Visitor, unless its IP already created `NEW_VISITORS_PER_IP_PER_DAY` today (Berlin). */
async function createVisitorWithinIpLimit(ipHash: string | null): Promise<string | null> {
  if (ipHash === null) return createVisitor({ ipHash });
  return db().transaction(async (tx) => {
    // Serialises new Visitors per IP, so a burst can't slip past the count.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`visitor-ip:${ipHash}`}))`);
    const [row] = await tx
      .select({ created: count() })
      .from(visitors)
      .where(
        and(
          eq(visitors.createdIpHash, ipHash),
          gte(visitors.createdAt, berlinDayStart(new Date())),
        ),
      );
    if ((row?.created ?? 0) >= env().NEW_VISITORS_PER_IP_PER_DAY) return null;
    const [visitor] = await tx
      .insert(visitors)
      .values({ createdIpHash: ipHash })
      .returning({ id: visitors.id });
    if (!visitor) throw new Error('Visitor insert returned no row');
    return visitor.id;
  });
}

/**
 * The Visitor behind a cookie value for a mutation: the existing one (touched),
 * or a new one when the cookie is missing, malformed or points to a deleted Visitor.
 * `visitor_limit` when the IP may not create another Visitor today.
 */
export async function resolveVisitor(input: {
  cookieValue: string | undefined;
  ipHash: string | null;
}): Promise<{ visitorId: string; created: boolean } | { error: 'visitor_limit' }> {
  const existing = parseVisitorId(input.cookieValue);
  if (existing && (await touchVisitor(existing))) {
    return { visitorId: existing, created: false };
  }
  const visitorId = await createVisitorWithinIpLimit(input.ipHash);
  return visitorId ? { visitorId, created: true } : { error: 'visitor_limit' };
}
