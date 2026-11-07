import { z } from 'zod';

import {
  finishAnswer,
  listHistory,
  saveStreamingParts,
  startExchange,
  type Citation,
  type MessagePart,
  type StepPart,
  type TextPart,
} from '@/modules/chat';
import { getNotebook } from '@/modules/notebooks';
import {
  checkUsage,
  costMicroUsd,
  recordUsage,
  withAgentSlot,
  type UsageBlock,
} from '@/modules/usage';
import { env } from '@/platform/env';
import { llm, type AgentOutcome, type LlmUsage } from '@/platform/llm';
import { logger, type Logger } from '@/platform/logging';

import { createMarkerParser, type MarkerEvent } from './markers';
import { AGENT_PLUGIN_DIR } from './plugin';
import { AGENT_SYSTEM_PROMPT, buildAgentPrompt } from './prompt';
import { createNotebookTools, type StepUpdate } from './tools';

export const AGENT_TASK_MAX_LENGTH = 4_000;

/** An Agent task: trimmed, 1–4000 characters. */
export const agentTaskSchema = z.string().trim().min(1).max(AGENT_TASK_MAX_LENGTH);

export type AgentErrorCode =
  'not_found' | 'invalid_task' | 'chat_busy' | 'agent_busy' | 'llm_failed' | UsageBlock['reason'];

/** Why a run ended early on its own: a cap, ending it like Stop. */
export type AgentStopReason = 'agent_max_turns' | 'agent_max_budget' | 'agent_timeout';

/** What an Agent run reports, in order (the Route Handler sends them as SSE). */
export type AgentEvent =
  | { type: 'started'; userMessageId: string; assistantMessageId: string }
  | { type: 'text'; part: number; text: string }
  | { type: 'citation'; part: number; citation: Citation }
  /** A Step started or ended; it replaces the part at `part`. */
  | { type: 'step'; part: number; step: StepPart }
  | { type: 'note_created'; noteId: string }
  /** The Agent added a web page as a Source (still processing). */
  | { type: 'source_added'; sourceId: string }
  /** `costMicroUsd`: what the run was charged. */
  | {
      type: 'done';
      status: 'complete' | 'stopped';
      reason?: AgentStopReason;
      costMicroUsd: number;
    }
  /** `retryAt` (ISO): when a Budget guard refusal ends, if it ends on its own. */
  | { type: 'error'; error: AgentErrorCode; retryAt?: string };

/** The caps of one run (Budget guard); env values by default. */
export type AgentLimits = {
  maxTurns: number;
  maxBudgetUsd: number;
  timeoutMs: number;
  maxNotes: number;
  maxWebSearches: number;
  maxPageReads: number;
  maxSourcesAdded: number;
};

// What Anthropic charges per web search, in micro-dollars ($0.01).
const WEB_SEARCH_MICRO_USD = 10_000;

type Options = {
  /** Aborted when the Visitor stops the run (or goes away). */
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void | Promise<void>;
  limits?: Partial<AgentLimits>;
};

function defaultLimits(): AgentLimits {
  const config = env();
  return {
    maxTurns: config.AGENT_MAX_TURNS,
    maxBudgetUsd: config.AGENT_MAX_BUDGET_USD,
    timeoutMs: config.AGENT_TIMEOUT_SECONDS * 1_000,
    maxNotes: config.AGENT_MAX_NOTES,
    maxWebSearches: config.AGENT_MAX_WEB_SEARCHES,
    maxPageReads: config.AGENT_MAX_PAGE_READS,
    maxSourcesAdded: config.AGENT_MAX_SOURCES_ADDED,
  };
}

const STOP_REASONS: Partial<Record<AgentOutcome, AgentStopReason>> = {
  max_turns: 'agent_max_turns',
  max_budget: 'agent_max_budget',
};

/**
 * Runs the Agent on a task in the Notebook: stores the task and a `streaming`
 * answer, streams its Steps, text and Citations, and stores the run as
 * `complete`, `stopped` (Stop, disconnect or a cap, with the cap as reason) or
 * `failed`. The Budget guard and an Agent slot are checked first; a refused
 * run stores nothing. The run is charged what the SDK reports.
 */
export async function runAgentTask(
  input: { visitorId: string; notebookId: string; task: string },
  { signal, onEvent, limits: overrides = {} }: Options,
): Promise<void> {
  const emit = async (event: AgentEvent) => {
    try {
      await onEvent(event);
    } catch (error) {
      // The consumer is gone; the run is still finished and stored.
      logger().debug({ event: 'agent.emit_failed', err: error });
    }
  };

  const task = agentTaskSchema.safeParse(input.task);
  if (!task.success) return emit({ type: 'error', error: 'invalid_task' });
  const { visitorId, notebookId } = input;
  if (!(await getNotebook(visitorId, notebookId))) {
    return emit({ type: 'error', error: 'not_found' });
  }

  const block = await checkUsage({ visitorId, feature: 'agent' });
  if (block) {
    logger().info({ event: 'agent.refused', reason: block.reason });
    return emit({
      type: 'error',
      error: block.reason,
      ...(block.retryAt && { retryAt: block.retryAt.toISOString() }),
    });
  }

  const slot = await withAgentSlot(async () => {
    const started = await startExchange({ notebookId, question: task.data, mode: 'agent' });
    if (!started) return emit({ type: 'error', error: 'chat_busy' });
    await emit({ type: 'started', ...started });
    const log = logger().child({ agentRunId: started.assistantMessageId, notebookId });
    log.info({ event: 'agent.started' });
    await runInSlot(
      { visitorId, notebookId, task: task.data, messageId: started.assistantMessageId },
      { signal, emit, log, limits: { ...defaultLimits(), ...overrides } },
    );
  });
  if (!slot.ok) {
    logger().info({ event: 'agent.refused', reason: slot.reason });
    await emit({ type: 'error', error: slot.reason });
  }
}

type Run = {
  status: 'complete' | 'stopped' | 'failed';
  reason: AgentStopReason | null;
  parts: MessagePart[];
  /** What the SDK reported at the end (web searches included), if it got there. */
  costUsd: number | null;
  /** All model calls, as the SDK reported them at the end or as seen before an abort. */
  usage: LlmUsage | null;
};

async function runInSlot(
  scope: { visitorId: string; notebookId: string; task: string; messageId: string },
  {
    signal,
    emit,
    log,
    limits,
  }: {
    signal: AbortSignal;
    emit: (event: AgentEvent) => Promise<void>;
    log: Logger;
    limits: AgentLimits;
  },
): Promise<void> {
  const run: Run = { status: 'complete', reason: null, parts: [], costUsd: null, usage: null };
  // Stop, disconnect and the wall-clock cap all abort the run alike.
  const abort = new AbortController();
  let timedOut = false;
  const stop = () => abort.abort();
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, limits.timeoutMs);

  // Events from tool handlers and the stream are applied one after another.
  let queue = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch((error: unknown) => {
      log.error({ event: 'agent.event_failed', err: error });
    });
    return queue;
  };

  const onStep = (update: StepUpdate) =>
    enqueue(async () => {
      const step: StepPart = { type: 'step', ...update };
      let index = run.parts.findIndex((part) => part.type === 'step' && part.id === step.id);
      if (index === -1) {
        run.parts.push(step);
        index = run.parts.length - 1;
      } else {
        run.parts[index] = step;
      }
      log.info({ event: 'agent.step', tool: step.tool, status: step.status });
      await emit({ type: 'step', part: index, step });
      await saveStreamingParts(scope.messageId, run.parts);
    });

  const toolbox = createNotebookTools(scope, {
    maxNotes: limits.maxNotes,
    maxWebSearches: limits.maxWebSearches,
    maxPageReads: limits.maxPageReads,
    maxSourcesAdded: limits.maxSourcesAdded,
    onStep: (step) => void onStep(step),
    onNoteCreated: (noteId) => void enqueue(() => emit({ type: 'note_created', noteId })),
    onSourceAdded: (sourceId) => void enqueue(() => emit({ type: 'source_added', sourceId })),
    onMarkersDropped: (dropped) => log.warn({ event: 'agent.note_markers_dropped', dropped }),
  });
  const parser = createMarkerParser(toolbox.passage);
  const show = (events: MarkerEvent[]) =>
    enqueue(async () => {
      for (const event of events) await showMarkerEvent(run.parts, event, emit);
    });

  const calls: LlmUsage[] = [];
  let wroteText = false;
  try {
    const history = await listHistory(scope.visitorId, scope.notebookId);
    const stream = llm().runAgent(
      {
        system: AGENT_SYSTEM_PROMPT,
        prompt: buildAgentPrompt(history, scope.task),
        tools: toolbox.tools,
        webSearch: toolbox.webSearch,
        plugins: [AGENT_PLUGIN_DIR],
        maxTurns: limits.maxTurns,
        maxBudgetUsd: limits.maxBudgetUsd,
      },
      { signal: abort.signal },
    );
    for await (const event of stream) {
      switch (event.type) {
        case 'text_block':
          // A new stretch of text after earlier text is a new paragraph.
          if (wroteText) await show(parser.push('\n\n'));
          break;
        case 'text':
          wroteText = true;
          await show(parser.push(event.text));
          break;
        case 'usage':
          calls.push(event.usage);
          break;
        case 'finished': {
          run.costUsd = event.costUsd;
          run.usage = event.usage;
          if (event.outcome === 'failed') run.status = 'failed';
          const reason = STOP_REASONS[event.outcome];
          if (reason) {
            run.status = 'stopped';
            run.reason = reason;
          }
          break;
        }
      }
    }
  } catch (error) {
    if (abort.signal.aborted) {
      run.status = 'stopped';
      run.reason = timedOut ? 'agent_timeout' : null;
    } else {
      run.status = 'failed';
      log.error({ event: 'agent.llm_failed', err: error });
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
  await show(parser.flush());
  await queue;
  if (parser.dropped() > 0) log.warn({ event: 'agent.markers_dropped', dropped: parser.dropped() });

  // A Step cut off by the end of the run did not finish.
  run.parts = run.parts.map((part) =>
    part.type === 'step' && part.status === 'running' ? { ...part, status: 'failed' } : part,
  );
  run.usage ??= sumUsage(calls);
  const cost = runCost(run, toolbox.webSearches());
  await recordRunUsage(scope, run.usage, cost, log);
  const stored = await finishAnswer(scope.messageId, {
    status: run.status,
    parts: run.parts,
    errorCode: run.status === 'failed' ? 'llm_failed' : run.reason,
    costMicroUsd: cost,
  });
  log.info({
    event: stored ? `agent.${run.status}` : 'agent.finish_skipped',
    reason: run.reason,
    costMicroUsd: cost,
    webSearches: toolbox.webSearches(),
  });

  if (run.status === 'failed') await emit({ type: 'error', error: 'llm_failed' });
  else {
    await emit({
      type: 'done',
      status: run.status,
      ...(run.reason && { reason: run.reason }),
      costMicroUsd: cost,
    });
  }
}

/**
 * What the run is charged, in micro-dollars: the SDK's reported cost, which
 * includes web searches, or for a run cut short its model calls so far plus a
 * cent per search that ran.
 */
function runCost(run: Run, webSearches: number): number {
  if (run.costUsd !== null) return Math.ceil(run.costUsd * 1_000_000);
  if (!run.usage) return 0;
  return costMicroUsd(run.usage.model, run.usage) + webSearches * WEB_SEARCH_MICRO_USD;
}

/**
 * Adds resolved text to the answer: text continues the last text part unless
 * that already has Citations (they render after its text) or a Step came since.
 */
async function showMarkerEvent(
  parts: MessagePart[],
  event: MarkerEvent,
  emit: (event: AgentEvent) => Promise<void>,
): Promise<void> {
  const last = parts.at(-1);
  const open = last?.type === 'text' ? last : null;
  const fresh = (): TextPart => {
    const part: TextPart = { type: 'text', text: '', citations: [] };
    parts.push(part);
    return part;
  };
  if (event.type === 'text') {
    const part = open && open.citations.length === 0 ? open : fresh();
    part.text += event.text;
    await emit({ type: 'text', part: parts.indexOf(part), text: event.text });
  } else {
    const part = open ?? fresh();
    part.citations.push(event.citation);
    await emit({ type: 'citation', part: parts.indexOf(part), citation: event.citation });
  }
}

function sumUsage(calls: readonly LlmUsage[]): LlmUsage | null {
  const [first, ...rest] = calls;
  if (!first) return null;
  return rest.reduce(
    (sum, call) => ({
      ...sum,
      inputTokens: sum.inputTokens + call.inputTokens,
      outputTokens: sum.outputTokens + call.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + call.cacheReadTokens,
      cacheWriteTokens: sum.cacheWriteTokens + call.cacheWriteTokens,
    }),
    first,
  );
}

async function recordRunUsage(
  scope: { visitorId: string; notebookId: string },
  usage: LlmUsage | null,
  cost: number,
  log: Logger,
): Promise<void> {
  // A run that never reached the model was not billed.
  if (!usage) return;
  try {
    await recordUsage({
      visitorId: scope.visitorId,
      notebookId: scope.notebookId,
      feature: 'agent',
      ...usage,
      costMicroUsd: cost,
    });
  } catch (error) {
    log.error({ event: 'usage.record_failed', err: error });
  }
}
