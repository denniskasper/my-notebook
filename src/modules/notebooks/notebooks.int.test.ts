import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createVisitor } from '@/modules/visitors';
import { closeDb, db } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import { createNotebook, deleteNotebook, getNotebook, listNotebooks, renameNotebook } from '.';

let visitor: string;
let otherVisitor: string;

beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  otherVisitor = await createVisitor({ ipHash: null });
});
afterAll(closeDb);

describe('createNotebook', () => {
  it('creates a Notebook owned by the Visitor with a normalised title', async () => {
    const notebook = await createNotebook(visitor, '  Wärmewende  ');
    expect(notebook).toMatchObject({ visitorId: visitor, title: 'Wärmewende' });
    expect(notebook.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('rejects an empty title', async () => {
    await expect(createNotebook(visitor, '  ')).rejects.toThrow();
  });
});

describe('listNotebooks', () => {
  it('lists only the Visitor’s Notebooks, most recently changed first', async () => {
    const first = await createNotebook(visitor, 'Erstes');
    const second = await createNotebook(visitor, 'Zweites');
    await createNotebook(otherVisitor, 'Fremd');
    expect((await listNotebooks(visitor)).map((n) => n.id)).toEqual([second.id, first.id]);

    await renameNotebook(visitor, first.id, 'Erstes, umbenannt');
    expect((await listNotebooks(visitor)).map((n) => n.id)).toEqual([first.id, second.id]);
  });

  it('is empty for a new Visitor', async () => {
    expect(await listNotebooks(visitor)).toEqual([]);
  });
});

describe('getNotebook', () => {
  it('finds the Visitor’s own Notebook only', async () => {
    const notebook = await createNotebook(visitor, 'Meins');
    expect(await getNotebook(visitor, notebook.id)).toMatchObject({ title: 'Meins' });
    expect(await getNotebook(otherVisitor, notebook.id)).toBeNull();
  });
});

describe('renameNotebook', () => {
  it('renames and bumps updated_at', async () => {
    const notebook = await createNotebook(visitor, 'Alt');
    const renamed = await renameNotebook(visitor, notebook.id, 'Neu');
    expect(renamed?.title).toBe('Neu');
    expect(renamed?.updatedAt.getTime()).toBeGreaterThanOrEqual(notebook.updatedAt.getTime());
  });

  it('does not touch another Visitor’s Notebook', async () => {
    const notebook = await createNotebook(visitor, 'Meins');
    expect(await renameNotebook(otherVisitor, notebook.id, 'Gekapert')).toBeNull();
    expect((await getNotebook(visitor, notebook.id))?.title).toBe('Meins');
  });
});

describe('deleteNotebook', () => {
  it('deletes the Visitor’s Notebook', async () => {
    const notebook = await createNotebook(visitor, 'Weg damit');
    expect(await deleteNotebook(visitor, notebook.id)).toBe(true);
    expect(await getNotebook(visitor, notebook.id)).toBeNull();
    expect(await deleteNotebook(visitor, notebook.id)).toBe(false);
  });

  it('does not delete another Visitor’s Notebook', async () => {
    const notebook = await createNotebook(visitor, 'Meins');
    expect(await deleteNotebook(otherVisitor, notebook.id)).toBe(false);
    expect(await getNotebook(visitor, notebook.id)).not.toBeNull();
  });
});

describe('deleting a Visitor', () => {
  it('cascades to their Notebooks', async () => {
    await createNotebook(visitor, 'Meins');
    await db().execute(sql`delete from visitors where id = ${visitor}`);
    expect(await listNotebooks(visitor)).toEqual([]);
  });
});
