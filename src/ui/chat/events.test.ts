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
      {
        type: 'step',
        part: 2,
        step: {
          type: 'step',
          id: 's1',
          tool: 'read_source',
          argument: 'Quelle',
          status: 'running',
        },
      },
      { type: 'note_created', noteId: id },
      { type: 'source_added', sourceId: id },
      { type: 'done', status: 'stopped', reason: 'agent_timeout' },
      { type: 'done', status: 'complete', costMicroUsd: 41_250 },
      { type: 'error', error: 'agent_busy' },
      { type: 'error', error: 'llm_failed' },
      { type: 'error', error: 'daily_allowance', retryAt: '2026-11-07T23:00:00.000Z' },
      { type: 'error', error: 'rate_limited', retryAt: '2026-11-07T12:20:00.000Z' },
      { type: 'error', error: 'demo_budget_total' },
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
      { type: 'done', status: 'stopped', reason: 'müde' },
      { type: 'done', status: 'complete', costMicroUsd: -1 },
      { type: 'source_added', sourceId: 'neu' },
      {
        type: 'step',
        part: 0,
        step: { type: 'step', id: 's1', tool: 'x', argument: null, status: 'pausiert' },
      },
      { type: 'error', error: 'kaputt' },
      { type: 'error', error: 'rate_limited', retryAt: 'in zehn Minuten' },
    ];
    for (const event of invalid) expect(chatEventSchema.safeParse(event).success).toBe(false);
  });
});
