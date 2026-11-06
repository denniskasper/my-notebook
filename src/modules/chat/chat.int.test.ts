import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook } from '@/modules/notebooks';
import { addTextSource, deleteSource, processSource, setSourceEnabled } from '@/modules/sources';
import { spendSince } from '@/modules/usage';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { resetDatabase } from '@/test/database';

import { askQuestion, clearChat, failStaleMessages, listMessages, type ChatEvent } from '.';

let visitor: string;
let otherVisitor: string;
let notebook: string;
const start = new Date(Date.now() - 1_000);

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

async function ask(
  question: string,
  options: {
    visitorId?: string;
    signal?: AbortSignal;
    onEvent?: (event: ChatEvent) => void | Promise<void>;
  } = {},
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  await askQuestion(
    { visitorId: options.visitorId ?? visitor, notebookId: notebook, question },
    {
      signal: options.signal ?? new AbortController().signal,
      onEvent: async (event) => {
        events.push(event);
        await options.onEvent?.(event);
      },
    },
  );
  return events;
}

const answerText = (events: ChatEvent[]) =>
  events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('');

describe('askQuestion', () => {
  it('streams an answer whose Citations snapshot the cited Source and Passages', async () => {
    const sourceId = await addReady('Heizungsgesetz', 'Erster Absatz.\n\nZweiter Absatz.');

    const events = await ask('  Was gilt ab 2024?  ');

    expect(events[0]).toMatchObject({ type: 'started' });
    expect(events.at(-1)).toEqual({ type: 'done', status: 'complete' });
    const citations = events.flatMap((e) => (e.type === 'citation' ? [e.citation] : []));
    expect(citations).toEqual([
      { sourceId, ordinals: [0], quote: 'Erster Absatz.', sourceTitle: 'Heizungsgesetz' },
      { sourceId, ordinals: [1], quote: 'Zweiter Absatz.', sourceTitle: 'Heizungsgesetz' },
    ]);
    expect(answerText(events)).toContain('Heizungsgesetz');
  });

  it('stores the question and the complete answer with its Citations', async () => {
    const sourceId = await addReady('Heizungsgesetz', 'Erster Absatz.\n\nZweiter Absatz.');
    const events = await ask('Was gilt?');

    const messages = await listMessages(visitor, notebook);
    expect(messages).toHaveLength(2);
    const [question, answer] = messages;
    expect(question).toMatchObject({
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Was gilt?', citations: [] }],
    });
    expect(answer).toMatchObject({ role: 'assistant', status: 'complete', errorCode: null });
    expect(answer?.parts.map((p) => p.text).join('')).toBe(answerText(events));
    expect(answer?.parts.flatMap((p) => p.citations)).toMatchObject([
      { sourceId, ordinals: [0] },
      { sourceId, ordinals: [1] },
    ]);
    expect(events[0]).toEqual({
      type: 'started',
      userMessageId: question?.id,
      assistantMessageId: answer?.id,
    });
  });

  it('grounds answers in enabled Sources only', async () => {
    const off = await addReady('Aus', 'Abgeschaltet.');
    const on = await addReady('An', 'Eingeschaltet.');
    await setSourceEnabled(visitor, notebook, off, false);

    const events = await ask('Was steht drin?');
    const cited = events.flatMap((e) => (e.type === 'citation' ? [e.citation.sourceId] : []));
    expect(new Set(cited)).toEqual(new Set([on]));
  });

  it('records the call in the usage ledger', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    await ask('Was gilt?');
    expect(await spendSince({ since: start, visitorId: visitor })).toBeGreaterThan(0);
  });

  it('keeps the partial answer as stopped when the Visitor stops it, and still charges it', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.\n\nZweiter Absatz.');
    const controller = new AbortController();

    const events = await ask('Was gilt?', {
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === 'text') controller.abort();
      },
    });

    expect(events.at(-1)).toEqual({ type: 'done', status: 'stopped' });
    const answer = (await listMessages(visitor, notebook))[1];
    expect(answer?.status).toBe('stopped');
    expect(answer?.parts.map((p) => p.text).join('')).toBe(answerText(events));
    expect(answerText(events).length).toBeGreaterThan(0);
    expect(await spendSince({ since: start, visitorId: visitor })).toBeGreaterThan(0);
  });

  it('keeps a Citation snapshot after its Source is deleted', async () => {
    const sourceId = await addReady('Vergänglich', 'Ein Absatz.');
    await ask('Was steht drin?');
    await deleteSource(visitor, notebook, sourceId);

    const answer = (await listMessages(visitor, notebook))[1];
    expect(answer?.parts.flatMap((p) => p.citations)).toEqual([
      { sourceId, ordinals: [0], quote: 'Ein Absatz.', sourceTitle: 'Vergänglich' },
    ]);
  });

  it('refuses a question without enabled Sources, a blank one, or another Visitor’s', async () => {
    expect(await ask('Was gilt?')).toEqual([{ type: 'error', error: 'no_active_sources' }]);
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    expect(await ask('   ')).toEqual([{ type: 'error', error: 'invalid_question' }]);
    expect(await ask('Was gilt?', { visitorId: otherVisitor })).toEqual([
      { type: 'error', error: 'not_found' },
    ]);
    expect(await listMessages(visitor, notebook)).toEqual([]);
  });

  it('refuses a second question while an answer is still streaming', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    const controller = new AbortController();
    let second: ChatEvent[] = [];

    await ask('Erste Frage', {
      signal: controller.signal,
      onEvent: async (event) => {
        if (event.type !== 'started') return;
        second = await ask('Zweite Frage');
        controller.abort();
      },
    });

    expect(second).toEqual([{ type: 'error', error: 'chat_busy' }]);
  });
});

describe('listMessages and clearChat', () => {
  it('clears the Notebook’s conversation, for its owner only', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    await ask('Was gilt?');
    expect(await listMessages(otherVisitor, notebook)).toEqual([]);

    expect(await clearChat(otherVisitor, notebook)).toBe(false);
    expect(await listMessages(visitor, notebook)).toHaveLength(2);
    expect(await clearChat(visitor, notebook)).toBe(true);
    expect(await listMessages(visitor, notebook)).toEqual([]);
  });
});

describe('the stale sweep', () => {
  it('fails an answer left streaming as interrupted, and a late finish does not overwrite it', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    let swept = -1;

    await ask('Was gilt?', {
      onEvent: async (event) => {
        if (event.type === 'started') {
          expect(await failStaleMessages({ olderThan: new Date(Date.now() - 60_000) })).toBe(0);
          swept = await failStaleMessages({ olderThan: new Date(Date.now() + 1_000) });
        }
      },
    });

    expect(swept).toBe(1);
    const answer = (await listMessages(visitor, notebook))[1];
    expect(answer).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
  });
});
