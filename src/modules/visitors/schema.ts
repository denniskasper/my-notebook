import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const visitors = pgTable('visitors', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  // HMAC of the IP that created the Visitor; never the IP itself.
  createdIpHash: text('created_ip_hash'),
});
