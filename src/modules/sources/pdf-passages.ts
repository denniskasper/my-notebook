import { normalizeSourceText, splitIntoPassages, type PassageDraft } from './passages';

/** The part of an unpdf text item that Passages are built from. */
export type PdfTextItem = { str: string; y: number; fontSize: number; hasEOL: boolean };

/** A PDF Passage also knows its 1-based page. */
export type PdfPassageDraft = PassageDraft & { page: number };

// Pages are stored one after another, a paragraph gap apart, like pasted text.
const PAGE_SEPARATOR = '\n\n';
// A line gap this much larger than the page's usual line spacing starts a new paragraph.
const PARAGRAPH_GAP_FACTOR = 1.4;
// After "Kinder-" these words mean the hyphen stands for a left-out word part, not a line break.
const CONJUNCTIONS = /^(und|oder|bis|sowie|bzw\.?)\b/;

type Line = { text: string; y: number; fontSize: number };

/**
 * Splits a PDF's text into ordered Passages with their page numbers, one page
 * at a time so no Passage spans two pages. Offsets index the pages' texts
 * joined by a blank line (empty pages left out).
 */
export function pdfPassages(pages: PdfTextItem[][]): PdfPassageDraft[] {
  const result: PdfPassageDraft[] = [];
  let offset = 0;
  for (const [index, items] of pages.entries()) {
    const text = normalizeSourceText(pageText(items));
    const drafts = splitIntoPassages(text);
    if (drafts.length === 0) continue;
    if (offset > 0) offset += PAGE_SEPARATOR.length;
    for (const draft of drafts) {
      result.push({
        ordinal: result.length,
        text: draft.text,
        charStart: offset + draft.charStart,
        charEnd: offset + draft.charEnd,
        page: index + 1,
      });
    }
    offset += text.length;
  }
  return result;
}

/** A page's text: lines of a paragraph joined into one, paragraphs a blank line apart. */
function pageText(items: PdfTextItem[]): string {
  const lines = toLines(items);
  const spacing = usualLineSpacing(lines);
  let text = '';
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    if (!previous) {
      text = line.text;
      return;
    }
    const gap = previous.y - line.y;
    // A jump upwards (a new column) or a wide gap ends the paragraph.
    if (gap <= 0 || gap > spacing * PARAGRAPH_GAP_FACTOR) text += `\n\n${line.text}`;
    else text = joinLines(text, line.text);
  });
  return text;
}

function toLines(items: PdfTextItem[]): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const item of items) {
    current ??= { text: '', y: item.y, fontSize: item.fontSize };
    current.text += item.str;
    if (item.hasEOL) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
    .filter((line) => line.text.length > 0);
}

/** The median gap between consecutive lines, bounded by the font size so one-line paragraphs still split. */
function usualLineSpacing(lines: Line[]): number {
  const gaps = lines
    .flatMap((line, index) => {
      const previous = lines[index - 1];
      return previous ? [previous.y - line.y] : [];
    })
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  const fontSize = lines[0]?.fontSize ?? 0;
  const fallback = fontSize * 1.5;
  const median = gaps[Math.floor(gaps.length / 2)];
  return median === undefined ? fallback : Math.min(median, fallback);
}

/** Joins a line onto the paragraph so far, undoing hyphenation at the line break. */
function joinLines(text: string, next: string): string {
  if (text.endsWith('­')) return text.slice(0, -1) + next;
  if (/\S-$/.test(text) && !CONJUNCTIONS.test(next)) {
    // "Wärme-" + "pumpe" was split by the layout; "CO2-" + "Budget" keeps its hyphen.
    const hyphenated = /\p{Ll}-$/u.test(text) && /^\p{Ll}/u.test(next);
    return hyphenated ? text.slice(0, -1) + next : text + next;
  }
  return `${text} ${next}`;
}
