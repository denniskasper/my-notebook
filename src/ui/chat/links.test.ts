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

  it('splits **bold** spans out of the text, without their asterisks', () => {
    expect(
      splitLinks('- **Bundesnetzagentur:** Sie überwacht, siehe https://example.org.'),
    ).toEqual([
      { type: 'text', text: '- ' },
      { type: 'strong', text: 'Bundesnetzagentur:' },
      { type: 'text', text: ' Sie überwacht, siehe ' },
      { type: 'link', href: 'https://example.org' },
      { type: 'text', text: '.' },
    ]);
  });

  it('keeps lone or empty asterisks as text', () => {
    expect(splitLinks('2 * 3 = 6, **** und ** offen')).toEqual([
      { type: 'text', text: '2 * 3 = 6, **** und ** offen' },
    ]);
  });

  it('keeps text without addresses as it is', () => {
    expect(splitLinks('Kein Link, nur ftp://x und www.example.org.')).toEqual([
      { type: 'text', text: 'Kein Link, nur ftp://x und www.example.org.' },
    ]);
    expect(splitLinks('')).toEqual([]);
  });
});
