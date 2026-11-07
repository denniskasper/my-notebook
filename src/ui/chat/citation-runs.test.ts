import { describe, expect, it } from 'vitest';

import { citationRuns } from './citation-runs';

type Token = { type: 'text'; text: string } | { type: 'citation'; n: number };

const text = (value: string): Token => ({ type: 'text', text: value });
const citation = (n: number): Token => ({ type: 'citation', n });

describe('citationRuns', () => {
  it('attaches the Citations after a text to that text', () => {
    const inline = [text('a'), citation(1), citation(2), text('b')];
    expect(citationRuns(inline)).toEqual([
      { token: text('a'), citations: [citation(1), citation(2)], index: 0 },
      { token: text('b'), citations: [], index: 3 },
    ]);
  });

  it('keeps a leading Citation as a run of its own', () => {
    expect(citationRuns([citation(1), citation(2), text('a')])).toEqual([
      { token: citation(1), citations: [], index: 0 },
      { token: citation(2), citations: [], index: 1 },
      { token: text('a'), citations: [], index: 2 },
    ]);
  });

  it('returns no runs for no tokens', () => {
    expect(citationRuns([])).toEqual([]);
  });
});
