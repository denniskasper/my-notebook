import { describe, expect, it } from 'vitest';

import { briefingBlocks } from './blocks';

const citation = (quote: string) => ({
  sourceId: '0190f0f0-0000-7000-8000-000000000001',
  ordinals: [0],
  quote,
  sourceTitle: 'Heizungsgesetz',
});

describe('briefingBlocks', () => {
  it('turns headings, paragraphs and key points into blocks with numbered Citations', () => {
    const a = citation('A');
    const b = citation('B');
    const blocks = briefingBlocks([
      { text: '## Überblick\nDie Quellen', citations: [] },
      { text: ' regeln das Heizen.', citations: [a] },
      { text: '\n\n## Kernpunkte\n- Erster Punkt', citations: [b] },
      { text: '\n- Zweiter Punkt', citations: [] },
    ]);

    expect(blocks).toEqual([
      { type: 'heading', inline: [{ type: 'text', text: 'Überblick' }] },
      {
        type: 'paragraph',
        inline: [
          { type: 'text', text: 'Die Quellen' },
          { type: 'text', text: ' regeln das Heizen.' },
          { type: 'citation', n: 1, citation: a },
        ],
      },
      { type: 'heading', inline: [{ type: 'text', text: 'Kernpunkte' }] },
      {
        type: 'list',
        items: [
          [
            { type: 'text', text: 'Erster Punkt' },
            { type: 'citation', n: 2, citation: b },
          ],
          [{ type: 'text', text: 'Zweiter Punkt' }],
        ],
      },
    ]);
  });

  it('keeps a Citation on the line it follows when its text ended with a line break', () => {
    const a = citation('A');
    const blocks = briefingBlocks([
      { text: '- Punkt\n', citations: [a] },
      { text: '- Nächster', citations: [] },
    ]);
    expect(blocks).toEqual([
      {
        type: 'list',
        items: [
          [
            { type: 'text', text: 'Punkt' },
            { type: 'citation', n: 1, citation: a },
          ],
          [{ type: 'text', text: 'Nächster' }],
        ],
      },
    ]);
  });

  it('joins consecutive plain lines into one paragraph and splits paragraphs at blank lines', () => {
    const blocks = briefingBlocks([{ text: 'Eins\nzwei\n\nDrei', citations: [] }]);
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        inline: [
          { type: 'text', text: 'Eins' },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'zwei' },
        ],
      },
      { type: 'paragraph', inline: [{ type: 'text', text: 'Drei' }] },
    ]);
  });
});
