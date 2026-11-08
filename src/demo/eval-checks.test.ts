import { describe, expect, it } from 'vitest';

import { checkAnswer, checkBriefing, type EvalAnswer, type NotebookSource } from './eval-checks';
import type { EvalQuestion } from './evals';

const NOTIZEN = '0190a000-0000-7000-8000-000000000001';
const KI_MIG = '0190a000-0000-7000-8000-000000000002';
const WIKIPEDIA = '0190a000-0000-7000-8000-000000000003';

const sources: NotebookSource[] = [
  { id: NOTIZEN, key: 'notizen', enabled: true, ordinals: [0, 1, 2] },
  { id: KI_MIG, key: 'ki-mig', enabled: true, ordinals: [0, 1] },
  { id: WIKIPEDIA, key: 'wikipedia', enabled: false, ordinals: [0, 1, 2, 3] },
];

const covered: EvalQuestion = {
  id: 'p2-marktueberwachung',
  scene: 'P2',
  mode: 'chat',
  question: 'Welche Behörde überwacht in Deutschland den Markt für KI-Systeme?',
  enabledSources: ['notizen', 'ki-mig'],
  expectedSources: ['notizen', 'ki-mig'],
  keyFacts: [
    { fact: 'Bundesnetzagentur', anyOf: ['Bundesnetzagentur'] },
    { fact: 'Anhang III ab 2. Dezember 2027', anyOf: ['2. Dezember 2027', '02.12.2027'] },
  ],
};

const uncovered: EvalQuestion = {
  ...covered,
  id: 'p1-nicht-abgedeckt',
  question: 'Wie hoch sind die Strompreise für Rechenzentren in Deutschland?',
  expectedSources: [],
  keyFacts: [],
};

const answer = (overrides: Partial<EvalAnswer> = {}): EvalAnswer => ({
  status: 'complete',
  error: null,
  text: 'Die Bundesnetzagentur überwacht den Markt; Anhang III gilt ab 2. Dezember 2027.',
  citations: [
    { sourceId: NOTIZEN, ordinals: [1] },
    { sourceId: KI_MIG, ordinals: [0, 1] },
  ],
  ...overrides,
});

const byName = (checks: ReturnType<typeof checkAnswer>) =>
  Object.fromEntries(checks.map((check) => [check.name, check]));

describe('checkAnswer', () => {
  it('passes a complete answer with valid Citations in every expected Source and all key facts', () => {
    const checks = checkAnswer(covered, answer(), sources);

    expect(checks.map((check) => [check.name, check.passed])).toEqual([
      ['answered', true],
      ['citations', true],
      ['sources', true],
      ['key_facts', true],
    ]);
    expect(byName(checks).key_facts?.detail).toBe('2/2');
  });

  it('fails a Citation to a disabled Source, an unknown Source or a missing Passage', () => {
    const checks = byName(
      checkAnswer(
        covered,
        answer({
          citations: [
            { sourceId: NOTIZEN, ordinals: [1] },
            { sourceId: WIKIPEDIA, ordinals: [0] },
            { sourceId: KI_MIG, ordinals: [7] },
            { sourceId: '0190a000-0000-7000-8000-00000000dead', ordinals: [0] },
          ],
        }),
        sources,
      ),
    );

    expect(checks.citations).toMatchObject({ passed: false, detail: '1/4 valid' });
  });

  it('fails a question that cites no Passage at all', () => {
    expect(
      byName(checkAnswer(covered, answer({ citations: [] }), sources)).citations,
    ).toMatchObject({ passed: false, detail: 'none' });
  });

  it('names the expected Sources the answer does not cite', () => {
    const checks = byName(
      checkAnswer(covered, answer({ citations: [{ sourceId: KI_MIG, ordinals: [0] }] }), sources),
    );

    expect(checks.sources).toMatchObject({ passed: false, detail: 'missing notizen' });
  });

  it('finds key facts case-insensitively and names the missing ones', () => {
    const checks = byName(
      checkAnswer(covered, answer({ text: 'Zuständig ist die BUNDESNETZAGENTUR.' }), sources),
    );

    expect(checks.key_facts).toMatchObject({
      passed: false,
      detail: '1/2, missing: Anhang III ab 2. Dezember 2027',
    });
  });

  it('fails an answer that was stopped or refused, with the reason', () => {
    expect(
      byName(checkAnswer(covered, answer({ status: 'failed', error: 'llm_failed' }), sources))
        .answered,
    ).toMatchObject({ passed: false, detail: 'llm_failed' });
    expect(
      byName(checkAnswer(covered, answer({ status: 'stopped', error: 'agent_timeout' }), sources))
        .answered,
    ).toMatchObject({ passed: false, detail: 'agent_timeout' });
  });

  it('passes an uncovered question that Claude declines without citing anything', () => {
    const checks = checkAnswer(
      uncovered,
      answer({
        text: 'Dazu enthalten deine Quellen keine Informationen. Es fehlen Angaben zu Strompreisen.',
        citations: [],
      }),
      sources,
    );

    expect(checks.map((check) => [check.name, check.passed])).toEqual([
      ['answered', true],
      ['citations', true],
      ['declined', true],
    ]);
  });

  it('fails an uncovered question that is answered with Citations', () => {
    expect(byName(checkAnswer(uncovered, answer(), sources)).declined).toMatchObject({
      passed: false,
      detail: 'answered with 2 Citations',
    });
  });

  it('fails an uncovered question answered without Citations but without saying so', () => {
    expect(
      byName(
        checkAnswer(
          uncovered,
          answer({ text: 'Strom kostet für Rechenzentren etwa 20 Cent je kWh.', citations: [] }),
          sources,
        ),
      ).declined,
    ).toMatchObject({ passed: false, detail: 'did not say the Sources lack it' });
  });
});

describe('checkBriefing', () => {
  const briefing = {
    status: 'complete' as const,
    error: null,
    text: '## Überblick\nDie KI-Verordnung …\n\n## Kernpunkte\n- Die Bundesnetzagentur …',
    citations: [{ sourceId: NOTIZEN, ordinals: [0] }],
  };

  it('passes a complete Briefing with both required sections and valid Citations', () => {
    expect(checkBriefing(briefing, sources).map((check) => [check.name, check.passed])).toEqual([
      ['answered', true],
      ['citations', true],
      ['structure', true],
    ]);
  });

  it('fails a Briefing missing its key points section', () => {
    const checks = checkBriefing({ ...briefing, text: '## Überblick\nNur ein Absatz.' }, sources);
    expect(checks.find((check) => check.name === 'structure')).toMatchObject({
      passed: false,
      detail: 'missing ## Kernpunkte',
    });
  });
});
