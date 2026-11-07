import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { notebooks } from '@/modules/notebooks/schema';

export const SOURCE_KINDS = ['text', 'pdf', 'url'] as const;
export const SOURCE_STATUSES = ['processing', 'ready', 'failed'] as const;

export const sources = pgTable(
  'sources',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: SOURCE_KINDS }).notNull(),
    title: text('title').notNull(),
    status: text('status', { enum: SOURCE_STATUSES }).notNull().default('processing'),
    errorCode: text('error_code'),
    enabled: boolean('enabled').notNull().default(true),
    tokenCount: integer('token_count'),
    url: text('url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // When the status last changed: the stale sweep must not fail a fresh retry.
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sources_notebook_id_idx').on(table.notebookId, table.createdAt),
    index('sources_processing_idx')
      .on(table.statusChangedAt)
      .where(sql`${table.status} = 'processing'`),
  ],
);

export const passages = pgTable(
  'passages',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
    page: integer('page'),
  },
  (table) => [primaryKey({ columns: [table.sourceId, table.ordinal] })],
);
