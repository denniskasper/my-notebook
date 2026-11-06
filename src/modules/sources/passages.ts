/** A Passage before it is stored: its position and text within the Source. */
export type PassageDraft = { ordinal: number; text: string; charStart: number; charEnd: number };

// Long enough for a typical paragraph, short enough that a Citation points somewhere precise.
export const PASSAGE_MAX_LENGTH = 800;

const SOFT_HYPHEN = /­/g;

/**
 * The text every Source is stored as: Unix line endings and no soft hyphens
 * (they break search and quotes). Passage offsets index into this text.
 */
export function normalizeSourceText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(SOFT_HYPHEN, '');
}

type Range = { start: number; end: number };

/**
 * Splits a Source's text into ordered Passages: one per paragraph (blank-line
 * separated), long paragraphs grouped into a few whole sentences each.
 */
export function splitIntoPassages(rawText: string): PassageDraft[] {
  const text = normalizeSourceText(rawText);
  const ranges = paragraphRanges(text).flatMap((paragraph) => splitLong(text, paragraph));
  return ranges.map((range, ordinal) => ({
    ordinal,
    text: text.slice(range.start, range.end),
    charStart: range.start,
    charEnd: range.end,
  }));
}

function paragraphRanges(text: string): Range[] {
  const ranges: Range[] = [];
  let start = 0;
  for (const separator of text.matchAll(/\n[ \t]*\n\s*/g)) {
    pushTrimmed(text, { start, end: separator.index }, ranges);
    start = separator.index + separator[0].length;
  }
  pushTrimmed(text, { start, end: text.length }, ranges);
  return ranges;
}

function pushTrimmed(text: string, range: Range, into: Range[]): void {
  let { start, end } = range;
  while (start < end && /\s/.test(text.charAt(start))) start++;
  while (end > start && /\s/.test(text.charAt(end - 1))) end--;
  if (end > start) into.push({ start, end });
}

/** Groups a paragraph's sentences into Passages of at most PASSAGE_MAX_LENGTH characters. */
function splitLong(text: string, paragraph: Range): Range[] {
  if (paragraph.end - paragraph.start <= PASSAGE_MAX_LENGTH) return [paragraph];

  const pieces = sentenceRanges(text, paragraph).flatMap((sentence) => cutAtWords(text, sentence));
  const groups: Range[] = [];
  for (const piece of pieces) {
    const last = groups.at(-1);
    if (last && piece.end - last.start <= PASSAGE_MAX_LENGTH) last.end = piece.end;
    else groups.push({ ...piece });
  }
  return groups;
}

function sentenceRanges(text: string, paragraph: Range): Range[] {
  const body = text.slice(paragraph.start, paragraph.end);
  const ranges: Range[] = [];
  let start = 0;
  // A sentence ends at . ! ? or … (plus closing quotes/brackets) followed by whitespace.
  for (const gap of body.matchAll(/(?<=[.!?…]["'“”»«)\]]*)\s+/g)) {
    ranges.push({ start: paragraph.start + start, end: paragraph.start + gap.index });
    start = gap.index + gap[0].length;
  }
  ranges.push({ start: paragraph.start + start, end: paragraph.end });
  return ranges;
}

/** A sentence longer than a Passage is cut at the last whitespace that fits. */
function cutAtWords(text: string, sentence: Range): Range[] {
  const pieces: Range[] = [];
  let { start } = sentence;
  while (sentence.end - start > PASSAGE_MAX_LENGTH) {
    const window = text.slice(start, start + PASSAGE_MAX_LENGTH + 1);
    const lastSpace = window.search(/\s\S*$/);
    const cut = lastSpace > 0 ? start + lastSpace : start + PASSAGE_MAX_LENGTH;
    pieces.push({ start, end: cut });
    start = cut;
    while (start < sentence.end && /\s/.test(text.charAt(start))) start++;
  }
  if (sentence.end > start) pieces.push({ start, end: sentence.end });
  return pieces;
}
