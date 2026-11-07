import { describe, expect, it } from 'vitest';

import { chatEventSchema } from './events';

const id = '0190a6e0-0000-7000-8000-000000000001';

describe('chatEventSchema', () => {
  it('accepts every event of a streamed answer', () => {
    const events = [
      { type: 'started', userMessageId: id, assistantMessageId: id },
      { type: 'text', part: 0, text: 'Laut ' },
      {
        type: 'citation',
        part: 1,
        citation: { sourceId: id, ordinals: [0, 1], quote: 'Zitat', sourceTitle: 'Quelle' },
      },
      { type: 'done', status: 'complete' },
      { type: 'done', status: 'stopped' },
      { type: 'error', error: 'llm_failed' },
    ];
    for (const event of events) expect(chatEventSchema.parse(event)).toEqual(event);
  });

  it('rejects unknown types, negative parts, empty ordinals and unknown error codes', () => {
    const invalid = [
      { type: 'thinking' },
      { type: 'text', part: -1, text: 'x' },
      {
        type: 'citation',
        part: 0,
        citation: { sourceId: id, ordinals: [], quote: '', sourceTitle: '' },
      },
      { type: 'done', status: 'streaming' },
      { type: 'error', error: 'kaputt' },
    ];
    for (const event of invalid) expect(chatEventSchema.safeParse(event).success).toBe(false);
  });
});
