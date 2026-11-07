import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

import { MODELS } from './models';
import type { AgentRequest, AgentStreamEvent, AgentTool, LlmUsage } from './types';

const CHARS_PER_TOKEN = 4;
// Sonnet 5.5's list price in dollars per token, so fake runs cost something plausible.
const INPUT_USD_PER_TOKEN = 2 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 10 / 1_000_000;
// A Step takes this many word delays, so the timeline can be watched (and stopped) in the UI.
const STEP_DELAY_WORDS = 12;
// The fake reads at most this many Sources, like a short real run would.
const MAX_READ_SOURCES = 2;
// A marker for a Passage nobody read: the server must drop it.
const INVENTED_MARKER = '[[p:q99-0]]';

const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

// The shapes the notebook tools answer in; anything else is treated as empty.
const listedSchema = z.object({
  sources: z.array(z.object({ id: z.string(), title: z.string() })),
});
const readSchema = z.object({ passages: z.array(z.object({ id: z.string(), text: z.string() })) });

function parseJson<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

class TurnLimit extends Error {}

/**
 * The scripted Agent: it drives the same tool handlers as the real one. It
 * lists the Sources, reads the first two, writes a comparison Note if the task
 * mentions one („Notiz“), and answers with Passage markers, one of them invented.
 */
export async function* runFakeAgent(
  request: AgentRequest,
  { signal, delayMs }: { signal: AbortSignal; delayMs: number },
): AsyncGenerator<AgentStreamEvent> {
  const wait = async (words = 1) => {
    signal.throwIfAborted();
    if (delayMs > 0) await sleep(delayMs * words, undefined, { signal });
  };
  let turns = 0;
  let readChars = request.system.length + request.prompt.length;
  let written = 0;
  const usage = (): LlmUsage => ({
    model: MODELS.agent,
    inputTokens: tokensOf(readChars),
    outputTokens: tokensOf(written),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  // Each model call reads the prompt so far: what one turn reports as used.
  const turnUsage = (): AgentStreamEvent => ({
    type: 'usage',
    usage: { ...usage(), outputTokens: 0 },
  });
  let total: LlmUsage = { ...usage(), inputTokens: 0 };
  const charge = (event: AgentStreamEvent) => {
    if (event.type === 'usage') {
      total = {
        ...total,
        inputTokens: total.inputTokens + event.usage.inputTokens,
        outputTokens: total.outputTokens + event.usage.outputTokens,
      };
    }
    return event;
  };

  const call = async (name: string, input: unknown): Promise<string | null> => {
    const tool: AgentTool | undefined = request.tools.find((t) => t.name === name);
    if (!tool) return null;
    if (turns >= request.maxTurns) throw new TurnLimit();
    turns += 1;
    await wait(STEP_DELAY_WORDS);
    const result = await tool.run(input);
    signal.throwIfAborted();
    readChars += result.text.length;
    return result.isError ? null : result.text;
  };

  const sources: { title: string; passageIds: string[] }[] = [];
  let noteWritten = false;
  try {
    yield charge(turnUsage());
    const listed = parseJson(listedSchema, (await call('list_sources', {})) ?? '');
    for (const source of listed?.sources.slice(0, MAX_READ_SOURCES) ?? []) {
      yield charge(turnUsage());
      const read = parseJson(
        readSchema,
        (await call('read_source', { sourceId: source.id })) ?? '',
      );
      sources.push({ title: source.title, passageIds: read?.passages.map((p) => p.id) ?? [] });
    }
    if (/notiz/i.test(request.prompt) && sources.length > 0) {
      yield charge(turnUsage());
      noteWritten = (await call('create_note', noteFor(sources))) !== null;
    }
    if (turns >= request.maxTurns) throw new TurnLimit();
  } catch (error) {
    if (!(error instanceof TurnLimit)) throw error;
    yield { type: 'finished', outcome: 'max_turns', costUsd: costOf(total), usage: total };
    return;
  }

  await wait();
  yield { type: 'text_block' };
  for (const chunk of answerFor(sources, noteWritten).match(/\S+\s*|\s+/g) ?? []) {
    await wait();
    written += chunk.length;
    yield { type: 'text', text: chunk };
  }
  signal.throwIfAborted();
  yield charge({ type: 'usage', usage: usage() });
  yield { type: 'finished', outcome: 'complete', costUsd: costOf(total), usage: total };
}

const costOf = (usage: LlmUsage) =>
  usage.inputTokens * INPUT_USD_PER_TOKEN + usage.outputTokens * OUTPUT_USD_PER_TOKEN;

const marker = (id: string | undefined) => (id ? ` [[p:${id}]]` : '');

function noteFor(sources: { title: string; passageIds: string[] }[]) {
  const lines = sources.map(
    (source) =>
      `- **${source.title}**: beginnt mit dem Kern der Sache${marker(source.passageIds[0])}.`,
  );
  return { title: 'Vergleich der Quellen', body: `## Gegenüberstellung\n\n${lines.join('\n')}` };
}

function answerFor(sources: { title: string; passageIds: string[] }[], noteWritten: boolean) {
  if (sources.length === 0) return 'In diesem Notebook finde ich keine aktiven Quellen.';
  const sentences = sources.map((source) => {
    const [first, second] = source.passageIds;
    let sentence = `„${source.title}“ hält das Wesentliche gleich zu Beginn fest${marker(first)}.`;
    if (second) sentence += ` Der folgende Abschnitt ergänzt Einzelheiten${marker(second)}.`;
    return sentence;
  });
  sentences.push(`Eine weitere Stelle ließ sich nicht belegen ${INVENTED_MARKER}.`);
  if (noteWritten) sentences.push('Die Gegenüberstellung steht als Notiz bereit.');
  return sentences.join(' ');
}
