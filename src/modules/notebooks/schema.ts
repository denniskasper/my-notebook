import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { visitors } from '@/modules/visitors/schema';

export const notebooks = pgTable(
  'notebooks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notebooks_visitor_id_idx').on(table.visitorId, table.updatedAt)],
);
