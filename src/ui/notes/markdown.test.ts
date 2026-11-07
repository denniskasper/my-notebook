import { describe, expect, it } from 'vitest';

import { parseNoteMarkdown } from './markdown';

describe('parseNoteMarkdown', () => {
  it('reads headings, lists and paragraphs', () => {
    expect(
      parseNoteMarkdown(
        '# Fristen\n\nErste Zeile\nzweite Zeile\n\n- eins\n- zwei\n\n1. erst\n2. dann',
        new Set(),
      ),
    ).toEqual([
      { type: 'heading', level: 1, inline: [{ type: 'text', text: 'Fristen' }] },
      { type: 'paragraph', inline: [{ type: 'text', text: 'Erste Zeile\nzweite Zeile' }] },
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'text', text: 'eins' }], [{ type: 'text', text: 'zwei' }]],
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'erst' }], [{ type: 'text', text: 'dann' }]],
      },
    ]);
  });

  it('reads emphasis, code and the markers that still have a Citation', () => {
    expect(parseNoteMarkdown('**Fest** und *kursiv* mit `code`[1][7].', new Set(['1']))).toEqual([
      {
        type: 'paragraph',
        inline: [
          { type: 'strong', inline: [{ type: 'text', text: 'Fest' }] },
          { type: 'text', text: ' und ' },
          { type: 'em', inline: [{ type: 'text', text: 'kursiv' }] },
          { type: 'text', text: ' mit ' },
          { type: 'code', text: 'code' },
          { type: 'citation', marker: '1' },
          { type: 'text', text: '[7].' },
        ],
      },
    ]);
  });

  it('keeps a marker inside emphasis a Citation', () => {
    expect(parseNoteMarkdown('**Frist [1]** und _Ende [2]_', new Set(['1']))).toEqual([
      {
        type: 'paragraph',
        inline: [
          {
            type: 'strong',
            inline: [
              { type: 'text', text: 'Frist ' },
              { type: 'citation', marker: '1' },
            ],
          },
          { type: 'text', text: ' und ' },
          { type: 'em', inline: [{ type: 'text', text: 'Ende [2]' }] },
        ],
      },
    ]);
  });
});
