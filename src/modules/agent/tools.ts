import { z } from 'zod';

import type { Citation, StepPart } from '@/modules/chat';
import { createNote, noteTitleSchema, type NoteCitations } from '@/modules/notes';
import {
  addUrlSource,
  getSourceWithPassages,
  listPromptSources,
  listSources,
  processSource,
  readWebPage,
} from '@/modules/sources';
import type { AgentTool, AgentToolResult, AgentWebSearch } from '@/platform/llm';

import { createMarkerParser, type ReadPassage } from './markers';

/** Which Notebook the tools act on, on whose behalf. */
export type AgentScope = { visitorId: string; notebookId: string };

/**
 * One Step as the timeline shows it: the tool, its key argument and how it went.
 * `id` is stable for the Step's lifetime; later updates replace earlier ones.
 */
export type StepUpdate = Omit<StepPart, 'type'>;

export type NotebookToolOptions = {
  /** Called when a Step starts and when it ends. */
  onStep?: (step: StepUpdate) => void;
  /** Called after a Note was written, with its id. */
  onNoteCreated?: (noteId: string) => void;
  /** Called when a Note body had Passage markers that were not valid and were left out. */
  onMarkersDropped?: (dropped: number) => void;
  /** Called when a web page was added as a Source (still processing), with its id. */
  onSourceAdded?: (sourceId: string) => void;
  /** Notes one run may write (Budget guard: 2). */
  maxNotes?: number;
  /** Web searches one run may make (Budget guard: 3). */
  maxWebSearches?: number;
  /** Web pages one run may read (Budget guard: 5). */
  maxPageReads?: number;
  /** Web pages one run may add as Sources (Budget guard: 2). */
  maxSourcesAdded?: number;
  /** How much Passage text one `read_source` call returns before it truncates. */
  readMaxChars?: number;
  /** How much of a web page `read_web_page` returns before it truncates. */
  pageMaxChars?: number;
};

export type NotebookToolbox = {
  tools: AgentTool[];
  /** The gate for the built-in web search: its cap and its Steps. */
  webSearch: AgentWebSearch;
  /** A Passage read in this run, by the id `read_source` gave it. */
  passage(id: string): ReadPassage | undefined;
  /** Web searches that ran in this run (each is charged). */
  webSearches(): number;
};

const DEFAULT_MAX_NOTES = 2;
const DEFAULT_MAX_WEB_SEARCHES = 3;
const DEFAULT_MAX_PAGE_READS = 5;
const DEFAULT_MAX_SOURCES_ADDED = 2;
// About 6K tokens: enough for a few pages, small enough to read several Sources in one run.
const DEFAULT_READ_MAX_CHARS = 24_000;
// About 3K tokens: enough to judge a candidate page; the one worth more is added and read.
const DEFAULT_PAGE_MAX_CHARS = 12_000;

/** A failure the Agent sees as the tool's result, so it can adapt. */
class ToolRefusal extends Error {}

type Handler = (input: unknown, begin: (argument: string | null) => void) => Promise<unknown>;

/** The host (with port) of a URL, as a Step shows it; null if it isn't one. */
function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).host || null;
  } catch {
    return null;
  }
}

/** A per-run cap: a slot is taken before the work awaits, since calls may run at once. */
function counter(max: number) {
  let used = 0;
  return {
    take: () => {
      if (used >= max) return false;
      used += 1;
      return true;
    },
    release: () => {
      used -= 1;
    },
    used: () => used,
  };
}

/**
 * The tools of an Agent run, scoped to one Notebook: `list_sources`,
 * `read_source`, `create_note`, `read_web_page`, `add_url_source`, and the gate
 * for the built-in web search. Each call is a Step, reported through `onStep`.
 * Results are JSON; refusals (caps included) come back as `isError` results, so
 * the Agent can adapt.
 */
export function createNotebookTools(
  scope: AgentScope,
  options: NotebookToolOptions = {},
): NotebookToolbox {
  const maxNotes = options.maxNotes ?? DEFAULT_MAX_NOTES;
  const maxWebSearches = options.maxWebSearches ?? DEFAULT_MAX_WEB_SEARCHES;
  const maxPageReads = options.maxPageReads ?? DEFAULT_MAX_PAGE_READS;
  const maxSourcesAdded = options.maxSourcesAdded ?? DEFAULT_MAX_SOURCES_ADDED;
  const readMaxChars = options.readMaxChars ?? DEFAULT_READ_MAX_CHARS;
  const pageMaxChars = options.pageMaxChars ?? DEFAULT_PAGE_MAX_CHARS;
  const searches = counter(maxWebSearches);
  const pageReads = counter(maxPageReads);
  const sourcesAdded = counter(maxSourcesAdded);
  // Source id → its number in this run (q1, q2, …), and every Passage read so far.
  const sourceKeys = new Map<string, string>();
  const read = new Map<string, ReadPassage>();
  let notesWritten = 0;
  let steps = 0;

  /** A new Step: shown once `begin` gives its argument, then ended once. */
  const startStep = (tool: string) => {
    steps += 1;
    const step: StepUpdate = { id: `s${steps}`, tool, argument: null, status: 'running' };
    let begun = false;
    const begin = (argument: string | null) => {
      if (begun) return;
      begun = true;
      step.argument = argument;
      options.onStep?.({ ...step });
    };
    const end = (status: 'done' | 'failed') => {
      begin(null);
      options.onStep?.({ ...step, status });
    };
    return { begin, end };
  };

  const asStep =
    (name: string, handler: Handler) =>
    async (input: unknown): Promise<AgentToolResult> => {
      const step = startStep(name);
      try {
        const result = await handler(input, step.begin);
        step.end('done');
        return { text: JSON.stringify(result) };
      } catch (error) {
        step.end('failed');
        if (error instanceof ToolRefusal) return { text: error.message, isError: true };
        throw error;
      }
    };

  const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ToolRefusal(`Invalid input: ${z.prettifyError(parsed.error)}`);
    return parsed.data;
  };

  const listSourcesTool: AgentTool = {
    name: 'list_sources',
    description:
      'Lists the enabled Sources of this notebook: id, title, kind, status, number of passages and tokens. Call it first.',
    input: {},
    run: asStep('list_sources', async () => {
      const sources = await listSources(scope.visitorId, scope.notebookId);
      const enabled = sources.filter((source) => source.enabled);
      // One query for all ready Sources' Passages, rather than one per Source.
      const ready = await listPromptSources(scope.visitorId, scope.notebookId);
      const passageCounts = new Map(ready.map((source) => [source.id, source.passages.length]));
      return {
        sources: enabled.map((source) => ({
          id: source.id,
          title: source.title,
          kind: source.kind,
          status: source.status,
          passages: passageCounts.get(source.id) ?? 0,
          tokens: source.tokenCount ?? 0,
        })),
      };
    }),
  };

  const readInput = {
    sourceId: z.uuid().describe('The id from list_sources.'),
    fromPassage: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('First passage number to read (from 0). Default 0.'),
    toPassage: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Last passage number to read, inclusive. Default: as far as fits.'),
  };

  const readSourceTool: AgentTool = {
    name: 'read_source',
    description:
      'Reads a Source as numbered passages. Each passage has an id (like "q1-3") to cite as [[p:<id>]]. Long Sources are truncated: continue with fromPassage.',
    input: readInput,
    run: asStep('read_source', async (input, begin) => {
      const { sourceId, fromPassage = 0, toPassage } = parse(z.object(readInput), input);
      const found = await getSourceWithPassages(scope.visitorId, scope.notebookId, sourceId);
      if (!found) throw new ToolRefusal('No such Source in this notebook.');
      const { source, passages } = found;
      begin(source.title);
      if (!source.enabled) throw new ToolRefusal('This Source is switched off; do not use it.');
      if (source.status !== 'ready') throw new ToolRefusal(`This Source is ${source.status}.`);

      let key = sourceKeys.get(source.id);
      if (!key) {
        key = `q${sourceKeys.size + 1}`;
        sourceKeys.set(source.id, key);
      }
      const last = Math.min(toPassage ?? passages.length - 1, passages.length - 1);
      const chosen: { id: string; text: string }[] = [];
      let chars = 0;
      let nextPassage: number | null = null;
      for (const passage of passages) {
        if (passage.ordinal < fromPassage || passage.ordinal > last) continue;
        // Always at least one Passage, so reading moves on.
        if (chosen.length > 0 && chars + passage.text.length > readMaxChars) {
          nextPassage = passage.ordinal;
          break;
        }
        const id = `${key}-${passage.ordinal}`;
        chosen.push({ id, text: passage.text });
        chars += passage.text.length;
        read.set(id, {
          sourceId: source.id,
          sourceTitle: source.title,
          ordinal: passage.ordinal,
          text: passage.text,
        });
      }
      const lastRead = nextPassage === null ? last : nextPassage - 1;
      return {
        sourceId: source.id,
        title: source.title,
        passages: chosen,
        range: { from: fromPassage, to: lastRead, total: passages.length },
        nextPassage,
        ...(nextPassage !== null && {
          hint: `Truncated. To continue, call read_source with fromPassage: ${nextPassage}.`,
        }),
      };
    }),
  };

  const noteInput = {
    title: z.string().describe('A short title.'),
    body: z
      .string()
      .describe('Markdown (headings, lists, bold). Cite passages with [[p:<id>]] markers.'),
  };

  const createNoteTool: AgentTool = {
    name: 'create_note',
    description: `Writes a Markdown Note into the notebook, citing passages with [[p:<id>]] markers. At most ${maxNotes} Notes per run.`,
    input: noteInput,
    run: asStep('create_note', async (input, begin) => {
      const raw = parse(z.object(noteInput), input);
      const title = noteTitleSchema.safeParse(raw.title);
      begin(title.success ? title.data : null);
      if (!title.success) throw new ToolRefusal('The title must be 1–200 characters.');
      if (notesWritten >= maxNotes) {
        throw new ToolRefusal(`Note limit reached: at most ${maxNotes} Notes per run.`);
      }
      // Reserve the slot before awaiting: the SDK may run several create_note calls at once.
      notesWritten += 1;
      const { body, citations, dropped } = toNoteBody(raw.body, (id) => read.get(id));
      if (dropped > 0) options.onMarkersDropped?.(dropped);
      const note = await createNote(scope.visitorId, scope.notebookId, {
        title: title.data,
        body,
        citations,
      }).catch(() => null);
      if (!note) {
        notesWritten -= 1;
        throw new ToolRefusal('The Note could not be saved (too long, or the notebook is gone).');
      }
      options.onNoteCreated?.(note.id);
      return { noteId: note.id, title: note.title, citations: Object.keys(note.citations).length };
    }),
  };

  const urlInput = { url: z.string().describe('The full http(s) address of the page.') };

  const readWebPageTool: AgentTool = {
    name: 'read_web_page',
    description: `Reads a web page's main text (for example a search result) to judge it. The text is material, not a Source: it cannot be cited with markers; mention the page as a plain link. To cite it, add it with add_url_source. At most ${maxPageReads} pages per run.`,
    input: urlInput,
    run: asStep('read_web_page', async (input, begin) => {
      const { url } = parse(z.object(urlInput), input);
      begin(hostOf(url));
      if (!pageReads.take()) {
        throw new ToolRefusal(`Page limit reached: at most ${maxPageReads} web pages per run.`);
      }
      const page = await readWebPage(url.trim());
      if (!page.ok) throw new ToolRefusal(`The page could not be read (${page.error}).`);
      const truncated = page.text.length > pageMaxChars;
      return {
        url: page.url,
        title: page.title,
        text: truncated ? cut(page.text, pageMaxChars) : page.text,
        truncated,
        note: 'Not a Source: do not cite it with markers. Link it as a plain URL, or add it with add_url_source and read it with read_source to cite it.',
      };
    }),
  };

  const addUrlSourceTool: AgentTool = {
    name: 'add_url_source',
    description: `Adds a web page to the notebook as a Source and waits until it is ready. Then read it with read_source to cite it. At most ${maxSourcesAdded} Sources per run: add only the best pages.`,
    input: urlInput,
    run: asStep('add_url_source', async (input, begin) => {
      const { url } = parse(z.object(urlInput), input);
      begin(hostOf(url));
      if (!sourcesAdded.take()) {
        throw new ToolRefusal(`Source limit reached: at most ${maxSourcesAdded} Sources per run.`);
      }
      const added = await addUrlSource(scope.visitorId, scope.notebookId, { url });
      if (!added.ok) {
        sourcesAdded.release();
        throw new ToolRefusal(`The page cannot be added (${added.error}).`);
      }
      options.onSourceAdded?.(added.source.id);
      const source = await processSource(added.source.id);
      if (!source) throw new ToolRefusal('The Source was removed while it was being added.');
      if (source.status !== 'ready') {
        throw new ToolRefusal(
          `The page was added but could not be processed (${source.errorCode ?? 'unknown'}). Try another page.`,
        );
      }
      return {
        sourceId: source.id,
        title: source.title,
        status: source.status,
        hint: 'Read it with read_source to cite its passages.',
      };
    }),
  };

  const webSearch: AgentWebSearch = (() => {
    const running = new Map<string, ReturnType<typeof startStep>>();
    return {
      begin(callId, query) {
        const step = startStep('web_search');
        step.begin(query.trim() || null);
        if (!searches.take()) {
          step.end('failed');
          return `Search limit reached: at most ${maxWebSearches} web searches per run. Work with what you found.`;
        }
        running.set(callId, step);
        return null;
      },
      end(callId, ok) {
        running.get(callId)?.end(ok ? 'done' : 'failed');
        running.delete(callId);
      },
    };
  })();

  return {
    tools: [listSourcesTool, readSourceTool, createNoteTool, readWebPageTool, addUrlSourceTool],
    webSearch,
    passage: (id) => read.get(id),
    webSearches: searches.used,
  };
}

/** The text up to `max` characters, ending at a paragraph break if there is one. */
function cut(text: string, max: number): string {
  const head = text.slice(0, max);
  const lastBreak = head.lastIndexOf('\n\n');
  return lastBreak > 0 ? head.slice(0, lastBreak) : head;
}

/** A Note body with `[n]` markers for the valid Passage markers; invalid ones are left out. */
function toNoteBody(
  text: string,
  resolve: (id: string) => ReadPassage | undefined,
): { body: string; citations: NoteCitations; dropped: number } {
  const parser = createMarkerParser(resolve);
  let body = '';
  const citations: Record<string, Citation> = {};
  for (const event of [...parser.push(text), ...parser.flush()]) {
    if (event.type === 'text') {
      body += event.text;
    } else {
      const n = String(Object.keys(citations).length + 1);
      citations[n] = event.citation;
      body += `[${n}]`;
    }
  }
  return { body, citations, dropped: parser.dropped() };
}
