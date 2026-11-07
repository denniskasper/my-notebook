export type LinkSegment = { type: 'text'; text: string } | { type: 'link'; href: string };

// An http(s) address up to the next space; trailing punctuation belongs to the sentence.
const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
const TRAILING = /[.,;:!?)\]}'"“”‘’]+$/;

/**
 * Splits text into plain text and http(s) addresses, so web pages the Agent
 * read (but did not add as Sources) show as plain links, never as Citations.
 */
export function splitLinks(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let rest = 0;
  const pushText = (value: string) => {
    if (value === '') return;
    const last = segments.at(-1);
    if (last?.type === 'text') last.text += value;
    else segments.push({ type: 'text', text: value });
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
