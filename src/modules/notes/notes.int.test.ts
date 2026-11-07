import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { answerQuestion, failStaleMessages, listMessages, type ChatEvent } from '@/modules/chat';
import { createNotebook } from '@/modules/notebooks';
import { addTextSource, processSource } from '@/modules/sources';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import { createNote, deleteNote, listNotes, saveAnswerAsNote, updateNote } from '.';

let visitor: string;
let otherVisitor: string;
let notebook: string;

const citation = (quote: string) => ({
  sourceId: '0193a5f0-0000-7000-8000-000000000001',
  ordinals: [0, 1],
  quote,
  sourceTitle: 'Heizungsgesetz',
});

beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  otherVisitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'Wärmewende')).id;
});
afterAll(closeDb);

describe('createNote', () => {
  it('stores a Note with its Citations, pruning those the body does not reference', async () => {
    const note = await createNote(visitor, notebook, {
      title: '  Fristen  ',
      body: 'Es gelten Übergangsfristen[2].',
      citations: { '1': citation('weg'), '2': citation('Übergangsfristen') },
    });

    expect(note).toMatchObject({
      title: 'Fristen',
      body: 'Es gelten Übergangsfristen[2].',
      citations: { '2': citation('Übergangsfristen') },
    });
    expect(await listNotes(visitor, notebook)).toEqual([note]);
  });

  it('refuses another Visitor’s Notebook', async () => {
    expect(await createNote(otherVisitor, notebook, { title: 'X', body: '' })).toBeNull();
    expect(await listNotes(otherVisitor, notebook)).toEqual([]);
    expect(await listNotes(visitor, notebook)).toEqual([]);
  });
});

describe('updateNote and deleteNote', () => {
  it('saves an edit and prunes the Citations whose marker was deleted', async () => {
    const note = await createNote(visitor, notebook, {
      title: 'Fristen',
      body: 'A[1] und B[2].',
      citations: { '1': citation('a'), '2': citation('b') },
    });
    if (!note) throw new Error('Note was not created');

    const edited = await updateNote(visitor, notebook, note.id, {
      title: 'Fristen und Förderung',
      body: 'Nur noch B[2], und ein erfundenes [7].',
    });

    expect(edited).toMatchObject({
      id: note.id,
      title: 'Fristen und Förderung',
      body: 'Nur noch B[2], und ein erfundenes [7].',
      citations: { '2': citation('b') },
    });
    expect(edited?.updatedAt.getTime()).toBeGreaterThanOrEqual(note.updatedAt.getTime());
    // A marker that was pruned stays gone when it is typed back in.
    const retyped = await updateNote(visitor, notebook, note.id, { title: 'X', body: 'A[1]' });
    expect(retyped?.citations).toEqual({});
  });

  it('deletes a Note, for its owner only', async () => {
    const note = await createNote(visitor, notebook, { title: 'Weg damit', body: '' });
    if (!note) throw new Error('Note was not created');

    expect(await updateNote(otherVisitor, notebook, note.id, { title: 'X', body: '' })).toBeNull();
    expect(await deleteNote(otherVisitor, notebook, note.id)).toBe(false);
    expect(await listNotes(visitor, notebook)).toHaveLength(1);
    expect(await deleteNote(visitor, notebook, note.id)).toBe(true);
    expect(await listNotes(visitor, notebook)).toEqual([]);
  });
});

describe('saveAnswerAsNote', () => {
  async function askOnce(
    question: string,
    onEvent: (event: ChatEvent) => void | Promise<void> = () => undefined,
  ): Promise<{ sourceId: string; answerId: string }> {
    const source = await addTextSource(visitor, notebook, {
      title: 'Heizungsgesetz',
      text: 'Erster Absatz.\n\nZweiter Absatz.',
    });
    if (!source) throw new Error('Source was not added');
    await processSource(source.id);
    await answerQuestion(
      { visitorId: visitor, notebookId: notebook, question },
      { signal: new AbortController().signal, onEvent },
    );
    const answer = (await listMessages(visitor, notebook)).find((m) => m.role === 'assistant');
    if (!answer) throw new Error('No answer');
    return { sourceId: source.id, answerId: answer.id };
  }

  it('copies the answer with its Citations behind numbered markers, titled by the question', async () => {
    const { sourceId, answerId } = await askOnce('Was gilt für bestehende Heizungen?');

    const note = await saveAnswerAsNote(visitor, notebook, answerId);

    expect(note?.title).toBe('Was gilt für bestehende Heizungen?');
    expect(note?.body).toMatch(/\[1\].*\[2\]/);
    expect(note?.citations).toEqual({
      '1': { sourceId, ordinals: [0], quote: 'Erster Absatz.', sourceTitle: 'Heizungsgesetz' },
      '2': { sourceId, ordinals: [1], quote: 'Zweiter Absatz.', sourceTitle: 'Heizungsgesetz' },
    });
    expect(await listNotes(visitor, notebook)).toEqual([note]);
  });

  it('refuses a question, an unknown message and another Visitor’s answer', async () => {
    const { answerId } = await askOnce('Was gilt?');
    const question = (await listMessages(visitor, notebook))[0];

    expect(await saveAnswerAsNote(visitor, notebook, question?.id ?? '')).toBeNull();
    expect(await saveAnswerAsNote(otherVisitor, notebook, answerId)).toBeNull();
    expect(
      await saveAnswerAsNote(visitor, notebook, '0193a5f0-0000-7000-8000-00000000dead'),
    ).toBeNull();
    expect(await listNotes(visitor, notebook)).toEqual([]);
  });

  it('refuses a failed answer', async () => {
    const { answerId } = await askOnce('Was gilt?', async (event) => {
      if (event.type === 'started') {
        await failStaleMessages({ olderThan: new Date(Date.now() + 1_000) });
      }
    });

    expect(await saveAnswerAsNote(visitor, notebook, answerId)).toBeNull();
  });
});
