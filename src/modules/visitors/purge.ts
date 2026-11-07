import { lt } from 'drizzle-orm';

import { db } from '@/platform/db';
import { logger } from '@/platform/logging';

import { visitors } from './schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A Visitor not seen for this long is purged with everything they own. */
export const VISITOR_INACTIVE_AFTER_MS = 30 * DAY_MS;
const PURGE_EVERY_MS = DAY_MS;

/**
 * Deletes Visitors last seen more than 30 days before `now`. Their Notebooks
 * and everything in them cascade; `usage_events` keep their rows (`SET NULL`),
 * so the Demo budget still counts what they spent. Returns how many were purged.
 */
export async function purgeInactiveVisitors(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - VISITOR_INACTIVE_AFTER_MS);
  const purged = await db()
    .delete(visitors)
    .where(lt(visitors.lastSeenAt, cutoff))
    .returning({ id: visitors.id });
  return purged.length;
}

/**
 * Purges at boot and then daily, in-process. Every instance runs it; the
 * delete is idempotent, so two instances during a deploy do no harm.
 */
export function startVisitorPurge(): void {
  const purge = async () => {
    try {
      const purged = await purgeInactiveVisitors();
      if (purged > 0) logger().info({ event: 'visitor.purge', purged }, 'inactive Visitors purged');
    } catch (error) {
      logger().error({ event: 'visitor.purge_failed', err: error });
    }
  };
  void purge();
  setInterval(purge, PURGE_EVERY_MS).unref();
}
