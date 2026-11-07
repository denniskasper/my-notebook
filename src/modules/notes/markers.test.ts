import { describe, expect, it } from 'vitest';

import { noteFromAnswer, pruneCitations } from './markers';

const citation = (quote: string) => ({
  sourceId: '0193a5f0-0000-7000-8000-000000000001',
  ordinals: [0],
  quote,
  sourceTitle: 'Heizungsgesetz',
});

describe('pruneCitations', () => {
  it('drops the entries whose marker no longer appears in the body', () => {
    const citations = { '1': citation('eins'), '2': citation('zwei'), '3': citation('drei') };

    expect(pruneCitations('Erstens[1] und drittens [3].', citations)).toEqual({
      '1': citation('eins'),
      '3': citation('drei'),
    });
  });
});

describe('noteFromAnswer', () => {
  it('writes a marker after each cited part, numbered through the answer like its chips', () => {
    const note = noteFromAnswer([
      { type: 'text', text: 'Laut deinen Quellen gilt A', citations: [citation('a')] },
      { type: 'text', text: ', und B', citations: [citation('b1'), citation('b2')] },
      { type: 'text', text: '.', citations: [] },
    ]);

    expect(note).toEqual({
      body: 'Laut deinen Quellen gilt A[1], und B[2][3].',
      citations: { '1': citation('a'), '2': citation('b1'), '3': citation('b2') },
    });
  });
});
