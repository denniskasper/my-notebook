import { Readability } from '@mozilla/readability';
import createDOMPurify from 'dompurify';
import { JSDOM, VirtualConsole } from 'jsdom';

import { normalizeSourceText } from './passages';

/** A web page's readable article: its title (if any) and text, paragraphs separated by blank lines. */
export type Article = { title: string | null; text: string };

// Elements whose text becomes one paragraph of the Source.
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, dt, dd, td, th';

/**
 * Extracts the readable article from a fetched HTML page: Readability finds
 * it, DOMPurify sanitises it, and its block elements become paragraphs.
 * Null if the page has no readable text. Scripts never run.
 */
export function extractArticle(html: Buffer, contentType: string, url: string): Article | null {
  // jsdom logs every CSS it can't parse; nothing on a fetched page is worth a log line.
  const virtualConsole = new VirtualConsole();
  const { window } = new JSDOM(decodeHtml(html, contentType), { url, virtualConsole });
  try {
    const parsed = new Readability(window.document).parse();
    if (!parsed?.content) return null;

    const purify = createDOMPurify(window);
    const body = purify.sanitize(parsed.content, { RETURN_DOM_FRAGMENT: true });
    const text = paragraphs(body).join('\n\n');
    if (text.trim() === '') return null;
    return { title: cleanTitle(parsed.title), text };
  } finally {
    window.close();
  }
}

/**
 * The page as text: the charset from the header, else from a meta tag, else
 * UTF-8 if it decodes as such. jsdom would fall back to windows-1252, which
 * garbles the many pages that are UTF-8 without saying so.
 */
function decodeHtml(html: Buffer, contentType: string): string {
  const head = html.subarray(0, 1024).toString('latin1');
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  if (declared) {
    try {
      return new TextDecoder(declared).decode(html);
    } catch {
      // An unknown label: fall through to sniffing.
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(html);
  } catch {
    return new TextDecoder('windows-1252').decode(html);
  }
}

/** The text of every innermost block element, in document order. */
function paragraphs(root: DocumentFragment): string[] {
  const blocks = [...root.querySelectorAll(BLOCKS)].filter((block) => !block.querySelector(BLOCKS));
  const texts = blocks.length > 0 ? blocks.map(blockText) : [collapse(root.textContent ?? '')];
  return texts.filter((text) => text !== '');
}

function blockText(block: Element): string {
  const raw = block.textContent ?? '';
  // Preformatted text keeps its lines; everything else flows as one paragraph.
  if (block.tagName === 'PRE')
    return normalizeSourceText(raw)
      .replace(/\n{2,}/g, '\n')
      .trim();
  return collapse(raw);
}

function collapse(text: string): string {
  return normalizeSourceText(text).replace(/\s+/g, ' ').trim();
}

function cleanTitle(title: string | null | undefined): string | null {
  const cleaned = collapse(title ?? '');
  return cleaned === '' ? null : cleaned;
}
