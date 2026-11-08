import type { EvalQuestion } from './evals';

/** A Citation as far as the checks care: which Passages of which Source it points to. */
export type EvalCitation = { sourceId: string; ordinals: readonly number[] };

/** What an answer (or a Briefing) came to, collected from its events. */
export type EvalAnswer = {
  status: 'complete' | 'stopped' | 'failed';
  /** Why it did not complete: an error code or the cap that stopped it. */
  error: string | null;
  text: string;
  citations: EvalCitation[];
};

/** A Source in the eval Notebook right after the answer, with its eval key if it has one. */
export type NotebookSource = {
  id: string;
  key: string | null;
  enabled: boolean;
  ordinals: readonly number[];
};

export type CheckName =
  'answered' | 'citations' | 'sources' | 'key_facts' | 'declined' | 'structure';

export type Check = { name: CheckName; passed: boolean; detail: string };

// Saying the Sources lack something takes a word for the Sources and a negation.
const MENTIONS_SOURCES = /quelle|unterlage|notiz|dokument|text/i;
const NEGATION = /\b(nicht|nichts|kein\w*|fehl\w*)\b/i;
const BRIEFING_SECTIONS = ['## Überblick', '## Kernpunkte'];

// Non-breaking and narrow spaces (as in „2. Dezember“) must not hide a key fact.
const normalize = (text: string) => text.replace(/\s+/g, ' ').toLowerCase();

/** Passes if nothing is missing; otherwise names what is. */
function missingCheck(
  name: CheckName,
  missing: readonly string[],
  {
    ok,
    prefix = 'missing ',
    separator = ', ',
  }: { ok: string; prefix?: string; separator?: string },
): Check {
  return {
    name,
    passed: missing.length === 0,
    detail: missing.length === 0 ? ok : `${prefix}${missing.join(separator)}`,
  };
}

function answered(answer: EvalAnswer): Check {
  const passed = answer.status === 'complete' && answer.error === null;
  return {
    name: 'answered',
    passed,
    detail: passed ? 'complete' : (answer.error ?? answer.status),
  };
}

/** Every Citation must point to existing Passages of a Source that was enabled. */
function citationsValid(
  answer: EvalAnswer,
  sources: readonly NotebookSource[],
  { required }: { required: boolean },
): Check {
  if (answer.citations.length === 0)
    return { name: 'citations', passed: !required, detail: 'none' };
  const byId = new Map(sources.map((source) => [source.id, source]));
  const valid = answer.citations.filter((citation) => {
    const source = byId.get(citation.sourceId);
    if (!source?.enabled) return false;
    return (
      citation.ordinals.length > 0 &&
      citation.ordinals.every((ordinal) => source.ordinals.includes(ordinal))
    );
  });
  return {
    name: 'citations',
    passed: valid.length === answer.citations.length,
    detail: `${valid.length}/${answer.citations.length} valid`,
  };
}

function expectedSourcesCited(
  question: EvalQuestion,
  answer: EvalAnswer,
  sources: readonly NotebookSource[],
): Check {
  const keyOf = new Map(sources.map((source) => [source.id, source.key]));
  const cited = new Set(answer.citations.map((citation) => keyOf.get(citation.sourceId)));
  const missing = question.expectedSources.filter((key) => !cited.has(key));
  return missingCheck('sources', missing, { ok: 'all cited' });
}

function keyFactsFound(question: EvalQuestion, answer: EvalAnswer): Check {
  const text = normalize(answer.text);
  const missing = question.keyFacts.filter(
    (fact) => !fact.anyOf.some((variant) => text.includes(normalize(variant))),
  );
  const found = question.keyFacts.length - missing.length;
  const count = `${found}/${question.keyFacts.length}`;
  return missingCheck(
    'key_facts',
    missing.map((f) => f.fact),
    { ok: count, prefix: `${count}, missing: `, separator: '; ' },
  );
}

function declined(answer: EvalAnswer): Check {
  if (answer.citations.length > 0) {
    return {
      name: 'declined',
      passed: false,
      detail: `answered with ${answer.citations.length} Citations`,
    };
  }
  const saysSo = MENTIONS_SOURCES.test(answer.text) && NEGATION.test(answer.text);
  return {
    name: 'declined',
    passed: saysSo,
    detail: saysSo ? 'said the Sources lack it' : 'did not say the Sources lack it',
  };
}

/**
 * The checks for one eval question: it was answered, its Citations are valid,
 * and either it cites every expected Source and states every key fact, or (if
 * its Sources don't cover it) it declines without citing anything.
 */
export function checkAnswer(
  question: EvalQuestion,
  answer: EvalAnswer,
  sources: readonly NotebookSource[],
): Check[] {
  const covered = question.expectedSources.length > 0;
  const checks = [answered(answer), citationsValid(answer, sources, { required: covered })];
  if (!covered) return [...checks, declined(answer)];
  return [
    ...checks,
    expectedSourcesCited(question, answer, sources),
    keyFactsFound(question, answer),
  ];
}

/** The checks for a Briefing: complete, valid Citations, and the sections the prompt asks for. */
export function checkBriefing(briefing: EvalAnswer, sources: readonly NotebookSource[]): Check[] {
  const missing = BRIEFING_SECTIONS.filter((heading) => !briefing.text.includes(heading));
  return [
    answered(briefing),
    citationsValid(briefing, sources, { required: true }),
    missingCheck('structure', missing, { ok: 'Überblick, Kernpunkte' }),
  ];
}
