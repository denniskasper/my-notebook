import { describe, expect, it } from 'vitest';

import { splitTrailingWord } from './trailing-word';

describe('splitTrailingWord', () => {
  it('splits off the last word, so the Citation chips after it never start a line', () => {
    expect(splitTrailingWord('hält das Wesentliche gleich zu Beginn fest')).toEqual({
      lead: 'hält das Wesentliche gleich zu Beginn ',
      tail: 'fest',
    });
  });

  it('keeps punctuation and the spaces before the chips with the last word', () => {
    expect(splitTrailingWord('Anträge sind bis Ende 2027 möglich. ')).toEqual({
      lead: 'Anträge sind bis Ende 2027 ',
      tail: 'möglich. ',
    });
  });

  it('takes a single word whole', () => {
    expect(splitTrailingWord('Rechtsrat.')).toEqual({ lead: '', tail: 'Rechtsrat.' });
  });

  it('leaves a line break before the chips alone: the chips may start the new line', () => {
    expect(splitTrailingWord('Erster Absatz\n')).toEqual({ lead: 'Erster Absatz\n', tail: '' });
    expect(splitTrailingWord('Erster Absatz\n\nZweiter')).toEqual({
      lead: 'Erster Absatz\n\n',
      tail: 'Zweiter',
    });
  });

  it('lets a very long last word (an address) wrap instead of overflowing', () => {
    const address = 'https://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/2026/ki.html';
    expect(splitTrailingWord(`Siehe ${address}`)).toEqual({
      lead: `Siehe ${address}`,
      tail: '',
    });
  });

  it('returns empty parts for empty text', () => {
    expect(splitTrailingWord('')).toEqual({ lead: '', tail: '' });
  });
});
