import { describe, expect, it } from 'vitest';

import { trimHistory } from '.';

const turn = (question: string, answer: string) => ({ question, answer });

describe('trimHistory', () => {
  it('keeps the whole history when it fits', () => {
    const history = [turn('Frage eins', 'Antwort eins'), turn('Frage zwei', 'Antwort zwei')];
    expect(trimHistory(history, { budgetTokens: 1_000 })).toEqual(history);
  });

  it('drops the oldest question-and-answer pairs first', () => {
    const history = [
      turn('a'.repeat(400), 'b'.repeat(400)),
      turn('c'.repeat(400), 'd'.repeat(400)),
      turn('e'.repeat(40), 'f'.repeat(40)),
    ];
    // Roughly three characters per token: the newest two pairs take ~293 tokens.
    expect(trimHistory(history, { budgetTokens: 300 })).toEqual(history.slice(1));
    expect(trimHistory(history, { budgetTokens: 100 })).toEqual(history.slice(2));
  });

  it('keeps nothing when not even the newest pair fits', () => {
    expect(trimHistory([turn('a'.repeat(400), 'b')], { budgetTokens: 10 })).toEqual([]);
    expect(trimHistory([turn('a', 'b')], { budgetTokens: -5 })).toEqual([]);
  });
});
