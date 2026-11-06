import { describe, expect, it } from 'vitest';

import { splitIntoPassages } from '.';

describe('splitIntoPassages', () => {
  it('makes one ordered Passage per paragraph with char offsets', () => {
    const text = 'Erster Absatz.\n\nZweiter Absatz.';
    expect(splitIntoPassages(text)).toEqual([
      { ordinal: 0, text: 'Erster Absatz.', charStart: 0, charEnd: 14 },
      { ordinal: 1, text: 'Zweiter Absatz.', charStart: 16, charEnd: 31 },
    ]);
  });

  it('skips blank paragraphs and trims surrounding whitespace', () => {
    const text = '\n\n  Eins.  \n \n\n\n Zwei. \n';
    const passages = splitIntoPassages(text);
    expect(passages.map((p) => p.text)).toEqual(['Eins.', 'Zwei.']);
    for (const passage of passages) {
      expect(text.slice(passage.charStart, passage.charEnd)).toBe(passage.text);
    }
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(splitIntoPassages('Zeile eins\nZeile zwei')).toMatchObject([
      { text: 'Zeile eins\nZeile zwei' },
    ]);
  });

  it('treats Windows line endings like Unix ones', () => {
    expect(splitIntoPassages('A.\r\n\r\nB.').map((p) => p.text)).toEqual(['A.', 'B.']);
  });

  it('splits a long paragraph into groups of whole sentences', () => {
    const sentence = 'Die Wärmepumpe nutzt Umweltwärme aus Luft, Erde oder Wasser. ';
    const text = sentence.repeat(30).trim();
    const passages = splitIntoPassages(text);

    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) {
      expect(passage.text.length).toBeLessThanOrEqual(800);
      expect(passage.text.endsWith('Wasser.')).toBe(true);
      expect(text.slice(passage.charStart, passage.charEnd)).toBe(passage.text);
    }
    expect(passages.map((p) => p.ordinal)).toEqual(passages.map((_, index) => index));
    expect(passages.map((p) => p.text).join(' ')).toBe(text);
  });

  it('cuts a single overlong sentence at a word boundary', () => {
    const text = `${'Wort '.repeat(400).trim()}.`;
    const passages = splitIntoPassages(text);
    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) {
      expect(passage.text.length).toBeLessThanOrEqual(800);
      expect(passage.text.startsWith('Wort')).toBe(true);
      expect(text.slice(passage.charStart, passage.charEnd)).toBe(passage.text);
    }
  });

  it('drops soft hyphens', () => {
    expect(splitIntoPassages('Wärme­pumpe').map((p) => p.text)).toEqual(['Wärmepumpe']);
  });

  it('returns nothing for whitespace only', () => {
    expect(splitIntoPassages(' \n\n \t ')).toEqual([]);
  });
});
