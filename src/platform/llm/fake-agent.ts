import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

import { env } from '@/platform/env';

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
// Anthropic's price per web search, in dollars.
const WEB_SEARCH_USD = 0.01;
// A task the fake researches the web for (when web search is on).
const RESEARCH_TASK = /recherch|\bweb\b|quelle\w* hinzu/i;
const QUERY_MAX_CHARS = 80;

const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

// The shapes the notebook tools answer in; anything else is treated as empty.
const listedSchema = z.object({
  sources: z.array(z.object({ id: z.string(), title: z.string() })),
});
const readSchema = z.object({ passages: z.array(z.object({ id: z.string(), text: z.string() })) });
const pageSchema = z.object({ url: z.string() });
const addedSchema = z.object({ sourceId: z.string(), title: z.string() });

/**
 * What the fake web search finds: two pages on the fixture server when tests
 * provide one (an official one first), else two placeholder addresses.
 */
function searchResults(): { url: string; title: string }[] {
  const port = env().URL_FETCH_TEST_LOOPBACK_PORT;
  const origin = port === undefined ? 'https://example.com' : `http://127.0.0.1:${port}`;
  return [
    { url: `${origin}/ki-verordnung/bundesnetzagentur`, title: 'Pressemitteilung' },
    { url: `${origin}/ki-verordnung/einordnung`, title: 'Einordnung' },
  ];
}

/** The search query: the task's first sentence (the prompt ends with the task). */
function queryOf(prompt: string): string {
  const task = prompt.split('\n\n').at(-1) ?? prompt;
  const sentence = /^[^.?!]*/.exec(task.trim())?.[0] ?? task;
  return sentence.slice(0, QUERY_MAX_CHARS).trim();
}

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
 * lists the Sources and reads the first two. For a research task (with web
 * search on) it searches once, reads both pages found, adds the first one that
 * could be read as a Source and reads it. It writes a comparison Note if the
 * task mentions one („Notiz“), and answers with Passage markers (one of them
 * invented) and the pages it read but did not add as plain links.
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

  let searches = 0;
  const search = async (query: string) => {
    const gate = request.webSearch;
    if (!gate) return null;
    if (turns >= request.maxTurns) throw new TurnLimit();
    turns += 1;
    const callId = `search-${turns}`;
    if (gate.begin(callId, query) !== null) return null;
    await wait(STEP_DELAY_WORDS);
    const results = searchResults();
    gate.end(callId, true);
    searches += 1;
    readChars += JSON.stringify(results).length;
    return results;
  };

  const sources: { title: string; passageIds: string[] }[] = [];
  const links: string[] = [];
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
    if (request.webSearch && RESEARCH_TASK.test(request.prompt)) {
      yield charge(turnUsage());
      const found = await search(queryOf(request.prompt));
      const pages: string[] = [];
      for (const result of found ?? []) {
        yield charge(turnUsage());
        const page = parseJson(
          pageSchema,
          (await call('read_web_page', { url: result.url })) ?? '',
        );
        if (page) pages.push(page.url);
      }
      const [best, ...others] = pages;
      links.push(...others);
      if (best) {
        yield charge(turnUsage());
        const added = parseJson(addedSchema, (await call('add_url_source', { url: best })) ?? '');
        if (added) {
          yield charge(turnUsage());
          const read = parseJson(
            readSchema,
            (await call('read_source', { sourceId: added.sourceId })) ?? '',
          );
          sources.push({ title: added.title, passageIds: read?.passages.map((p) => p.id) ?? [] });
        } else {
          links.unshift(best);
        }
      }
    }
    if (/notiz/i.test(request.prompt) && sources.length > 0) {
      yield charge(turnUsage());
      noteWritten = (await call('create_note', noteFor(sources))) !== null;
    }
    if (turns >= request.maxTurns) throw new TurnLimit();
  } catch (error) {
    if (!(error instanceof TurnLimit)) throw error;
    yield {
      type: 'finished',
      outcome: 'max_turns',
      costUsd: costOf(total, searches),
      usage: total,
    };
    return;
  }

  await wait();
  yield { type: 'text_block' };
  for (const chunk of answerFor(sources, noteWritten, links).match(/\S+\s*|\s+/g) ?? []) {
    await wait();
    written += chunk.length;
    yield { type: 'text', text: chunk };
  }
  signal.throwIfAborted();
  yield charge({ type: 'usage', usage: usage() });
  yield {
    type: 'finished',
    outcome: 'complete',
    costUsd: costOf(total, searches),
    usage: total,
  };
}

// Like the SDK's reported cost, it includes the web searches.
const costOf = (usage: LlmUsage, searches: number) =>
  usage.inputTokens * INPUT_USD_PER_TOKEN +
  usage.outputTokens * OUTPUT_USD_PER_TOKEN +
  searches * WEB_SEARCH_USD;

const marker = (id: string | undefined) => (id ? ` [[p:${id}]]` : '');

function noteFor(sources: { title: string; passageIds: string[] }[]) {
  const lines = sources.map(
    (source) =>
      `- **${source.title}**: beginnt mit dem Kern der Sache${marker(source.passageIds[0])}.`,
  );
  return { title: 'Vergleich der Quellen', body: `## Gegenüberstellung\n\n${lines.join('\n')}` };
}

function answerFor(
  sources: { title: string; passageIds: string[] }[],
  noteWritten: boolean,
  links: string[],
) {
  if (sources.length === 0) return 'In diesem Notebook finde ich keine aktiven Quellen.';
  const sentences = sources.map((source) => {
    const [first, second] = source.passageIds;
    let sentence = `„${source.title}“ hält das Wesentliche gleich zu Beginn fest${marker(first)}.`;
    if (second) sentence += ` Der folgende Abschnitt ergänzt Einzelheiten${marker(second)}.`;
    return sentence;
  });
  sentences.push(`Eine weitere Stelle ließ sich nicht belegen ${INVENTED_MARKER}.`);
  if (noteWritten) sentences.push('Die Gegenüberstellung steht als Notiz bereit.');
  if (links.length > 0) sentences.push(`Außerdem gelesen: ${links.join(', ')}`);
  return sentences.join(' ');
}
