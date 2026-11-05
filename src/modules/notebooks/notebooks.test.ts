import { describe, expect, it } from 'vitest';

import { NOTEBOOK_TITLE_MAX_LENGTH, notebookTitleSchema } from '.';

describe('notebookTitleSchema', () => {
  it('trims and collapses whitespace', () => {
    expect(notebookTitleSchema.parse('  Wärme \n wende  ')).toBe('Wärme wende');
  });

  it('rejects blank titles', () => {
    expect(notebookTitleSchema.safeParse('   ').success).toBe(false);
  });

  it('allows up to the maximum length', () => {
    expect(notebookTitleSchema.safeParse('a'.repeat(NOTEBOOK_TITLE_MAX_LENGTH)).success).toBe(true);
    expect(notebookTitleSchema.safeParse('a'.repeat(NOTEBOOK_TITLE_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });
});
