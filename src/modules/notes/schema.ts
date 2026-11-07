import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { notebooks } from '@/modules/notebooks/schema';

/** Markdown Notes; `[n]` markers in the body point into `citations` (marker → Citation snapshot). */
export const notes = pgTable(
  'notes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    // Validated with Zod on read (see markers.ts).
    citations: jsonb('citations')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notes_notebook_id_idx').on(table.notebookId, table.updatedAt)],
);
