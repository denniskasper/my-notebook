import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { encodeSseEvent, readSseEvents } from '.';

const schema = z.object({ n: z.number() });

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe('SSE', () => {
  it('encodes an event as one data line and a blank line', () => {
    expect(encodeSseEvent({ n: 1 })).toBe('data: {"n":1}\n\n');
  });

  it('reads back events split across chunks in any way', async () => {
    const wire = encodeSseEvent({ n: 1 }) + encodeSseEvent({ n: 2 }) + encodeSseEvent({ n: 3 });
    const chunks = [wire.slice(0, 5), wire.slice(5, 17), wire.slice(17)];
    expect(await collect(readSseEvents(streamOf(...chunks), schema))).toEqual([
      { n: 1 },
      { n: 2 },
      { n: 3 },
    ]);
  });

  it('keeps multi-byte characters split across chunks intact', async () => {
    const bytes = new TextEncoder().encode(encodeSseEvent({ text: 'Wärme' }));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 18));
        controller.enqueue(bytes.slice(18));
        controller.close();
      },
    });
    expect(await collect(readSseEvents(stream, z.object({ text: z.string() })))).toEqual([
      { text: 'Wärme' },
    ]);
  });

  it('ignores comments and rejects an event that does not match the schema', async () => {
    expect(await collect(readSseEvents(streamOf(': ping\n\n'), schema))).toEqual([]);
    await expect(collect(readSseEvents(streamOf('data: {"n":"x"}\n\n'), schema))).rejects.toThrow();
  });
});
