import { describe, expect, it } from 'vitest';

import { splitLinks } from './links';

describe('splitLinks', () => {
  it('splits plain http(s) addresses out of text', () => {
    expect(
      splitLinks('Außerdem gelesen: https://example.org/a?b=1, http://127.0.0.1:3101/x'),
    ).toEqual([
      { type: 'text', text: 'Außerdem gelesen: ' },
      { type: 'link', href: 'https://example.org/a?b=1' },
      { type: 'text', text: ', ' },
      { type: 'link', href: 'http://127.0.0.1:3101/x' },
    ]);
  });

  it('leaves closing punctuation and brackets after an address in the text', () => {
    expect(splitLinks('Siehe (https://example.org/seite).')).toEqual([
      { type: 'text', text: 'Siehe (' },
      { type: 'link', href: 'https://example.org/seite' },
      { type: 'text', text: ').' },
    ]);
  });

  it('keeps text without addresses as it is', () => {
    expect(splitLinks('Kein Link, nur ftp://x und www.example.org.')).toEqual([
      { type: 'text', text: 'Kein Link, nur ftp://x und www.example.org.' },
    ]);
    expect(splitLinks('')).toEqual([]);
  });
});
