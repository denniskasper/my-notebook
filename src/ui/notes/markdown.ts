/**
 * The small Markdown subset Notes render: headings, lists, paragraphs, bold,
 * italic, inline code and `[n]` Citation markers. Parsed into data, so React
 * renders it without HTML injection.
 */

export type Inline =
  { type: 'text' | 'strong' | 'em' | 'code'; text: string } | { type: 'citation'; marker: string };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|`(.+?)`|\[([1-9]\d*)\]/g;

/** `markers` are those with a stored Citation; any other `[n]` stays plain text. */
export function parseNoteMarkdown(body: string, markers: ReadonlySet<string>): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join('\n'), markers) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: 'list', ...list });
      list = null;
    }
  };

  for (const line of body.split('\n')) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (line.trim() === '') {
      flush();
    } else if (heading) {
      flush();
      const level = Math.min(heading[1]?.length ?? 1, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, inline: parseInline(heading[2] ?? '', markers) });
    } else if (item) {
      const ordered = numbered !== null && bullet === null;
      if (paragraph.length > 0 || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[1] ?? '', markers));
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

function parseInline(text: string, markers: ReadonlySet<string>): Inline[] {
  const inline: Inline[] = [];
  const pushText = (value: string) => {
    if (value === '') return;
    const last = inline.at(-1);
    if (last?.type === 'text') last.text += value;
    else inline.push({ type: 'text', text: value });
  };
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    pushText(text.slice(at, match.index));
    at = match.index + match[0].length;
    const [whole, strong, em, emUnderscore, code, marker] = match;
    if (strong !== undefined) inline.push({ type: 'strong', text: strong });
    else if (em !== undefined) inline.push({ type: 'em', text: em });
    else if (emUnderscore !== undefined) inline.push({ type: 'em', text: emUnderscore });
    else if (code !== undefined) inline.push({ type: 'code', text: code });
    else if (marker !== undefined && markers.has(marker)) {
      inline.push({ type: 'citation', marker });
    } else pushText(whole);
  }
  pushText(text.slice(at));
  return inline;
}
