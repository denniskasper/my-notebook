import { describe, expect, it } from 'vitest';

import { NOTE_TITLE_MAX_LENGTH, noteTitleFrom } from './input';

describe('noteTitleFrom', () => {
  it('collapses whitespace in a short text', () => {
    expect(noteTitleFrom('  Welche\n Fristen   gelten? ')).toBe('Welche Fristen gelten?');
  });

  it('never returns an empty title', () => {
    expect(noteTitleFrom(' \n ')).toBe('…');
  });

  it('cuts a long text to the title limit with an ellipsis', () => {
    const title = noteTitleFrom('wort '.repeat(100));

    expect(title).toHaveLength(NOTE_TITLE_MAX_LENGTH);
    expect(title.endsWith('wort…')).toBe(true);
  });
});
