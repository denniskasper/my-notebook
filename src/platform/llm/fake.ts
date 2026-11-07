import { setTimeout as sleep } from 'node:timers/promises';

import { MODELS } from './models';
import type { ChatRequest, ChatStreamEvent, LlmCitation, Llm, LlmUsage } from './types';

// Roughly what Claude's tokenizer gives for prose; exact enough for cap tests.
const CHARS_PER_TOKEN = 4;
// Slow enough that streaming and stopping can be seen in the UI, fast enough for tests.
const DEFAULT_DELAY_MS = 25;
// The fake cites at most this many documents, like a short real answer would.
const MAX_CITED_DOCUMENTS = 3;

const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/** The scripted stand-in for Claude in development, tests and CI: no key, no cost. */
export function createFakeLlm(options: { delayMs?: number } = {}): Llm {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  return {
    async countTokens(text) {
      return tokensOf(text.length);
    },
    streamChat(request, { signal }) {
      return streamScript(request, script(request), { signal, delayMs, model: MODELS.chat });
    },
    streamBriefing(request, { signal }) {
      return streamScript(request, briefingScript(request), {
        signal,
        delayMs,
        model: MODELS.studio,
      });
    },
  };
}

type Segment = { text: string; citation?: LlmCitation };

function cite(request: ChatRequest, documentIndex: number, block: number): LlmCitation {
  return {
    documentIndex,
    startBlockIndex: block,
    endBlockIndex: block + 1,
    citedText: request.documents[documentIndex]?.blocks[block] ?? '',
  };
}

/**
 * A fixed German answer: one cited sentence for the first block of each
 * document (and the second block of the first one), or a plain "not covered".
 */
function script(request: ChatRequest): Segment[] {
  const [first, ...others] = request.documents;
  if (!first) {
    return [{ text: 'Dazu finde ich in deinen Quellen nichts.' }];
  }
  const segments: Segment[] = [
    { text: 'Laut deinen Quellen ' },
    {
      text: `hält „${first.title}“ das Wesentliche gleich zu Beginn fest`,
      citation: cite(request, 0, 0),
    },
  ];
  if (first.blocks.length > 1) {
    segments.push(
      { text: ', und ' },
      {
        text: 'der folgende Abschnitt ergänzt weitere Einzelheiten',
        citation: cite(request, 0, 1),
      },
    );
  }
  segments.push({ text: '.' });
  others.slice(0, MAX_CITED_DOCUMENTS - 1).forEach((document, index) => {
    segments.push(
      { text: ' ' },
      { text: `Auch „${document.title}“ geht darauf ein`, citation: cite(request, index + 1, 0) },
      { text: '.' },
    );
  });
  return segments;
}

/**
 * A fixed German Briefing in the shape the prompt asks for: an overview citing
 * the first document, then one cited key point per document (up to three).
 */
function briefingScript(request: ChatRequest): Segment[] {
  const [first] = request.documents;
  if (!first) return [{ text: '## Überblick\nDeine Quellen enthalten noch keinen Text.' }];
  const segments: Segment[] = [
    { text: '## Überblick\n' },
    {
      text: `Die Quellen drehen sich um „${first.title}“ und halten das Wesentliche gleich zu Beginn fest.`,
      citation: cite(request, 0, 0),
    },
    { text: '\n\n## Kernpunkte' },
  ];
  request.documents.slice(0, MAX_CITED_DOCUMENTS).forEach((document, index) => {
    segments.push(
      { text: '\n- ' },
      {
        text: `„${document.title}“ nennt den ersten zentralen Punkt.`,
        citation: cite(request, index, 0),
      },
    );
  });
  if (first.blocks.length > 1) {
    segments.push(
      { text: '\n- ' },
      { text: 'Ein weiterer Abschnitt ergänzt die Einzelheiten.', citation: cite(request, 0, 1) },
    );
  }
  return segments;
}

async function* streamScript(
  request: ChatRequest,
  segments: Segment[],
  { signal, delayMs, model }: { signal: AbortSignal; delayMs: number; model: string },
): AsyncGenerator<ChatStreamEvent> {
  const promptChars =
    request.system.length +
    request.documents.reduce((sum, d) => sum + d.blocks.join('').length, 0) +
    request.turns.reduce((sum, t) => sum + t.text.length, 0);
  const usage: LlmUsage = {
    model,
    inputTokens: tokensOf(promptChars),
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  const step = async () => {
    signal.throwIfAborted();
    if (delayMs > 0) await sleep(delayMs, undefined, { signal });
  };

  await step();
  yield { type: 'started', usage };
  let written = 0;
  for (const segment of segments) {
    await step();
    yield { type: 'text_block' };
    if (segment.citation) yield { type: 'citation', citation: segment.citation };
    // Word by word, the way a real stream arrives.
    for (const chunk of segment.text.match(/\S+\s*|\s+/g) ?? []) {
      await step();
      written += chunk.length;
      yield { type: 'text', text: chunk };
    }
  }
  signal.throwIfAborted();
  yield {
    type: 'finished',
    usage: { ...usage, outputTokens: tokensOf(written) },
    stopReason: 'end_turn',
  };
}
