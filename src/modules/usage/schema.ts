import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { notebooks } from '@/modules/notebooks/schema';
import { visitors } from '@/modules/visitors/schema';

export const USAGE_FEATURES = ['chat', 'agent', 'studio', 'ingest'] as const;

/** Append-only: one row per LLM call. Deletes and purges never erase spend (SET NULL). */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    visitorId: uuid('visitor_id').references(() => visitors.id, { onDelete: 'set null' }),
    notebookId: uuid('notebook_id').references(() => notebooks.id, { onDelete: 'set null' }),
    feature: text('feature', { enum: USAGE_FEATURES }).notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cacheReadTokens: integer('cache_read_tokens').notNull(),
    cacheWriteTokens: integer('cache_write_tokens').notNull(),
    costMicroUsd: integer('cost_micro_usd').notNull(),
  },
  (table) => [
    index('usage_events_at_idx').on(table.at),
    index('usage_events_visitor_id_idx').on(table.visitorId, table.at),
  ],
);

export const GUARDED_FEATURES = ['chat', 'agent', 'studio'] as const;

/**
 * Calls in flight: each holds an estimate of its cost against the caps until
 * it records its real cost, so concurrent calls can't all pass the same check.
 * A hold whose call died is ignored once it expires.
 */
export const usageReservations = pgTable(
  'usage_reservations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    feature: text('feature', { enum: GUARDED_FEATURES }).notNull(),
    costMicroUsd: integer('cost_micro_usd').notNull(),
  },
  (table) => [index('usage_reservations_expires_at_idx').on(table.expiresAt)],
);
