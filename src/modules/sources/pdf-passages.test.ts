import { describe, expect, it } from 'vitest';

import { pdfPassages, type PdfTextItem } from '.';

const FONT_SIZE = 11;
const LEADING = 14;

/** A page as unpdf reports it: one text item per line, top to bottom; `''` leaves a blank line. */
function page(...lines: string[]): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  lines.forEach((line, row) => {
    if (line === '') return;
    items.push({ str: line, y: 780 - row * LEADING, fontSize: FONT_SIZE, hasEOL: true });
  });
  return items;
}

describe('pdfPassages', () => {
  it('turns each page into Passages that carry their 1-based page number', () => {
    const passages = pdfPassages([page('Erste Seite.'), page('Zweite Seite.')]);
    expect(passages).toEqual([
      { ordinal: 0, text: 'Erste Seite.', charStart: 0, charEnd: 12, page: 1 },
      { ordinal: 1, text: 'Zweite Seite.', charStart: 14, charEnd: 27, page: 2 },
    ]);
  });

  it('joins the lines of a paragraph and splits paragraphs at a larger vertical gap', () => {
    const passages = pdfPassages([
      page('Die Wärmepumpe nutzt', 'Umweltwärme.', '', 'Ein neuer Absatz', 'beginnt hier.'),
    ]);
    expect(passages.map((p) => p.text)).toEqual([
      'Die Wärmepumpe nutzt Umweltwärme.',
      'Ein neuer Absatz beginnt hier.',
    ]);
  });

  it('rejoins words hyphenated at a line end, but keeps hyphens of compounds', () => {
    const passages = pdfPassages([page('Die Wärme-', 'pumpe und das CO2-', 'Budget.')]);
    expect(passages.map((p) => p.text)).toEqual(['Die Wärmepumpe und das CO2-Budget.']);
  });

  it('puts text items of one line together', () => {
    const items: PdfTextItem[] = [
      { str: 'Artikel', y: 780, fontSize: FONT_SIZE, hasEOL: false },
      { str: ' 5', y: 780, fontSize: FONT_SIZE, hasEOL: true },
      { str: 'Verbotene Praktiken', y: 766, fontSize: FONT_SIZE, hasEOL: false },
    ];
    expect(pdfPassages([items]).map((p) => p.text)).toEqual(['Artikel 5 Verbotene Praktiken']);
  });

  it('never lets a Passage span two pages', () => {
    const sentence = 'Hochrisiko-Systeme brauchen ein Risikomanagement. ';
    const passages = pdfPassages([page(sentence.repeat(20).trim()), page('Kurz.')]);
    expect(passages.length).toBeGreaterThan(2);
    expect(passages.at(-1)).toMatchObject({ text: 'Kurz.', page: 2 });
    expect(passages.filter((p) => p.page === 1).every((p) => p.text.length <= 800)).toBe(true);
  });

  it('skips empty pages and drops soft hyphens', () => {
    const passages = pdfPassages([[], page('Wärme­pumpe')]);
    expect(passages).toEqual([
      { ordinal: 0, text: 'Wärmepumpe', charStart: 0, charEnd: 10, page: 2 },
    ]);
  });
});
