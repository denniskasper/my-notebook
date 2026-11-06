import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook, deleteNotebook } from '@/modules/notebooks';
import { createVisitor } from '@/modules/visitors';
import { closeDb, db } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import {
  addTextSource,
  deleteSource,
  failStaleSources,
  getSourceWithPassages,
  listSources,
  processSource,
  retrySource,
  setSourceEnabled,
  type Source,
} from '.';

// The integration project runs with SOURCE_TOKEN_CAP=1000; the fake counts 4 characters per token.
const CAP_CHARS = 4000;

let visitor: string;
let otherVisitor: string;
let notebook: string;

beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  otherVisitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'Wärmewende')).id;
});
afterAll(closeDb);

async function add(title: string, text: string): Promise<Source> {
  const added = await addTextSource(visitor, notebook, { title, text });
  if (!added) throw new Error('Source was not added');
  return added;
}

async function addReady(title: string, text: string): Promise<Source> {
  const processed = await processSource((await add(title, text)).id);
  if (!processed) throw new Error('Source was not processed');
  return processed;
}

describe('addTextSource', () => {
  it('inserts the Source as processing, already split into Passages', async () => {
    const source = await add('  Heizungsgesetz  ', 'Erster Absatz.\n\nZweiter Absatz.');
    expect(source).toMatchObject({
      notebookId: notebook,
      kind: 'text',
      title: 'Heizungsgesetz',
      status: 'processing',
      enabled: true,
      tokenCount: null,
      errorCode: null,
    });

    const read = await getSourceWithPassages(visitor, notebook, source.id);
    expect(read?.passages).toEqual([
      { ordinal: 0, text: 'Erster Absatz.', charStart: 0, charEnd: 14, page: null },
      { ordinal: 1, text: 'Zweiter Absatz.', charStart: 16, charEnd: 31, page: null },
    ]);
  });

  it('rejects a blank title or a text without any content', async () => {
    await expect(addTextSource(visitor, notebook, { title: ' ', text: 'Text.' })).rejects.toThrow();
    await expect(
      addTextSource(visitor, notebook, { title: 'Leer', text: ' \n\n ' }),
    ).rejects.toThrow();
    expect(await listSources(visitor, notebook)).toEqual([]);
  });

  it('does not add to another Visitor’s Notebook', async () => {
    expect(
      await addTextSource(otherVisitor, notebook, { title: 'Fremd', text: 'Text.' }),
    ).toBeNull();
    expect(await listSources(visitor, notebook)).toEqual([]);
  });
});

describe('processSource', () => {
  it('sets the token count and marks the Source ready', async () => {
    const source = await addReady('Kurz', 'x'.repeat(400));
    expect(source).toMatchObject({ status: 'ready', tokenCount: 100, errorCode: null });
  });

  it('fails a Source that would push the enabled Sources over the token cap', async () => {
    await addReady('Groß', 'x'.repeat(CAP_CHARS - 400));
    const tooMuch = await addReady('Zu viel', 'y'.repeat(800));
    expect(tooMuch).toMatchObject({ status: 'failed', errorCode: 'token_cap_exceeded' });
  });

  it('only counts enabled Sources against the cap', async () => {
    const big = await addReady('Groß', 'x'.repeat(CAP_CHARS - 400));
    await setSourceEnabled(visitor, notebook, big.id, false);
    expect(await addReady('Passt', 'y'.repeat(800))).toMatchObject({ status: 'ready' });
  });
});

describe('listSources', () => {
  it('lists the Notebook’s Sources oldest first, for its owner only', async () => {
    const first = await addReady('Eins', 'Text eins.');
    const second = await addReady('Zwei', 'Text zwei.');
    expect((await listSources(visitor, notebook)).map((s) => s.id)).toEqual([first.id, second.id]);
    expect(await listSources(otherVisitor, notebook)).toEqual([]);
  });
});

describe('getSourceWithPassages', () => {
  it('is null for another Visitor or another Notebook', async () => {
    const source = await addReady('Meins', 'Text.');
    const otherNotebook = (await createNotebook(visitor, 'Anderes')).id;
    expect(await getSourceWithPassages(otherVisitor, notebook, source.id)).toBeNull();
    expect(await getSourceWithPassages(visitor, otherNotebook, source.id)).toBeNull();
  });
});

describe('setSourceEnabled', () => {
  it('disables and re-enables a Source', async () => {
    const source = await addReady('Schalter', 'Text.');
    expect(await setSourceEnabled(visitor, notebook, source.id, false)).toMatchObject({
      ok: true,
      source: { enabled: false },
    });
    expect(await setSourceEnabled(visitor, notebook, source.id, true)).toMatchObject({
      ok: true,
      source: { enabled: true },
    });
  });

  it('rejects enabling a Source that would push the Notebook over the cap', async () => {
    const big = await addReady('Groß', 'x'.repeat(CAP_CHARS - 400));
    await setSourceEnabled(visitor, notebook, big.id, false);
    await addReady('Mittel', 'y'.repeat(800));

    expect(await setSourceEnabled(visitor, notebook, big.id, true)).toEqual({
      ok: false,
      error: 'token_cap_exceeded',
    });
    expect((await getSourceWithPassages(visitor, notebook, big.id))?.source.enabled).toBe(false);
  });

  it('does not touch another Visitor’s Source', async () => {
    const source = await addReady('Meins', 'Text.');
    expect(await setSourceEnabled(otherVisitor, notebook, source.id, false)).toEqual({
      ok: false,
      error: 'source_not_found',
    });
  });
});

describe('deleteSource', () => {
  it('deletes the Source with its Passages', async () => {
    const source = await addReady('Weg', 'Eins.\n\nZwei.');
    expect(await deleteSource(otherVisitor, notebook, source.id)).toBe(false);
    expect(await deleteSource(visitor, notebook, source.id)).toBe(true);
    expect(await getSourceWithPassages(visitor, notebook, source.id)).toBeNull();
    const { rows } = await db().execute(
      sql`select count(*)::int as n from passages where source_id = ${source.id}`,
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('happens when the Notebook is deleted', async () => {
    await addReady('Weg', 'Text.');
    await deleteNotebook(visitor, notebook);
    expect(await listSources(visitor, notebook)).toEqual([]);
  });
});

describe('the stale sweep and retry', () => {
  it('fails Sources stuck in processing as interrupted, and a retry processes them again', async () => {
    const stuck = await add('Hängt', 'Text.');

    expect(await failStaleSources({ olderThan: new Date(Date.now() - 60_000) })).toBe(0);
    expect(await failStaleSources({ olderThan: new Date(Date.now() + 1_000) })).toBe(1);
    const failed = await getSourceWithPassages(visitor, notebook, stuck.id);
    expect(failed?.source).toMatchObject({ status: 'failed', errorCode: 'interrupted' });

    const retried = await retrySource(visitor, notebook, stuck.id);
    expect(retried).toMatchObject({ status: 'processing', errorCode: null });
    expect(await processSource(stuck.id)).toMatchObject({ status: 'ready', tokenCount: 2 });
  });

  it("keeps the sweep's outcome when a slow run finishes after it", async () => {
    const stuck = await add('Langsam', 'Text.');
    await failStaleSources({ olderThan: new Date(Date.now() + 1_000) });

    expect(await processSource(stuck.id)).toBeNull();
    const after = await getSourceWithPassages(visitor, notebook, stuck.id);
    expect(after?.source).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
  });

  it('skips a Source deleted before its run finishes', async () => {
    const gone = await add('Weg', 'Text.');
    await deleteSource(visitor, notebook, gone.id);
    expect(await processSource(gone.id)).toBeNull();
  });

  it('readies a disabled Source over the cap, since it adds nothing to the enabled total', async () => {
    await addReady('Groß', 'x'.repeat(CAP_CHARS - 400));
    const tooMuch = await add('Zu viel', 'y'.repeat(800));
    await setSourceEnabled(visitor, notebook, tooMuch.id, false);

    expect(await processSource(tooMuch.id)).toMatchObject({ status: 'ready', enabled: false });
    const enabling = await setSourceEnabled(visitor, notebook, tooMuch.id, true);
    expect(enabling).toEqual({ ok: false, error: 'token_cap_exceeded' });
  });

  it('only retries failed Sources of the Visitor', async () => {
    const ready = await addReady('Fertig', 'Text.');
    expect(await retrySource(visitor, notebook, ready.id)).toBeNull();

    await setSourceEnabled(visitor, notebook, ready.id, false);
    const tooMuch = await addReady('Zu viel', 'y'.repeat(CAP_CHARS + 4));
    expect(await retrySource(otherVisitor, notebook, tooMuch.id)).toBeNull();
  });
});
