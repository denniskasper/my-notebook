import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { listMessages, messageText } from '@/modules/chat';
import { createNotebook } from '@/modules/notebooks';
import { listNotes } from '@/modules/notes';
import { addTextSource, processSource } from '@/modules/sources';
import { recordUsage, spendSince, withAgentSlot } from '@/modules/usage';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { MODELS } from '@/platform/llm';
import { resetDatabase } from '@/test/database';

import { runAgentTask, type AgentEvent } from '.';

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

async function run(
  task: string,
  options: {
    visitorId?: string;
    signal?: AbortSignal;
    onEvent?: (event: AgentEvent) => void;
    limits?: Parameters<typeof runAgentTask>[1]['limits'];
  } = {},
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  await runAgentTask(
    { visitorId: options.visitorId ?? visitor, notebookId: notebook, task },
    {
      signal: options.signal ?? new AbortController().signal,
      onEvent: (event) => {
        events.push(event);
        options.onEvent?.(event);
      },
      limits: options.limits,
    },
  );
  return events;
}

const text = (events: AgentEvent[]) =>
  events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('');

describe('runAgentTask', () => {
  it('runs the Steps live, writes the Note and answers with validated Citations', async () => {
    const a = await addReady('Quelle A', 'A beginnt.\n\nA ergänzt.');
    const b = await addReady('Quelle B', 'B beginnt.');

    const events = await run('Vergleiche Quelle A und B und schreib die Widersprüche als Notiz.');

    expect(events[0]).toMatchObject({ type: 'started' });
    expect(events.at(-1)).toEqual({ type: 'done', status: 'complete' });
    const finished = events
      .flatMap((e) => (e.type === 'step' && e.step.status !== 'running' ? [e.step] : []))
      .map(({ tool, argument, status }) => ({ tool, argument, status }));
    expect(finished).toEqual([
      { tool: 'list_sources', argument: null, status: 'done' },
      { tool: 'read_source', argument: 'Quelle A', status: 'done' },
      { tool: 'read_source', argument: 'Quelle B', status: 'done' },
      { tool: 'create_note', argument: 'Vergleich der Quellen', status: 'done' },
    ]);
    const [note] = await listNotes(visitor, notebook);
    expect(events).toContainEqual({ type: 'note_created', noteId: note?.id });

    // The invented marker is dropped; no marker reaches the Visitor.
    const citations = events.flatMap((e) => (e.type === 'citation' ? [e.citation] : []));
    expect(citations.map(({ sourceId, ordinals }) => ({ sourceId, ordinals }))).toEqual([
      { sourceId: a, ordinals: [0] },
      { sourceId: a, ordinals: [1] },
      { sourceId: b, ordinals: [0] },
    ]);
    expect(text(events)).not.toContain('[[');
  });

  it('stores the run as an Agent exchange whose Steps and Citations replay after a reload', async () => {
    await addReady('Quelle A', 'A beginnt.');
    const events = await run('Was steht drin?');

    const [question, answer] = await listMessages(visitor, notebook);
    expect(question).toMatchObject({ role: 'user', mode: 'agent' });
    expect(answer).toMatchObject({ role: 'assistant', mode: 'agent', status: 'complete' });
    expect(answer?.parts.filter((p) => p.type === 'step')).toHaveLength(2);
    expect(messageText(answer?.parts ?? [])).toBe(text(events));
    expect(answer?.parts.flatMap((p) => (p.type === 'text' ? p.citations : []))).toHaveLength(1);
    expect(await spendSince({ since: start, visitorId: visitor })).toBeGreaterThan(0);
  });

  it('keeps the partial run as stopped when the Visitor stops it, and still charges it', async () => {
    await addReady('Quelle A', 'A beginnt.');
    const controller = new AbortController();

    const events = await run('Vergleiche alles.', {
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === 'step' && event.step.tool === 'read_source') controller.abort();
      },
    });

    expect(events.at(-1)).toEqual({ type: 'done', status: 'stopped' });
    const answer = (await listMessages(visitor, notebook))[1];
    expect(answer?.status).toBe('stopped');
    expect(answer?.errorCode).toBeNull();
    expect(answer?.parts.find((p) => p.type === 'step')).toMatchObject({
      tool: 'list_sources',
      status: 'done',
    });
    expect(await spendSince({ since: start, visitorId: visitor })).toBeGreaterThan(0);
  });

  it('ends a run that hits a cap like Stop, with the cap as its reason', async () => {
    await addReady('Quelle A', 'A beginnt.');

    expect((await run('Los.', { limits: { maxTurns: 1 } })).at(-1)).toEqual({
      type: 'done',
      status: 'stopped',
      reason: 'agent_max_turns',
    });
    expect((await listMessages(visitor, notebook))[1]?.errorCode).toBe('agent_max_turns');

    expect((await run('Los.', { limits: { timeoutMs: 1 } })).at(-1)).toEqual({
      type: 'done',
      status: 'stopped',
      reason: 'agent_timeout',
    });
  });

  it('gives the Agent the last turns of the conversation as text', async () => {
    await addReady('Quelle A', 'A beginnt.');
    await run('Halte das als Notiz fest.');
    // The fake writes a Note when its prompt mentions one: here only the earlier turn does.
    await run('Und noch einmal, bitte.');
    expect(await listNotes(visitor, notebook)).toHaveLength(2);
  });

  it('refuses a blank task, another Visitor’s Notebook and a refused Budget guard, storing nothing', async () => {
    expect(await run('   ')).toEqual([{ type: 'error', error: 'invalid_task' }]);
    expect(await run('Los.', { visitorId: otherVisitor })).toEqual([
      { type: 'error', error: 'not_found' },
    ]);
    await recordUsage({
      visitorId: visitor,
      notebookId: notebook,
      feature: 'agent',
      model: MODELS.agent,
      inputTokens: 10_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(await run('Los.')).toMatchObject([{ type: 'error', error: 'daily_allowance' }]);
    expect(await listMessages(visitor, notebook)).toEqual([]);
  });

  it('refuses when every Agent slot is taken', async () => {
    const events = await withAgentSlot(() => withAgentSlot(() => run('Los.')));
    expect(events).toEqual({
      ok: true,
      value: { ok: true, value: [{ type: 'error', error: 'agent_busy' }] },
    });
    expect(await listMessages(visitor, notebook)).toEqual([]);
  });
});
