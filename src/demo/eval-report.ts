import type { Check, CheckName, CitedSource } from './eval-checks';

/** One eval question (or the Briefing) with its checks and what it cost. */
export type EvalResult = {
  id: string;
  mode: 'chat' | 'agent' | 'briefing';
  checks: Check[];
  /** The Sources the answer cited, with how often, so a failed check shows why. */
  cited: CitedSource[];
  /** The URLs of the Sources the Agent added while answering. */
  added: string[];
  costMicroUsd: number;
};

export type EvalReport = { results: EvalResult[] };

const CHECK_LABELS: Record<CheckName, string> = {
  answered: 'answered',
  citations: 'citations',
  sources: 'sources',
  key_facts: 'key facts',
  declined: 'declined',
  structure: 'structure',
};

/** A result passes if every one of its checks does. */
export const resultPassed = (result: EvalResult) => result.checks.every((check) => check.passed);

const usd = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(4)}`;
const listCell = (items: readonly string[]) => (items.length === 0 ? '–' : items.join(', '));
const escapeCell = (text: string) => text.replaceAll('|', '\\|');

function checksCell(checks: readonly Check[]): string {
  return checks
    .map((check) => `${check.passed ? '✓' : '✗'} ${CHECK_LABELS[check.name]} ${check.detail}`)
    .join(' · ');
}

/** The eval summary as Markdown: one table row per result, then the pass count and total cost. */
export function formatReport(report: EvalReport): string {
  const rows = report.results.map((result) =>
    [
      result.id,
      result.mode,
      checksCell(result.checks),
      listCell(result.cited.map(({ name, count }) => `${name} ×${count}`)),
      listCell(result.added),
      usd(result.costMicroUsd),
      resultPassed(result) ? 'pass' : '**FAIL**',
    ]
      .map(escapeCell)
      .join(' | '),
  );
  const passed = report.results.filter(resultPassed).length;
  const total = report.results.reduce((sum, result) => sum + result.costMicroUsd, 0);
  return [
    '| Eval | Mode | Checks | Cited | Added | Cost | Result |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
    '',
    `**${passed}/${report.results.length} passed** · total cost ${usd(total)}`,
  ].join('\n');
}
