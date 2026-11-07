import { z } from 'zod';

import type { Citation, StepPart } from '@/modules/chat';
import { createNote, noteTitleSchema, type NoteCitations } from '@/modules/notes';
import { getSourceWithPassages, listPromptSources, listSources } from '@/modules/sources';
import type { AgentTool, AgentToolResult } from '@/platform/llm';

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
  /** Notes one run may write (Budget guard: 2). */
  maxNotes?: number;
  /** How much Passage text one `read_source` call returns before it truncates. */
  readMaxChars?: number;
};

export type NotebookToolbox = {
  tools: AgentTool[];
  /** A Passage read in this run, by the id `read_source` gave it. */
  passage(id: string): ReadPassage | undefined;
};

const DEFAULT_MAX_NOTES = 2;
// About 6K tokens: enough for a few pages, small enough to read several Sources in one run.
const DEFAULT_READ_MAX_CHARS = 24_000;

/** A failure the Agent sees as the tool's result, so it can adapt. */
class ToolRefusal extends Error {}

type Handler = (input: unknown, begin: (argument: string | null) => void) => Promise<unknown>;

/**
 * The notebook tools of an Agent run (`list_sources`, `read_source`,
 * `create_note`), scoped to one Notebook. Each call is a Step, reported through
 * `onStep`. Results are JSON; refusals come back as `isError` results.
 */
export function createNotebookTools(
  scope: AgentScope,
  options: NotebookToolOptions = {},
): NotebookToolbox {
  const maxNotes = options.maxNotes ?? DEFAULT_MAX_NOTES;
  const readMaxChars = options.readMaxChars ?? DEFAULT_READ_MAX_CHARS;
  // Source id → its number in this run (q1, q2, …), and every Passage read so far.
  const sourceKeys = new Map<string, string>();
  const read = new Map<string, ReadPassage>();
  let notesWritten = 0;
  let steps = 0;

  const asStep =
    (name: string, handler: Handler) =>
    async (input: unknown): Promise<AgentToolResult> => {
      steps += 1;
      const step: StepUpdate = { id: `s${steps}`, tool: name, argument: null, status: 'running' };
      let begun = false;
      const begin = (argument: string | null) => {
        if (begun) return;
        begun = true;
        step.argument = argument;
        options.onStep?.({ ...step });
      };
      try {
        const result = await handler(input, begin);
        begin(null);
        options.onStep?.({ ...step, status: 'done' });
        return { text: JSON.stringify(result) };
      } catch (error) {
        begin(null);
        options.onStep?.({ ...step, status: 'failed' });
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

  return {
    tools: [listSourcesTool, readSourceTool, createNoteTool],
    passage: (id) => read.get(id),
  };
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
