import { describe, expect, it } from 'vitest';

import { createMarkerParser, type MarkerEvent, type ReadPassage } from './markers';

const SOURCE_A = '0190a8c0-0000-7000-8000-00000000000a';
const SOURCE_B = '0190a8c0-0000-7000-8000-00000000000b';

const read = new Map<string, ReadPassage>([
  ['q1-0', { sourceId: SOURCE_A, sourceTitle: 'Gesetz', ordinal: 0, text: 'Erster Absatz.' }],
  ['q1-1', { sourceId: SOURCE_A, sourceTitle: 'Gesetz', ordinal: 1, text: 'Zweiter Absatz.' }],
  ['q2-4', { sourceId: SOURCE_B, sourceTitle: 'Förderung', ordinal: 4, text: 'Zuschuss.' }],
]);

function parse(...chunks: string[]): { events: MarkerEvent[]; dropped: number } {
  const parser = createMarkerParser((id) => read.get(id));
  const events = chunks.flatMap((chunk) => parser.push(chunk));
  events.push(...parser.flush());
  return { events, dropped: parser.dropped() };
}

/** Text and Citations folded into one readable string: chips as {sourceTitle ordinals}. */
function render(events: MarkerEvent[]): string {
  return events
    .map((event) =>
      event.type === 'text'
        ? event.text
        : `{${event.citation.sourceTitle} ${event.citation.ordinals.join(',')}}`,
    )
    .join('');
}

describe('createMarkerParser', () => {
  it('turns a marker for a Passage read in this run into a Citation snapshot', () => {
    const { events, dropped } = parse('Ab 2024 gilt das [[p:q1-0]].');
    expect(render(events)).toBe('Ab 2024 gilt das{Gesetz 0}.');
    expect(events.find((event) => event.type === 'citation')).toEqual({
      type: 'citation',
      citation: {
        sourceId: SOURCE_A,
        ordinals: [0],
        quote: 'Erster Absatz.',
        sourceTitle: 'Gesetz',
      },
    });
    expect(dropped).toBe(0);
  });

  it('drops markers for Passages not read in this run, and counts them', () => {
    const { events, dropped } = parse('Erfunden [[p:q9-3]] und [[p:q1-7]] hier.');
    expect(render(events)).toBe('Erfunden und hier.');
    expect(events.some((event) => event.type === 'citation')).toBe(false);
    expect(dropped).toBe(2);
  });

  it('never shows a marker split across chunks, even half-way', () => {
    const parser = createMarkerParser((id) => read.get(id));
    expect(render(parser.push('Das gilt [['))).toBe('Das gilt');
    expect(render(parser.push('p:q1'))).toBe('');
    expect(render(parser.push('-1]] weiter'))).toBe('{Gesetz 1} weiter');
    expect(render(parser.flush())).toBe('');
  });

  it('holds a marker back when a chunk ends between its two closing brackets', () => {
    const parser = createMarkerParser((id) => read.get(id));
    expect(render(parser.push('Das gilt [[p:q1-1]'))).toBe('Das gilt');
    expect(render(parser.push('] weiter'))).toBe('{Gesetz 1} weiter');
    const unknown = parse('Erfunden [[p:q9-3]', '] hier.');
    expect(render(unknown.events)).toBe('Erfunden hier.');
    expect(unknown.dropped).toBe(1);
  });

  it('merges adjacent markers of one Source into one Citation', () => {
    const { events } = parse('Beides [[p:q1-1]] [[p:q1-0]], dazu [[p:q2-4]][[p:q1-0]].');
    expect(render(events)).toBe('Beides{Gesetz 0,1}, dazu{Förderung 4}{Gesetz 0}.');
    const merged = events.find((event) => event.type === 'citation');
    expect(merged?.type === 'citation' && merged.citation.quote).toBe(
      'Erster Absatz. … Zweiter Absatz.',
    );
  });

  it('keeps brackets that are not markers as text and hides an unfinished marker at the end', () => {
    expect(render(parse('Liste [[a, b]] und [1].').events)).toBe('Liste [[a, b]] und [1].');
    expect(render(parse('Ende [[p:q1-').events)).toBe('Ende');
  });
});
