import type { z } from 'zod';

/** Response headers for a Server-Sent Events stream that proxies must not buffer. */
export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
} as const;

/** One SSE event carrying `data` as JSON. */
export function encodeSseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Parses an SSE body into events, each validated against `schema` (throws on a mismatch). */
export async function* readSseEvents<T>(
  body: ReadableStream<Uint8Array>,
  schema: z.ZodType<T>,
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` keeps a character split across chunks for the next one.
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const data = dataOf(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (data !== null) yield schema.parse(JSON.parse(data));
        end = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** The `data:` lines of one event joined, or null for comments and empty events. */
function dataOf(event: string): string | null {
  const lines = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length > 0 ? lines.join('\n') : null;
}
