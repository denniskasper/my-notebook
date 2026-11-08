import type { Citation } from '@/modules/chat';

/** A Passage the Agent read in this run, found by the id `read_source` gave it. */
export type ReadPassage = { sourceId: string; sourceTitle: string; ordinal: number; text: string };

/** What the Agent's text becomes once its `[[p:<passageId>]]` markers are resolved. */
export type MarkerEvent = { type: 'text'; text: string } | { type: 'citation'; citation: Citation };

export type MarkerParser = {
  /** The next chunk of streamed text; returns what can be shown so far. */
  push(chunk: string): MarkerEvent[];
  /** The end of the text: releases what was held back, drops an unfinished marker. */
  flush(): MarkerEvent[];
  /** Markers that pointed at no Passage read in this run. */
  dropped(): number;
};

const MARKER = /^p:([A-Za-z0-9-]{1,40})$/;
// What the start of a marker looks like before its `]]` has arrived (a chunk can end between the two).
const MARKER_START = /^\[\[(?:p(?::[A-Za-z0-9-]{0,40}\]?)?)?$/;
// Long enough to recognise the Passage in the tooltip, short enough for a snapshot.
const QUOTE_MAX_CHARS = 400;

type Pending = { sourceId: string; sourceTitle: string; passages: Map<number, string> };

/**
 * Resolves the Agent's Passage markers while its text streams: a marker
 * `resolve` knows becomes a Citation, any other is dropped and counted, and a
 * marker is never shown half-way. Adjacent markers of one Source merge into one
 * Citation, and the whitespace before a marker goes, so chips sit on the text.
 */
export function createMarkerParser(
  resolve: (passageId: string) => ReadPassage | undefined,
): MarkerParser {
  let buffer = '';
  let heldWhitespace = '';
  let pending: Pending | null = null;
  let dropped = 0;
  let out: MarkerEvent[] = [];

  const releasePending = () => {
    if (!pending) return;
    const ordinals = [...pending.passages.keys()].sort((a, b) => a - b);
    out.push({
      type: 'citation',
      citation: {
        sourceId: pending.sourceId,
        ordinals,
        quote: ordinals
          .map((ordinal) => (pending?.passages.get(ordinal) ?? '').slice(0, QUOTE_MAX_CHARS))
          .join(' … '),
        sourceTitle: pending.sourceTitle,
      },
    });
    pending = null;
  };

  const emitText = (text: string) => {
    if (text === '') return;
    const full = heldWhitespace + text;
    const shown = full.trimEnd();
    // Trailing whitespace waits: if a marker follows, it goes.
    heldWhitespace = full.slice(shown.length);
    if (shown === '') return;
    releasePending();
    out.push({ type: 'text', text: shown });
  };

  const cite = (passage: ReadPassage) => {
    if (pending && pending.sourceId !== passage.sourceId) releasePending();
    pending ??= {
      sourceId: passage.sourceId,
      sourceTitle: passage.sourceTitle,
      passages: new Map(),
    };
    pending.passages.set(passage.ordinal, passage.text);
  };

  const drain = (final: boolean) => {
    for (;;) {
      const start = buffer.indexOf('[[');
      if (start === -1) {
        // A lone `[` at the end may still open a marker.
        const keep = !final && buffer.endsWith('[') ? 1 : 0;
        emitText(buffer.slice(0, buffer.length - keep));
        buffer = buffer.slice(buffer.length - keep);
        return;
      }
      emitText(buffer.slice(0, start));
      buffer = buffer.slice(start);
      const end = buffer.indexOf(']]');
      const match = end === -1 ? null : MARKER.exec(buffer.slice(2, end));
      if (end === -1 && MARKER_START.test(buffer)) {
        if (final) buffer = '';
        return;
      }
      if (!match?.[1]) {
        // Not a marker after all: the bracket is text.
        emitText(buffer.slice(0, 1));
        buffer = buffer.slice(1);
        continue;
      }
      buffer = buffer.slice(end + 2);
      heldWhitespace = '';
      const passage = resolve(match[1]);
      if (passage) cite(passage);
      else dropped += 1;
    }
  };

  const take = () => {
    const events = out;
    out = [];
    return events;
  };

  return {
    push(chunk) {
      buffer += chunk;
      drain(false);
      return take();
    },
    flush() {
      drain(true);
      releasePending();
      heldWhitespace = '';
      return take();
    },
    dropped: () => dropped,
  };
}
