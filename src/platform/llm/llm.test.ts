import { describe, expect, it } from 'vitest';

import { createFakeLlm } from './fake';
import type { ChatRequest, ChatStreamEvent } from './types';

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
