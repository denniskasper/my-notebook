import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/platform/db';

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

/**
 * The Visitor behind a cookie value for a mutation: the existing one (touched),
 * or a new one when the cookie is missing, malformed or points to a deleted Visitor.
 */
export async function resolveVisitor(input: {
  cookieValue: string | undefined;
  ipHash: string | null;
}): Promise<{ visitorId: string; created: boolean }> {
  const existing = parseVisitorId(input.cookieValue);
  if (existing && (await touchVisitor(existing))) {
    return { visitorId: existing, created: false };
  }
  return { visitorId: await createVisitor({ ipHash: input.ipHash }), created: true };
}
