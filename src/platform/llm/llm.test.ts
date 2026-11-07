import { describe, expect, it } from 'vitest';

import { createFakeLlm } from './fake';
import type {
  AgentRequest,
  AgentStreamEvent,
  AgentTool,
  ChatRequest,
  ChatStreamEvent,
} from './types';

describe('fake llm', () => {
  it('counts tokens deterministically, about four characters per token', async () => {
    const llm = createFakeLlm();
    expect(await llm.countTokens('')).toBe(0);
    expect(await llm.countTokens('abcd')).toBe(1);
    expect(await llm.countTokens('abcde')).toBe(2);
    expect(await llm.countTokens('x'.repeat(4000))).toBe(1000);
  });
});

const request: ChatRequest = {
  system: 'Antworte nur aus den Quellen.',
  documents: [
    { title: 'Heizungsgesetz', blocks: ['Erster Absatz.', 'Zweiter Absatz.', 'Dritter.'] },
    { title: 'Förderung', blocks: ['Zuschuss bis 70 Prozent.'] },
  ],
  turns: [{ role: 'user', text: 'Was gilt?' }],
};

async function collect(stream: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('fake llm streamChat', () => {
  it('streams a scripted answer whose Citations point at document blocks', async () => {
    const llm = createFakeLlm({ delayMs: 0 });
    const events = await collect(llm.streamChat(request, { signal: new AbortController().signal }));

    expect(events[0]).toMatchObject({ type: 'started' });
    expect(events.at(-1)).toMatchObject({ type: 'finished', stopReason: 'end_turn' });
    const citations = events.flatMap((e) => (e.type === 'citation' ? [e.citation] : []));
    expect(citations).toEqual([
      { documentIndex: 0, startBlockIndex: 0, endBlockIndex: 1, citedText: 'Erster Absatz.' },
      { documentIndex: 0, startBlockIndex: 1, endBlockIndex: 2, citedText: 'Zweiter Absatz.' },
      {
        documentIndex: 1,
        startBlockIndex: 0,
        endBlockIndex: 1,
        citedText: 'Zuschuss bis 70 Prozent.',
      },
    ]);
    const text = events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('');
    expect(text.length).toBeGreaterThan(20);
  });

  it('reports usage from the characters it read and wrote', async () => {
    const llm = createFakeLlm({ delayMs: 0 });
    const events = await collect(llm.streamChat(request, { signal: new AbortController().signal }));
    const finished = events.at(-1);
    if (finished?.type !== 'finished') throw new Error('not finished');
    expect(finished.usage.inputTokens).toBeGreaterThan(0);
    expect(finished.usage.outputTokens).toBeGreaterThan(0);
  });

  it('says the Sources do not cover a question when there are no documents', async () => {
    const llm = createFakeLlm({ delayMs: 0 });
    const events = await collect(
      llm.streamChat({ ...request, documents: [] }, { signal: new AbortController().signal }),
    );
    expect(events.some((e) => e.type === 'citation')).toBe(false);
  });

  it('throws once the signal is aborted', async () => {
    const llm = createFakeLlm({ delayMs: 0 });
    const controller = new AbortController();
    const seen: ChatStreamEvent[] = [];
    await expect(async () => {
      for await (const event of llm.streamChat(request, { signal: controller.signal })) {
        seen.push(event);
        if (event.type === 'text') controller.abort();
      }
    }).rejects.toThrow();
    expect(seen.some((e) => e.type === 'finished')).toBe(false);
  });
});

describe('fake llm streamBriefing', () => {
  it('streams a structured Briefing on the Studio model whose Citations point at document blocks', async () => {
    const llm = createFakeLlm({ delayMs: 0 });
    const events = await collect(
      llm.streamBriefing(request, { signal: new AbortController().signal }),
    );

    expect(events[0]).toMatchObject({ type: 'started', usage: { model: 'claude-sonnet-5-5' } });
    expect(events.at(-1)).toMatchObject({
      type: 'finished',
      stopReason: 'end_turn',
      usage: { model: 'claude-sonnet-5-5' },
    });
    const text = events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('');
    expect(text).toMatch(/^## Überblick\n/);
    expect(text).toContain('\n## Kernpunkte\n- ');
    const citations = events.flatMap((e) => (e.type === 'citation' ? [e.citation] : []));
    expect(citations).toContainEqual({
      documentIndex: 1,
      startBlockIndex: 0,
      endBlockIndex: 1,
      citedText: 'Zuschuss bis 70 Prozent.',
    });
  });
});

describe('fake llm runAgent', () => {
  type Call = { name: string; input: unknown };

  function notebookTools(calls: Call[]): AgentTool[] {
    const tool = (name: string, result: unknown): AgentTool => ({
      name,
      description: name,
      input: {},
      async run(input) {
        calls.push({ name, input });
        return { text: JSON.stringify(result) };
      },
    });
    return [
      tool('list_sources', {
        sources: [
          { id: 'src-a', title: 'Quelle A' },
          { id: 'src-b', title: 'Quelle B' },
        ],
      }),
      tool('read_source', { passages: [{ id: 'q1-0', text: 'Erster.' }] }),
      tool('create_note', { noteId: 'n1' }),
    ];
  }

  const agentRequest = (tools: AgentTool[], prompt: string, maxTurns = 15): AgentRequest => ({
    system: 'Arbeite mit den Quellen.',
    prompt,
    tools,
    maxTurns,
    maxBudgetUsd: 0.3,
  });

  async function run(request: AgentRequest, signal = new AbortController().signal) {
    const events: AgentStreamEvent[] = [];
    for await (const event of createFakeLlm({ delayMs: 0 }).runAgent(request, { signal })) {
      events.push(event);
    }
    return events;
  }

  it('lists the Sources, reads them and writes a Note when the task asks for one', async () => {
    const calls: Call[] = [];
    const events = await run(agentRequest(notebookTools(calls), 'Vergleiche A und B als Notiz.'));

    expect(calls.map((call) => call.name)).toEqual([
      'list_sources',
      'read_source',
      'read_source',
      'create_note',
    ]);
    expect(calls[1]?.input).toEqual({ sourceId: 'src-a' });
    expect(calls[2]?.input).toEqual({ sourceId: 'src-b' });
    const text = events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('');
    expect(text).toContain('[[p:q1-0]]');
    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'complete' });
    const finished = events.at(-1);
    expect(finished?.type === 'finished' && finished.costUsd).toBeGreaterThan(0);
  });

  it('writes no Note unless asked, and stops at maxTurns', async () => {
    const calls: Call[] = [];
    const events = await run(agentRequest(notebookTools(calls), 'Was steht drin?', 2));
    expect(calls.map((call) => call.name)).toEqual(['list_sources', 'read_source']);
    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'max_turns' });
  });

  it('throws once the signal is aborted', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const tools = notebookTools(calls).map((tool) => ({
      ...tool,
      run: async (input: unknown) => {
        controller.abort();
        return tool.run(input);
      },
    }));
    await expect(run(agentRequest(tools, 'Los.'), controller.signal)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
