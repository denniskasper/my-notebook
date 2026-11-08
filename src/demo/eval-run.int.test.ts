import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { listMessages } from '@/modules/chat';
import { listSources } from '@/modules/sources';
import { closeDb } from '@/platform/db';
import { resetDatabase } from '@/test/database';
import { textPdf } from '@/test/pdf';

import { runEvals } from './eval-run';
import { parseEvalSet, type EvalSet } from './evals';

// The integration caps are sized to trip after a few calls; an eval run makes many.
vi.stubEnv('DAILY_ALLOWANCE_USD', '5');
vi.stubEnv('DEMO_BUDGET_DAILY_USD', '5');
vi.stubEnv('DEMO_BUDGET_TOTAL_USD', '5');

const PORT = Number(process.env.URL_FETCH_TEST_LOOPBACK_PORT);
const ORIGIN = `http://127.0.0.1:${PORT}`;
// The web page Source, and the press release the fake Agent's web search finds and adds.
const PAGES: Record<string, string> = {
  '/wiki/ki-verordnung': `<!doctype html><html><head><meta charset="utf-8">
<title>Verordnung über künstliche Intelligenz</title></head><body><article>
<p>Die Verordnung verbietet seit dem 2. Februar 2025 bestimmte KI-Praktiken.</p>
<p>Bußgelder reichen bis zu 35 Millionen Euro.</p>
</article></body></html>`,
  '/ki-verordnung/bundesnetzagentur': `<!doctype html><html><head><meta charset="utf-8">
<title>Bundesnetzagentur übernimmt zentrale Rolle</title></head><body><article>
<p>Die Bundesnetzagentur wird zentrale Marktüberwachungsbehörde für KI-Systeme.</p>
</article></body></html>`,
};

let server: Server;
beforeAll(async () => {
  server = createServer((request, response) => {
    const page = PAGES[request.url ?? ''];
    response.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page ?? '');
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

let demoDir: string;
beforeEach(async () => {
  await resetDatabase();
  demoDir = await mkdtemp(path.join(tmpdir(), 'evals-'));
  await mkdir(path.join(demoDir, 'sources'));
  await writeFile(
    path.join(demoDir, 'sources', 'notizen.md'),
    '# Meine Notizen\n\nDie Pflichten für Hochrisiko-KI gelten ab 2. Dezember 2027.\n\nMein Risiko-Log hat drei Felder.',
  );
  await mkdir(path.join(demoDir, 'local'));
  await writeFile(
    path.join(demoDir, 'local', 'KI-MIG.pdf'),
    textPdf([['§ 1 Zweck des Gesetzes.', '', '§ 2 Die Bundesnetzagentur ist zuständig.']]),
  );
});
afterEach(() => rm(demoDir, { recursive: true, force: true }));

const sources: EvalSet['sources'] = [
  { key: 'notizen', title: 'Meine Notizen', load: { file: 'sources/notizen.md' } },
  { key: 'ki-mig', title: 'KI-MIG', load: { pdf: 'local/KI-MIG.pdf' } },
  { key: 'wikipedia', title: 'Wikipedia', load: { url: `${ORIGIN}/wiki/ki-verordnung` } },
  {
    key: 'bnetza',
    title: 'Pressemitteilung',
    load: { addedByAgent: { host: `127.0.0.1:${PORT}` } },
  },
];

// Key facts the fake's fixed answers contain, so a passing question can pass.
const evalSet = parseEvalSet({
  sources,
  questions: [
    {
      id: 'zwei-quellen',
      scene: 'P2',
      mode: 'chat',
      question: 'Welche Behörde ist zuständig?',
      enabledSources: ['notizen', 'ki-mig'],
      expectedSources: ['notizen', 'ki-mig'],
      keyFacts: [{ fact: 'beruft sich auf die Quellen', anyOf: ['Laut deinen Quellen'] }],
    },
    {
      id: 'nicht-abgedeckt',
      scene: 'P1',
      mode: 'chat',
      question: 'Wie hoch sind die Strompreise?',
      enabledSources: ['notizen'],
      expectedSources: [],
      keyFacts: [],
    },
    {
      id: 'agent',
      scene: 'P4',
      mode: 'agent',
      question: 'Recherchiere den Stand der Umsetzung, füge eine offizielle Quelle hinzu.',
      enabledSources: ['notizen', 'ki-mig'],
      expectedSources: ['notizen', 'bnetza'],
      keyFacts: [{ fact: 'Notizen', anyOf: ['Meine Notizen'] }],
    },
    {
      id: 'nur-wikipedia',
      scene: null,
      mode: 'chat',
      question: 'Welche Praktiken sind verboten?',
      enabledSources: ['wikipedia'],
      expectedSources: ['wikipedia'],
      keyFacts: [{ fact: 'Titel der Seite', anyOf: ['Verordnung über künstliche Intelligenz'] }],
    },
  ],
});

const outcome = (result: { checks: { name: string; passed: boolean }[] } | undefined) =>
  Object.fromEntries(result?.checks.map((check) => [check.name, check.passed]) ?? []);

const names = (cited: readonly { name: string }[] | undefined) => cited?.map(({ name }) => name);

// The fake streams word by word, and a run asks several questions and runs an Agent.
describe('runEvals', { timeout: 30_000 }, () => {
  it('asks every question in a fresh Notebook with the demo Sources and checks each answer', async () => {
    const report = await runEvals({ demoDir, evalSet, briefing: true });

    expect(report.results.map((result) => [result.id, result.mode])).toEqual([
      ['zwei-quellen', 'chat'],
      ['nicht-abgedeckt', 'chat'],
      ['agent', 'agent'],
      ['nur-wikipedia', 'chat'],
      ['briefing', 'briefing'],
    ]);
    const [twoSources, uncovered, agent, onlyWikipedia, briefing] = report.results;
    expect(outcome(twoSources)).toEqual({
      answered: true,
      citations: true,
      sources: true,
      key_facts: true,
    });
    // The fake answers from its Sources even when they don't cover the question.
    expect(outcome(uncovered)).toEqual({ answered: true, citations: true, declined: false });
    // The press release the Agent adds counts as `bnetza`; its invented marker is dropped.
    expect(outcome(agent)).toEqual({
      answered: true,
      citations: true,
      sources: true,
      key_facts: true,
    });
    // Only Wikipedia is enabled: the fake cites nothing else, so the switches took effect.
    expect(outcome(onlyWikipedia)).toEqual({
      answered: true,
      citations: true,
      sources: true,
      key_facts: true,
    });
    expect(outcome(briefing)).toEqual({ answered: true, citations: true, structure: true });
    expect(report.results.every((result) => result.costMicroUsd > 0)).toBe(true);
    expect(report.visitorId).toEqual(expect.any(String));
    expect(report.notebookId).toEqual(expect.any(String));
  });

  it('reports which Sources each answer cited and which Sources the Agent added', async () => {
    const report = await runEvals({ demoDir, evalSet, briefing: false });

    const byId = Object.fromEntries(report.results.map((result) => [result.id, result]));
    expect(names(byId['zwei-quellen']?.cited)).toEqual(['notizen', 'ki-mig']);
    expect(byId['zwei-quellen']?.added).toEqual([]);
    expect(names(byId['agent']?.cited)).toContain('bnetza');
    expect(byId['agent']?.added).toEqual([`${ORIGIN}/ki-verordnung/bundesnetzagentur`]);
  });

  it('asks each question without the earlier ones as history', async () => {
    const report = await runEvals({ demoDir, evalSet, briefing: false });

    const messages = await listMessages(report.visitorId, report.notebookId);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[0]?.parts).toEqual([
      expect.objectContaining({ text: 'Welche Praktiken sind verboten?' }),
    ]);
  });

  it('runs the Briefing on the loaded demo Sources, without the one the Agent added', async () => {
    const report = await runEvals({ demoDir, evalSet, briefing: true });

    const notebookSources = await listSources(report.visitorId, report.notebookId);
    expect(notebookSources.map((source) => [source.kind, source.enabled])).toEqual([
      ['text', true],
      ['pdf', true],
      ['url', true],
      ['url', false],
    ]);
  });

  it('runs only the questions asked for', async () => {
    const report = await runEvals({ demoDir, evalSet, briefing: false, only: ['nicht-abgedeckt'] });

    expect(report.results.map((result) => result.id)).toEqual(['nicht-abgedeckt']);
  });

  it('stops before asking anything when a demo Source fails to load', async () => {
    const broken = parseEvalSet({
      sources: [
        { key: 'wikipedia', title: 'Wikipedia', load: { url: `${ORIGIN}/fehlt` } },
        ...sources.filter((source) => source.key !== 'wikipedia'),
      ],
      questions: evalSet.questions,
    });

    await expect(runEvals({ demoDir, evalSet: broken, briefing: false })).rejects.toThrow(
      /wikipedia.*url_/,
    );
  });

  it('says where to put the PDF when its local copy is missing', async () => {
    await rm(path.join(demoDir, 'local'), { recursive: true });

    await expect(runEvals({ demoDir, evalSet, briefing: false })).rejects.toThrow(
      /ki-mig.*local\/KI-MIG\.pdf/,
    );
  });
});
