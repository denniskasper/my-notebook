import type { CitationView } from '@/ui/chat';

/** A run of Briefing text or a Citation chip, numbered through the whole Briefing. */
export type Inline =
  { type: 'text'; text: string } | { type: 'citation'; n: number; citation: CitationView };

export type Block =
  | { type: 'heading'; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'list'; items: Inline[][] };

type Part = { text: string; citations: CitationView[] };

const HEADING = /^#{1,6}\s+/;
const ITEM = /^(?:[-*•]|\d+\.)\s+/;

const textOf = (line: readonly Inline[]) =>
  line.map((inline) => (inline.type === 'text' ? inline.text : '')).join('');

/**
 * Lays out a Briefing: the prompt asks for `## ` headings, `- ` key points and
 * plain paragraphs. Parts break wherever a Citation sits, so lines are cut
 * across parts, and a part's chips follow its text on the line it ends on.
 */
export function briefingBlocks(parts: readonly Part[]): Block[] {
  const lines: Inline[][] = [[]];
  let n = 0;
  for (const part of parts) {
    part.text.split('\n').forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece !== '') lines.at(-1)?.push({ type: 'text', text: piece });
    });
    // A part that ended with a line break still cites the line before it.
    const target = lines.findLast((line) => line.length > 0 && textOf(line).trim() !== '');
    for (const citation of part.citations) {
      n += 1;
      (target ?? lines.at(-1))?.push({ type: 'citation', n, citation });
    }
  }

  const blocks: Block[] = [];
  let paragraph: Inline[] | null = null;
  for (const line of lines) {
    const text = textOf(line).trimStart();
    if (text.trim() === '' && !line.some((inline) => inline.type === 'citation')) {
      paragraph = null;
      continue;
    }
    const heading = HEADING.exec(text);
    const item = ITEM.exec(text);
    if (heading) {
      paragraph = null;
      blocks.push({ type: 'heading', inline: stripPrefix(line, heading[0]) });
    } else if (item) {
      paragraph = null;
      const last = blocks.at(-1);
      const inline = stripPrefix(line, item[0]);
      if (last?.type === 'list') last.items.push(inline);
      else blocks.push({ type: 'list', items: [inline] });
    } else if (paragraph) {
      paragraph.push({ type: 'text', text: ' ' }, ...stripPrefix(line, ''));
    } else {
      paragraph = stripPrefix(line, '');
      blocks.push({ type: 'paragraph', inline: paragraph });
    }
  }
  return blocks;
}

/** The line without leading whitespace and `prefix` (which may span several text runs). */
function stripPrefix(line: readonly Inline[], prefix: string): Inline[] {
  const leading = textOf(line).length - textOf(line).trimStart().length;
  let drop = leading + prefix.length;
  const result: Inline[] = [];
  for (const inline of line) {
    if (inline.type === 'text' && drop > 0) {
      const rest = inline.text.slice(drop);
      drop -= inline.text.length - rest.length;
      if (rest !== '') result.push({ type: 'text', text: rest });
    } else {
      result.push(inline);
    }
  }
  return result;
}
