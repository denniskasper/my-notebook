export type LinkSegment =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'link'; href: string };

// An http(s) address up to the next space; trailing punctuation belongs to the sentence.
const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
const TRAILING = /[.,;:!?)\]}'"“”‘’]+$/;
// Markdown bold the model sometimes writes (Chat and Agent); shown bold, never as asterisks.
const STRONG_PATTERN = /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g;

/**
 * Splits text into plain text, **bold** spans and http(s) addresses, so web
 * pages the Agent read (but did not add as Sources) show as plain links, never
 * as Citations.
 */
export function splitLinks(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let rest = 0;
  const pushPlain = (value: string) => {
    if (value === '') return;
    const last = segments.at(-1);
    if (last?.type === 'text') last.text += value;
    else segments.push({ type: 'text', text: value });
  };
  const pushText = (value: string) => {
    let from = 0;
    for (const match of value.matchAll(STRONG_PATTERN)) {
      pushPlain(value.slice(from, match.index));
      segments.push({ type: 'strong', text: match[1] ?? '' });
      from = match.index + match[0].length;
    }
    pushPlain(value.slice(from));
  };
  for (const match of text.matchAll(URL_PATTERN)) {
    const href = match[0].replace(TRAILING, '');
    pushText(text.slice(rest, match.index));
    segments.push({ type: 'link', href });
    rest = match.index + href.length;
  }
  pushText(text.slice(rest));
  return segments;
}
