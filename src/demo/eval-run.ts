import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { runAgentTask, type AgentEvent } from '@/modules/agent';
import { clearChat, answerQuestion, type ChatEvent } from '@/modules/chat';
import { createNotebook } from '@/modules/notebooks';
import {
  addPdfSource,
  addTextSource,
  addUrlSource,
  getSourceWithPassages,
  listSources,
  processSource,
  setSourceEnabled,
  type Source,
} from '@/modules/sources';
import { listStudioOutputs, runBriefing, startBriefing } from '@/modules/studio';
import { spendSince } from '@/modules/usage';
import { createVisitor } from '@/modules/visitors';

import {
  checkAnswer,
  checkBriefing,
  type EvalAnswer,
  type EvalCitation,
  type NotebookSource,
} from './eval-checks';
import type { EvalReport, EvalResult } from './eval-report';
import type { EvalQuestion, EvalSet, EvalSource } from './evals';
import { parseDemoSource } from './seed';

const NOTEBOOK_TITLE = 'KI-Verordnung (Evals)';

export type EvalRunOptions = {
  /** Where the `load` paths of the eval set's Sources are relative to (`demo/`). */
  demoDir: string;
  evalSet: EvalSet;
  /** Also generate a Briefing from the loaded Sources and check it. */
  briefing: boolean;
  /** Ask only these questions (by id); all of them if not given. */
  only?: readonly string[];
  /** Called as each result comes in, for progress output. */
  onResult?: (result: EvalResult) => void;
};

export type EvalRunReport = EvalReport & { visitorId: string; notebookId: string };

type Scope = { visitorId: string; notebookId: string };

/**
 * Runs the eval set through the app's real paths: a new Visitor and Notebook,
 * the demo Sources added and processed like a Visitor's, then every question
 * asked through Chat or the Agent with only its Sources enabled and no earlier
 * question as history, and optionally a Briefing. Each answer is checked and
 * charged to the Visitor like any other, so the Budget guard applies.
 * Throws before asking anything if a demo Source can't be loaded.
 */
export async function runEvals(options: EvalRunOptions): Promise<EvalRunReport> {
  const { evalSet } = options;
  const questions = selectQuestions(evalSet.questions, options.only);

  const visitorId = await createVisitor({ ipHash: null });
  const notebook = await createNotebook(visitorId, NOTEBOOK_TITLE);
  const scope: Scope = { visitorId, notebookId: notebook.id };

  const loaded = new Map<string, string>();
  for (const source of evalSet.sources) {
    if ('addedByAgent' in source.load) continue;
    const id = await loadSource(scope, source, options.demoDir);
    loaded.set(id, source.key);
  }
  const keyOf = (source: Source) => loaded.get(source.id) ?? agentSourceKey(evalSet, source);

  const results: EvalResult[] = [];
  const record = (result: EvalResult) => {
    results.push(result);
    options.onResult?.(result);
  };

  for (const question of questions) {
    await enableOnly(scope, keyOf, question.enabledSources);
    await clearChat(visitorId, notebook.id);
    const { value: answer, costMicroUsd } = await charged(scope, () => ask(scope, question));
    const sources = await notebookSources(scope, keyOf);
    record({
      id: question.id,
      mode: question.mode,
      checks: checkAnswer(question, answer, sources),
      costMicroUsd,
    });
  }

  if (options.briefing) {
    const demoKeys = [...loaded.values()];
    await enableOnly(scope, keyOf, demoKeys);
    const { value: briefing, costMicroUsd } = await charged(scope, () => generateBriefing(scope));
    const sources = await notebookSources(scope, keyOf);
    record({
      id: 'briefing',
      mode: 'briefing',
      checks: checkBriefing(briefing, sources),
      costMicroUsd,
    });
  }

  return { results, ...scope };
}

function selectQuestions(
  questions: readonly EvalQuestion[],
  only: readonly string[] | undefined,
): EvalQuestion[] {
  if (!only) return [...questions];
  const unknown = only.filter((id) => !questions.some((question) => question.id === id));
  if (unknown.length > 0) throw new Error(`Unknown eval question: ${unknown.join(', ')}`);
  return questions.filter((question) => only.includes(question.id));
}

async function loadSource(scope: Scope, source: EvalSource, demoDir: string): Promise<string> {
  const fail = (reason: string): never => {
    throw new Error(`Demo Source ${source.key} could not be loaded: ${reason}`);
  };
  const { visitorId, notebookId } = scope;
  let added: Source | null = null;

  if ('file' in source.load) {
    const content = await readDemoFile(demoDir, source.load.file);
    if (content === null) return fail(`no file at ${source.load.file}`);
    added = await addTextSource(visitorId, notebookId, parseDemoSource(content.toString('utf8')));
  } else if ('pdf' in source.load) {
    const data = await readDemoFile(demoDir, source.load.pdf);
    if (data === null) {
      return fail(`no PDF at ${source.load.pdf} in the demo directory (see demo/sources.md)`);
    }
    const result = await addPdfSource(visitorId, notebookId, {
      fileName: path.basename(source.load.pdf),
      data: new Uint8Array(data),
    });
    added = result.ok ? result.source : fail(result.error);
  } else if ('url' in source.load) {
    const result = await addUrlSource(visitorId, notebookId, { url: source.load.url });
    added = result.ok ? result.source : fail(result.error);
  }

  if (!added) return fail('the eval Notebook disappeared');
  const processed = await processSource(added.id);
  if (processed?.status !== 'ready') return fail(processed?.errorCode ?? 'not processed');
  return processed.id;
}

async function readDemoFile(demoDir: string, file: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(demoDir, file));
  } catch {
    return null;
  }
}

/** A web page the Agent added counts as the eval Source expected from its host. */
function agentSourceKey(evalSet: EvalSet, source: Source): string | null {
  if (source.url === null) return null;
  const host = new URL(source.url).host;
  const match = evalSet.sources.find(
    (candidate) => 'addedByAgent' in candidate.load && candidate.load.addedByAgent.host === host,
  );
  return match?.key ?? null;
}

async function enableOnly(
  scope: Scope,
  keyOf: (source: Source) => string | null,
  keys: readonly string[],
): Promise<void> {
  for (const source of await listSources(scope.visitorId, scope.notebookId)) {
    const key = keyOf(source);
    const enabled = key !== null && keys.includes(key);
    if (source.enabled === enabled) continue;
    const result = await setSourceEnabled(scope.visitorId, scope.notebookId, source.id, enabled);
    if (!result.ok) throw new Error(`Could not switch Source ${key ?? source.id}: ${result.error}`);
  }
}

async function notebookSources(
  scope: Scope,
  keyOf: (source: Source) => string | null,
): Promise<NotebookSource[]> {
  const sources = await listSources(scope.visitorId, scope.notebookId);
  return Promise.all(
    sources.map(async (source) => {
      const read = await getSourceWithPassages(scope.visitorId, scope.notebookId, source.id);
      return {
        id: source.id,
        key: keyOf(source),
        enabled: source.enabled && source.status === 'ready',
        ordinals: read?.passages.map((passage) => passage.ordinal) ?? [],
      };
    }),
  );
}

/** Runs `work` and reports what the Visitor was charged for it. */
async function charged<T>(
  scope: Scope,
  work: () => Promise<T>,
): Promise<{ value: T; costMicroUsd: number }> {
  // The Visitor is new: everything it was ever charged is this run's.
  const spent = () => spendSince({ since: new Date(0), visitorId: scope.visitorId });
  const before = await spent();
  const value = await work();
  return { value, costMicroUsd: (await spent()) - before };
}

/** Collects an answer's text and Citations from its events, the way the browser would. */
function answerCollector() {
  const texts: string[] = [];
  const answer: EvalAnswer = { status: 'complete', error: null, text: '', citations: [] };
  const onEvent = (event: ChatEvent | AgentEvent) => {
    switch (event.type) {
      case 'text':
        texts[event.part] = (texts[event.part] ?? '') + event.text;
        break;
      case 'citation':
        answer.citations.push(event.citation);
        break;
      case 'done':
        answer.status = event.status;
        if ('reason' in event && event.reason) answer.error = event.reason;
        break;
      case 'error':
        answer.status = 'failed';
        answer.error = event.error;
        break;
    }
  };
  const result = (): EvalAnswer => ({ ...answer, text: texts.filter(Boolean).join('\n') });
  return { onEvent, result };
}

async function ask(scope: Scope, question: EvalQuestion): Promise<EvalAnswer> {
  const collector = answerCollector();
  const signal = new AbortController().signal;
  if (question.mode === 'chat') {
    await answerQuestion(
      { ...scope, question: question.question },
      { signal, onEvent: collector.onEvent },
    );
  } else {
    await runAgentTask(
      { ...scope, task: question.question },
      { signal, onEvent: collector.onEvent },
    );
  }
  return collector.result();
}

async function generateBriefing(scope: Scope): Promise<EvalAnswer> {
  const started = await startBriefing(scope.visitorId, scope.notebookId);
  if (!started.ok) return { status: 'failed', error: started.error, text: '', citations: [] };
  await runBriefing(scope.visitorId, started.output.id);
  const outputs = await listStudioOutputs(scope.visitorId, scope.notebookId);
  const output = outputs.find((candidate) => candidate.id === started.output.id);
  if (!output) return { status: 'failed', error: 'not_found', text: '', citations: [] };
  const citations: EvalCitation[] = output.content.flatMap((part) => part.citations);
  return {
    status: output.status === 'complete' ? 'complete' : 'failed',
    error: output.errorCode,
    text: output.content.map((part) => part.text).join(''),
    citations,
  };
}
