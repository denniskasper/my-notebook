import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listNotebooks } from '@/modules/notebooks';
import { getSourceWithPassages, listSources, type Source } from '@/modules/sources';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import { seedDemoNotebook } from './seed';

let demoDir: string;

beforeEach(async () => {
  await resetDatabase();
  // A copy of the committed fixtures, so a developer's own `demo/local/` stays out of the test.
  demoDir = await mkdtemp(path.join(tmpdir(), 'demo-'));
  await cp('demo/sources', path.join(demoDir, 'sources'), { recursive: true });
});
function idOf(source: Source | undefined): string {
  if (!source) throw new Error('Source missing');
  return source.id;
}

afterEach(() => rm(demoDir, { recursive: true, force: true }));
afterAll(closeDb);

describe('seedDemoNotebook', () => {
  it('creates a Visitor with a Notebook holding the ready demo text Source', async () => {
    const seeded = await seedDemoNotebook({ demoDir });

    expect(await listNotebooks(seeded.visitorId)).toEqual([
      expect.objectContaining({ id: seeded.notebookId, title: 'KI-Verordnung' }),
    ]);
    const sources = await listSources(seeded.visitorId, seeded.notebookId);
    expect(sources).toEqual([
      expect.objectContaining({
        kind: 'text',
        title: 'Meine Notizen zur KI-Verordnung',
        status: 'ready',
        enabled: true,
      }),
    ]);

    const read = await getSourceWithPassages(seeded.visitorId, seeded.notebookId, idOf(sources[0]));
    expect(read?.passages[0]?.text).toMatch(/^Ich habe mir die KI-Verordnung angesehen/);
    expect(read?.passages.map((passage) => passage.text).join('\n')).toContain(
      'Er hat drei Felder: Zweck, Risikoklasse und Kennzeichnung.',
    );
    expect(read?.passages.some((passage) => passage.text.startsWith('#'))).toBe(false);
  });

  it('seeds into an existing Visitor, next to their own Notebooks', async () => {
    const visitorId = await createVisitor({ ipHash: null });

    const first = await seedDemoNotebook({ demoDir, visitorId });
    const second = await seedDemoNotebook({ demoDir, visitorId });

    expect(first.visitorId).toBe(visitorId);
    expect((await listNotebooks(visitorId)).map((notebook) => notebook.id).sort()).toEqual(
      [first.notebookId, second.notebookId].sort(),
    );
  });

  it('adds local copies of the other Sources after the notes, titled by their first line', async () => {
    await mkdir(path.join(demoDir, 'local'));
    await writeFile(
      path.join(demoDir, 'local', 'b-wikipedia.md'),
      '# Wikipedia\n\nDie Verordnung.',
    );
    await writeFile(path.join(demoDir, 'local', 'a-ki-mig.txt'), 'KI-MIG\n\n§ 1 Zweck.');
    await writeFile(path.join(demoDir, 'local', 'README'), 'not a Source');

    const seeded = await seedDemoNotebook({ demoDir });

    const sources = await listSources(seeded.visitorId, seeded.notebookId);
    expect(sources.map((source) => [source.title, source.status])).toEqual([
      ['Meine Notizen zur KI-Verordnung', 'ready'],
      ['KI-MIG', 'ready'],
      ['Wikipedia', 'ready'],
    ]);
    const kiMig = await getSourceWithPassages(
      seeded.visitorId,
      seeded.notebookId,
      idOf(sources[1]),
    );
    expect(kiMig?.passages.map((passage) => passage.text)).toEqual(['§ 1 Zweck.']);
  });
});
