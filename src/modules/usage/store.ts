import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/platform/db';

import { costMicroUsd, type TokenUsage } from './price';
import { usageEvents, type USAGE_FEATURES } from './schema';

export type UsageFeature = (typeof USAGE_FEATURES)[number];
export type UsageEvent = typeof usageEvents.$inferSelect;

/** Records one LLM call and what it cost. */
export async function recordUsage(
  input: {
    visitorId: string | null;
    notebookId: string | null;
    feature: UsageFeature;
    model: string;
  } & TokenUsage,
): Promise<UsageEvent> {
  const [row] = await db()
    .insert(usageEvents)
    .values({ ...input, costMicroUsd: costMicroUsd(input.model, input) })
    .returning();
  if (!row) throw new Error('Usage insert returned no row');
  return row;
}

/** Micro-dollars spent since `since`, by everyone or by one Visitor. */
export async function spendSince(input: { since: Date; visitorId?: string }): Promise<number> {
  const [row] = await db()
    .select({ total: sql<string | null>`sum(${usageEvents.costMicroUsd})` })
    .from(usageEvents)
    .where(
      and(
        gte(usageEvents.at, input.since),
        input.visitorId === undefined ? undefined : eq(usageEvents.visitorId, input.visitorId),
      ),
    );
  return Number(row?.total ?? 0);
}
