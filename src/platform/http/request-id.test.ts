import { describe, expect, it } from 'vitest';

import { resolveRequestId } from '.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a well-formed incoming id', () => {
    expect(resolveRequestId('abc-123_x.y:z')).toBe('abc-123_x.y:z');
  });

  it.each([null, undefined, '', 'has space', 'x'.repeat(129), 'line\nbreak'])(
    'replaces %j with a fresh UUID',
    (incoming) => {
      expect(resolveRequestId(incoming)).toMatch(UUID);
    },
  );
});
