import { describe, expect, it } from 'vitest';

import { errorMessage, format, formatNumber, plural, strings } from './strings';

describe('format', () => {
  it('fills named placeholders', () => {
    expect(format('„{title}“ löschen?', { title: 'Wärme' })).toBe('„Wärme“ löschen?');
  });

  it('formats numbers the German way', () => {
    expect(format('{n} Tokens', { n: 80000 })).toBe('80.000 Tokens');
  });

  it('leaves unknown placeholders visible instead of hiding a bug', () => {
    expect(format('{a} und {b}', { a: 'eins' })).toBe('eins und {b}');
  });
});

describe('plural', () => {
  const forms = strings.sidebar.sourceCount;

  it.each([
    [0, '0 Quellen'],
    [1, '1 Quelle'],
    [2, '2 Quellen'],
    [1200, '1.200 Quellen'],
  ])('%i → %s', (count, expected) => {
    expect(plural(count, forms)).toBe(expected);
  });
});

describe('format with a UI string', () => {
  it('fills several placeholders', () => {
    expect(format(strings.notebook.activeSources, { count: 3, total: 4 })).toBe(
      '3 von 4 Quellen aktiv',
    );
  });
});

describe('formatNumber', () => {
  it('uses German separators', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5');
  });
});

describe('errorMessage', () => {
  it('maps every error code to a German message', () => {
    expect(errorMessage('not_found')).toBe('Dieses Notebook gibt es nicht mehr.');
  });
});
