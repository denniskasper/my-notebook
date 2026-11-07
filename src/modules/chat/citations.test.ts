import { describe, expect, it } from 'vitest';

import { toCitation, type PromptDocument } from '.';

const documents: PromptDocument[] = [
  { sourceId: 'source-a', title: 'Heizungsgesetz', ordinals: [0, 1, 2, 3] },
  // A Source whose Passage ordinals don't start at 0 still maps block by block.
  { sourceId: 'source-b', title: 'Förderung', ordinals: [4, 5, 7] },
];

describe('toCitation', () => {
  it('maps a block range of a document to its Source and Passage ordinals', () => {
    expect(
      toCitation(
        { documentIndex: 0, startBlockIndex: 1, endBlockIndex: 3, citedText: 'Zwei. Drei.' },
        documents,
      ),
    ).toEqual({
      sourceId: 'source-a',
      ordinals: [1, 2],
      quote: 'Zwei. Drei.',
      sourceTitle: 'Heizungsgesetz',
    });
  });

  it('uses the ordinals of the Passages sent, not the block positions', () => {
    expect(
      toCitation(
        { documentIndex: 1, startBlockIndex: 1, endBlockIndex: 3, citedText: 'x' },
        documents,
      ),
    ).toMatchObject({ sourceId: 'source-b', ordinals: [5, 7] });
  });

  it('drops a Citation that points outside the documents sent', () => {
    const outside = [
      { documentIndex: 2, startBlockIndex: 0, endBlockIndex: 1 },
      { documentIndex: 0, startBlockIndex: 3, endBlockIndex: 5 },
      { documentIndex: 0, startBlockIndex: 2, endBlockIndex: 2 },
      { documentIndex: -1, startBlockIndex: 0, endBlockIndex: 1 },
    ];
    for (const location of outside) {
      expect(toCitation({ ...location, citedText: 'x' }, documents)).toBeNull();
    }
  });
});
