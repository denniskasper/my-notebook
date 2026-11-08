import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseEvalSet } from './evals';

const committed: unknown = JSON.parse(readFileSync('demo/evals.json', 'utf8'));

describe('the committed eval set', () => {
  const evalSet = parseEvalSet(committed);

  it('has about ten questions, one of them not covered by its Sources', () => {
    expect(evalSet.questions.length).toBeGreaterThanOrEqual(10);
    expect(evalSet.questions.filter((question) => question.expectedSources.length === 0)).toEqual([
      expect.objectContaining({ id: 'p1-nicht-abgedeckt', keyFacts: [] }),
    ]);
  });

  it('covers every product scene with a question', () => {
    const scenes = new Set(evalSet.questions.map((question) => question.scene));
    expect([...scenes].filter(Boolean).sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
  });
});

describe('parseEvalSet', () => {
  const question = {
    id: 'q',
    scene: null,
    mode: 'chat',
    question: 'Ab wann?',
    enabledSources: ['notizen'],
    expectedSources: ['notizen'],
    keyFacts: [{ fact: '2027', anyOf: ['2027'] }],
  };
  const sources = [
    {
      key: 'notizen',
      title: 'Meine Notizen zur KI-Verordnung',
      load: { file: 'sources/meine-notizen.md' },
    },
  ];
  const agentSource = {
    key: 'bnetza',
    title: 'Pressemitteilung',
    load: { addedByAgent: { host: 'www.bundesnetzagentur.de' } },
  };

  it('accepts a question citing one of its enabled Sources', () => {
    expect(parseEvalSet({ sources, questions: [question] }).questions).toHaveLength(1);
  });

  it('rejects a Source key that is not in the list of Sources', () => {
    expect(() =>
      parseEvalSet({ sources, questions: [{ ...question, enabledSources: ['ki-mig'] }] }),
    ).toThrow(/ki-mig/);
  });

  it('rejects an expected Source that is not enabled for the question', () => {
    expect(() =>
      parseEvalSet({
        sources: [
          ...sources,
          { key: 'ki-mig', title: 'KI-MIG', load: { pdf: 'local/KI-MIG.pdf' } },
        ],
        questions: [{ ...question, expectedSources: ['ki-mig'] }],
      }),
    ).toThrow(/ki-mig/);
  });

  it('rejects key facts for a question the Sources do not cover', () => {
    expect(() =>
      parseEvalSet({ sources, questions: [{ ...question, expectedSources: [] }] }),
    ).toThrow(/not covered/);
  });

  it('rejects a scene that is not a storyboard scene id', () => {
    expect(() => parseEvalSet({ sources, questions: [{ ...question, scene: 'Szene 2' }] })).toThrow(
      /scene/,
    );
  });

  it('rejects duplicate question ids', () => {
    expect(() => parseEvalSet({ sources, questions: [question, question] })).toThrow(/duplicate/);
  });

  it('rejects a Source without a way to load it', () => {
    expect(() =>
      parseEvalSet({ sources: [{ key: 'notizen', title: 'Notizen' }], questions: [question] }),
    ).toThrow(/load/);
  });

  it('rejects a web page Source whose address is not http(s)', () => {
    expect(() =>
      parseEvalSet({
        sources: [{ key: 'notizen', title: 'Notizen', load: { url: 'file:///etc/passwd' } }],
        questions: [question],
      }),
    ).toThrow(/load/);
  });

  it('lets an Agent question expect a Source the Agent adds', () => {
    const agentQuestion = { ...question, mode: 'agent', expectedSources: ['notizen', 'bnetza'] };
    expect(
      parseEvalSet({ sources: [...sources, agentSource], questions: [agentQuestion] }).questions,
    ).toHaveLength(1);
  });

  it('rejects enabling a Source only the Agent adds', () => {
    expect(() =>
      parseEvalSet({
        sources: [...sources, agentSource],
        questions: [{ ...question, mode: 'agent', enabledSources: ['notizen', 'bnetza'] }],
      }),
    ).toThrow(/bnetza/);
  });
});
