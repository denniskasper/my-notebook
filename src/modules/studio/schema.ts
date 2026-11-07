import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { notebooks } from '@/modules/notebooks/schema';

/** Only Briefings for now; a later Studio output only adds its kind. */
export const STUDIO_OUTPUT_KINDS = ['briefing'] as const;
export const STUDIO_OUTPUT_STATUSES = ['processing', 'complete', 'failed'] as const;

/** Studio outputs of a Notebook: one row per generation, newest last by id (uuidv7). */
export const studioOutputs = pgTable(
  'studio_outputs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: STUDIO_OUTPUT_KINDS }).notNull(),
    status: text('status', { enum: STUDIO_OUTPUT_STATUSES }).notNull(),
    // The message-parts shape (text with Citations); validated with Zod on read.
    content: jsonb('content')
      .notNull()
      .default(sql`'[]'::jsonb`),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('studio_outputs_notebook_id_idx').on(table.notebookId, table.id),
    index('studio_outputs_processing_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'processing'`),
  ],
);
