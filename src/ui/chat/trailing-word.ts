// The last word plus the spaces after it, but no line break: the chips may start a new line.
const TRAILING_WORD = /\S*[^\S\n]*$/;
// Longer than this (e.g. an address), the word may wrap rather than overflow the column.
const MAX_TAIL_LENGTH = 32;

/**
 * Splits text before Citation chips into what may wrap freely and its last
 * word, which the caller keeps on one line with the chips (`whitespace-nowrap`),
 * so a chip never lands alone at the start of a line.
 */
export function splitTrailingWord(text: string): { lead: string; tail: string } {
  const tail = TRAILING_WORD.exec(text)?.[0] ?? '';
  if (tail.length > MAX_TAIL_LENGTH) return { lead: text, tail: '' };
  return { lead: text.slice(0, text.length - tail.length), tail };
}
