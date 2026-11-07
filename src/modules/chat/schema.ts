import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { notebooks } from '@/modules/notebooks/schema';

export const MESSAGE_ROLES = ['user', 'assistant'] as const;
export const MESSAGE_MODES = ['chat', 'agent'] as const;
export const MESSAGE_STATUSES = ['streaming', 'complete', 'failed', 'stopped'] as const;

/** One conversation per Notebook: its messages, oldest first by id (uuidv7). */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    role: text('role', { enum: MESSAGE_ROLES }).notNull(),
    mode: text('mode', { enum: MESSAGE_MODES }).notNull().default('chat'),
    // Validated with Zod on read (see parts.ts).
    parts: jsonb('parts')
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status', { enum: MESSAGE_STATUSES }).notNull(),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('messages_notebook_id_idx').on(table.notebookId, table.id),
    index('messages_streaming_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'streaming'`),
  ],
);
