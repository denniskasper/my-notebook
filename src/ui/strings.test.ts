import { describe, expect, it } from 'vitest';

import {
  briefingFailureMessage,
  errorMessage,
  format,
  formatNumber,
  formatUsd,
  plural,
  retryValues,
  strings,
  toErrorCode,
} from './strings';

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

  it('fills placeholders from values', () => {
    expect(errorMessage('invalid_title', { max: 120 })).toBe(
      'Der Titel muss zwischen 1 und 120 Zeichen lang sein.',
    );
  });
});

describe('briefingFailureMessage', () => {
  it('uses Studio wording for generic failures', () => {
    expect(briefingFailureMessage(null)).toBe(strings.studio.failed);
    expect(briefingFailureMessage('llm_failed')).toBe(strings.studio.failed);
    expect(briefingFailureMessage('unknown')).toBe(strings.studio.failed);
  });

  it('keeps the specific text for other codes', () => {
    expect(briefingFailureMessage('interrupted')).toBe('Die Verarbeitung wurde unterbrochen.');
  });
});

describe('toErrorCode', () => {
  it('keeps a known code and maps anything else to unknown', () => {
    expect(toErrorCode('token_cap_exceeded')).toBe('token_cap_exceeded');
    expect(toErrorCode('scanned_pdf_from_the_future')).toBe('unknown');
    expect(toErrorCode('toString')).toBe('unknown');
    expect(toErrorCode(null)).toBe('unknown');
  });

  it('names the token cap in the German message', () => {
    expect(errorMessage('token_cap_exceeded', { cap: 80_000 })).toContain('80.000 Tokens');
  });
});

describe('Budget guard messages', () => {
  it('names the Berlin time the Daily allowance is back', () => {
    // Midnight in Berlin is 23:00 UTC in winter.
    expect(
      errorMessage('daily_allowance', retryValues('2026-11-07T23:00:00.000Z', new Date())),
    ).toBe('Dein Tageskontingent ist aufgebraucht – ab 00:00 Uhr wieder verfügbar.');
  });

  it('rounds the wait for a rate limit up to whole minutes, at least one', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    expect(errorMessage('rate_limited', retryValues('2026-11-07T12:12:01Z', now))).toBe(
      'Kurz durchatmen – in 13 Min. wieder möglich.',
    );
    expect(errorMessage('rate_limited', retryValues('2026-11-07T12:00:00Z', now))).toBe(
      'Kurz durchatmen – in 1 Min. wieder möglich.',
    );
  });

  it('has the Demo budget and Agent messages from the spec', () => {
    expect(errorMessage('demo_budget_daily')).toBe(
      'Das Demo-Budget für heute ist aufgebraucht. Morgen geht’s weiter.',
    );
    expect(errorMessage('demo_budget_total')).toBe('Das Demo-Budget ist aufgebraucht.');
    expect(errorMessage('agent_busy')).toBe('Agent ist gerade ausgelastet.');
  });
});

describe('formatUsd', () => {
  it('shows micro-dollars as German dollar amounts with cents', () => {
    expect(formatUsd(0)).toMatch(/^0,00\s\$$/);
    expect(formatUsd(421_337)).toMatch(/^0,42\s\$$/);
    expect(formatUsd(13_000_000)).toMatch(/^13,00\s\$$/);
    expect(formatUsd(1_234_565_000)).toMatch(/^1\.234,57\s\$$/);
  });
});
