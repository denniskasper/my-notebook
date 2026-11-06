import { describe, expect, it } from 'vitest';

import { parseReaderParams } from './reader-params';

const id = '0190a6e0-0000-7000-8000-000000000001';

describe('parseReaderParams', () => {
  it('reads the open Source and the Passage ordinals to highlight', () => {
    expect(parseReaderParams({ source: id, p: '3,1,3' })).toEqual({
      sourceId: id,
      ordinals: [1, 3],
    });
  });

  it('opens nothing without a valid Source id', () => {
    expect(parseReaderParams({})).toEqual({ sourceId: null, ordinals: [] });
    expect(parseReaderParams({ source: 'nope', p: '1' })).toEqual({ sourceId: null, ordinals: [] });
  });

  it('ignores ordinals that are not whole, non-negative numbers', () => {
    expect(parseReaderParams({ source: id, p: '2,-1,x,1.5,,4' }).ordinals).toEqual([2, 4]);
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseReaderParams({ source: [id, 'other'], p: ['0', '9'] })).toEqual({
      sourceId: id,
      ordinals: [0],
    });
  });
});
