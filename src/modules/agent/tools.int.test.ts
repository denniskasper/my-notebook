import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook } from '@/modules/notebooks';
import { listNotes } from '@/modules/notes';
import { addTextSource, processSource, setSourceEnabled } from '@/modules/sources';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import type { AgentTool } from '@/platform/llm';
import { resetDatabase } from '@/test/database';

import { createNotebookTools, type StepUpdate } from '.';

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

async function addReady(title: string, text: string): Promise<string> {
  const source = await addTextSource(visitor, notebook, { title, text });
  if (!source) throw new Error('Source was not added');
  await processSource(source.id);
  return source.id;
}

function toolbox(options: Parameters<typeof createNotebookTools>[1] = {}, visitorId = visitor) {
  const steps: StepUpdate[] = [];
  const box = createNotebookTools(
    { visitorId, notebookId: notebook },
    { ...options, onStep: (step) => steps.push(step) },
  );
  const call = async (name: string, input: unknown) => {
    const tool: AgentTool | undefined = box.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    const result = await tool.run(input);
    return { ...result, json: result.isError ? null : (JSON.parse(result.text) as unknown) };
  };
  return { ...box, steps, call };
}

describe('list_sources', () => {
  it('lists the enabled Sources with id, title, kind, status and length', async () => {
    const on = await addReady('Heizungsgesetz', 'Erster Absatz.\n\nZweiter Absatz.');
    const off = await addReady('Abgeschaltet', 'Nicht verwenden.');
    await setSourceEnabled(visitor, notebook, off, false);

    const { call, steps } = toolbox();
    const result = await call('list_sources', {});

    expect(result.json).toEqual({
      sources: [
        {
          id: on,
          title: 'Heizungsgesetz',
          kind: 'text',
          status: 'ready',
          passages: 2,
          tokens: expect.any(Number),
        },
      ],
    });
    expect(steps.map(({ tool, status }) => ({ tool, status }))).toEqual([
      { tool: 'list_sources', status: 'running' },
      { tool: 'list_sources', status: 'done' },
    ]);
  });

  it('sees nothing in another Visitor’s Notebook', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    const { call } = toolbox({}, otherVisitor);
    expect((await call('list_sources', {})).json).toEqual({ sources: [] });
  });
});

describe('read_source', () => {
  it('returns the Passages with ids that later resolve to Citations', async () => {
    const sourceId = await addReady('Heizungsgesetz', 'Erster Absatz.\n\nZweiter Absatz.');
    const { call, passage, steps } = toolbox();

    const result = await call('read_source', { sourceId });

    expect(result.json).toEqual({
      sourceId,
      title: 'Heizungsgesetz',
      passages: [
        { id: 'q1-0', text: 'Erster Absatz.' },
        { id: 'q1-1', text: 'Zweiter Absatz.' },
      ],
      range: { from: 0, to: 1, total: 2 },
      nextPassage: null,
    });
    expect(passage('q1-1')).toEqual({
      sourceId,
      sourceTitle: 'Heizungsgesetz',
      ordinal: 1,
      text: 'Zweiter Absatz.',
    });
    expect(steps.at(-1)).toMatchObject({
      tool: 'read_source',
      argument: 'Heizungsgesetz',
      status: 'done',
    });
  });

  it('truncates a long Source with a hint where to continue, and reads a range', async () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Absatz ${i} ${'x'.repeat(40)}.`);
    const sourceId = await addReady('Lang', paragraphs.join('\n\n'));
    const { call, passage } = toolbox({ readMaxChars: 120 });

    const first = await call('read_source', { sourceId });
    expect(first.json).toMatchObject({
      passages: [{ id: 'q1-0' }, { id: 'q1-1' }],
      range: { from: 0, to: 1, total: 6 },
      nextPassage: 2,
      hint: expect.stringContaining('fromPassage: 2'),
    });

    const range = await call('read_source', { sourceId, fromPassage: 4, toPassage: 4 });
    expect(range.json).toMatchObject({ passages: [{ id: 'q1-4' }], nextPassage: null });
    expect(passage('q1-3')).toBeUndefined();
  });

  it('numbers each Source it reads in turn', async () => {
    const a = await addReady('A', 'Absatz A.');
    const b = await addReady('B', 'Absatz B.');
    const { call } = toolbox();
    await call('read_source', { sourceId: b });
    await call('read_source', { sourceId: a });
    expect((await call('read_source', { sourceId: b })).json).toMatchObject({
      passages: [{ id: 'q1-0' }],
    });
    expect((await call('read_source', { sourceId: a })).json).toMatchObject({
      passages: [{ id: 'q2-0' }],
    });
  });

  it('refuses a disabled Source, an unknown one and invalid input as errors the Agent sees', async () => {
    const off = await addReady('Aus', 'Abgeschaltet.');
    await setSourceEnabled(visitor, notebook, off, false);
    const { call, steps } = toolbox();

    expect(await call('read_source', { sourceId: off })).toMatchObject({ isError: true });
    expect(
      await call('read_source', { sourceId: '0190a8c0-0000-7000-8000-000000000000' }),
    ).toMatchObject({ isError: true });
    expect(await call('read_source', { sourceId: 'nope' })).toMatchObject({ isError: true });
    expect(steps.filter((s) => s.status === 'failed')).toHaveLength(3);
  });
});

describe('create_note', () => {
  it('writes a Note whose valid Passage markers become Citations', async () => {
    const sourceId = await addReady('Heizungsgesetz', 'Erster Absatz.\n\nZweiter Absatz.');
    const created: string[] = [];
    const { call, steps } = toolbox({ onNoteCreated: (id) => created.push(id) });
    await call('read_source', { sourceId });

    const result = await call('create_note', {
      title: 'Vergleich',
      body: '- Erstens [[p:q1-0]]\n- Erfunden [[p:q7-1]]\n- Zweitens [[p:q1-1]]',
    });

    expect(result.isError).toBeFalsy();
    const [note] = await listNotes(visitor, notebook);
    expect(note).toMatchObject({
      title: 'Vergleich',
      body: '- Erstens[1]\n- Erfunden\n- Zweitens[2]',
      citations: {
        '1': { sourceId, ordinals: [0], quote: 'Erster Absatz.', sourceTitle: 'Heizungsgesetz' },
        '2': { sourceId, ordinals: [1], quote: 'Zweiter Absatz.', sourceTitle: 'Heizungsgesetz' },
      },
    });
    expect(created).toEqual([note?.id]);
    expect(steps.at(-1)).toMatchObject({
      tool: 'create_note',
      argument: 'Vergleich',
      status: 'done',
    });
  });

  it('writes at most two Notes per run', async () => {
    const { call } = toolbox();
    expect((await call('create_note', { title: 'Eins', body: 'a' })).isError).toBeFalsy();
    expect((await call('create_note', { title: 'Zwei', body: 'b' })).isError).toBeFalsy();
    expect(await call('create_note', { title: 'Drei', body: 'c' })).toMatchObject({
      isError: true,
      text: expect.stringContaining('2'),
    });
    expect(await listNotes(visitor, notebook)).toHaveLength(2);
  });

  it('refuses an empty title', async () => {
    const { call } = toolbox();
    expect(await call('create_note', { title: '  ', body: 'a' })).toMatchObject({ isError: true });
  });
});
