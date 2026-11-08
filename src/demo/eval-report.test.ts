import { describe, expect, it } from 'vitest';

import { formatReport, type EvalReport } from './eval-report';

const report: EvalReport = {
  results: [
    {
      id: 'p1-hochrisiko-fristen',
      mode: 'chat',
      costMicroUsd: 4_210,
      cited: ['notizen ×3'],
      added: [],
      checks: [
        { name: 'answered', passed: true, detail: 'complete' },
        { name: 'citations', passed: true, detail: '3/3 valid' },
        { name: 'sources', passed: true, detail: 'all cited' },
        { name: 'key_facts', passed: true, detail: '2/2' },
      ],
    },
    {
      id: 'p1-nicht-abgedeckt',
      mode: 'chat',
      costMicroUsd: 1_000,
      cited: ['notizen ×1', 'ki-mig ×1'],
      added: [],
      checks: [
        { name: 'answered', passed: true, detail: 'complete' },
        { name: 'citations', passed: true, detail: 'none' },
        { name: 'declined', passed: false, detail: 'answered with 2 Citations' },
      ],
    },
    {
      id: 'briefing',
      mode: 'briefing',
      costMicroUsd: 61_500,
      cited: ['wikipedia ×4'],
      added: ['https://www.example.org/presse'],
      checks: [{ name: 'structure', passed: true, detail: 'Überblick, Kernpunkte' }],
    },
  ],
};

describe('formatReport', () => {
  it('prints a Markdown table with one row per result: checks, cited Sources, added URLs, cost, outcome', () => {
    expect(formatReport(report).split('\n')).toEqual([
      '| Eval | Mode | Checks | Cited | Added | Cost | Result |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| p1-hochrisiko-fristen | chat | ✓ answered complete · ✓ citations 3/3 valid · ✓ sources all cited · ✓ key facts 2/2 | notizen ×3 | – | $0.0042 | pass |',
      '| p1-nicht-abgedeckt | chat | ✓ answered complete · ✓ citations none · ✗ declined answered with 2 Citations | notizen ×1, ki-mig ×1 | – | $0.0010 | **FAIL** |',
      '| briefing | briefing | ✓ structure Überblick, Kernpunkte | wikipedia ×4 | https://www.example.org/presse | $0.0615 | pass |',
      '',
      '**2/3 passed** · total cost $0.0667',
    ]);
  });

  it('keeps a pipe in a detail from breaking the table', () => {
    const table = formatReport({
      results: [
        {
          id: 'q',
          mode: 'chat',
          costMicroUsd: 0,
          cited: [],
          added: [],
          checks: [{ name: 'key_facts', passed: false, detail: '0/1, missing: a | b' }],
        },
      ],
    });
    expect(table).toContain('missing: a \\| b');
  });
});
