import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook } from '@/modules/notebooks';
import { addTextSource, processSource, setSourceEnabled } from '@/modules/sources';
import { recordUsage, spendSince } from '@/modules/usage';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { MODELS } from '@/platform/llm';
import { nextBerlinDayStart } from '@/platform/time';
import { resetDatabase } from '@/test/database';

import { failStaleStudioOutputs, listStudioOutputs, runBriefing, startBriefing } from '.';

let visitor: string;
let otherVisitor: string;
let notebook: string;
const start = new Date(Date.now() - 1_000);

beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  otherVisitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'Wärmewende')).id;
});
afterAll(closeDb);

async function addReady(title: string, text: string): Promise<string> {
  const source = await addTextSource(visitor, notebook, { title, text });
  if (!source) throw new Error('Source was not added');
  await processSource(source.id);
  return source.id;
}

/** Starts a Briefing and runs it to its end, as the Server Action does after the response. */
async function generate(visitorId = visitor) {
  const started = await startBriefing(visitorId, notebook);
  if (started.ok) await runBriefing(visitorId, started.output.id);
  return started;
}

const textOf = (content: { text: string }[]) => content.map((part) => part.text).join('');

describe('Briefings', () => {
  it('generates a Briefing from the enabled Sources whose Citations snapshot the Passages', async () => {
    const sourceId = await addReady('Heizungsgesetz', 'Erster Absatz.\n\nZweiter Absatz.');

    const started = await generate();

    expect(started).toMatchObject({ ok: true, output: { kind: 'briefing', status: 'processing' } });
    const [briefing] = await listStudioOutputs(visitor, notebook);
    expect(briefing).toMatchObject({ kind: 'briefing', status: 'complete', errorCode: null });
    expect(textOf(briefing?.content ?? [])).toContain('## Kernpunkte');
    expect(briefing?.content.flatMap((part) => part.citations)).toContainEqual({
      sourceId,
      ordinals: [1],
      quote: 'Zweiter Absatz.',
      sourceTitle: 'Heizungsgesetz',
    });
  });

  it('records the call in the usage ledger as studio', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    await generate();
    expect(await spendSince({ since: start, visitorId: visitor })).toBeGreaterThan(0);
  });

  it('inserts a row per generation and lists them newest first', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    const first = await generate();
    const second = await generate();
    if (!first.ok || !second.ok) throw new Error('not started');

    const outputs = await listStudioOutputs(visitor, notebook);
    expect(outputs.map((output) => output.id)).toEqual([second.output.id, first.output.id]);
    expect(outputs.every((output) => output.status === 'complete')).toBe(true);
  });

  it('grounds a Briefing in enabled Sources only', async () => {
    const off = await addReady('Aus', 'Abgeschaltet.');
    const on = await addReady('An', 'Eingeschaltet.');
    await setSourceEnabled(visitor, notebook, off, false);

    await generate();
    const [briefing] = await listStudioOutputs(visitor, notebook);
    const cited = briefing?.content.flatMap((part) => part.citations.map((c) => c.sourceId));
    expect(new Set(cited)).toEqual(new Set([on]));
  });

  it('refuses without enabled Sources or for another Visitor’s Notebook, storing nothing', async () => {
    expect(await generate()).toEqual({ ok: false, error: 'no_active_sources' });
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    expect(await generate(otherVisitor)).toEqual({ ok: false, error: 'not_found' });
    expect(await listStudioOutputs(otherVisitor, notebook)).toEqual([]);
    expect(await listStudioOutputs(visitor, notebook)).toEqual([]);
  });

  it('refuses a second Briefing while one is still processing', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    const first = await startBriefing(visitor, notebook);
    expect(first.ok).toBe(true);
    expect(await startBriefing(visitor, notebook)).toEqual({ ok: false, error: 'studio_busy' });
  });

  it('does not run another Visitor’s Briefing', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    const started = await startBriefing(visitor, notebook);
    if (!started.ok) throw new Error('not started');
    await runBriefing(otherVisitor, started.output.id);
    expect((await listStudioOutputs(visitor, notebook))[0]?.status).toBe('processing');
  });
});

describe('Briefings and the Budget guard', () => {
  const call = {
    notebookId: null,
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  it('refuses the 4th Briefing in an hour', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    for (let i = 0; i < 3; i += 1) expect((await generate()).ok).toBe(true);

    const refused = await generate();
    expect(refused).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(refused.ok === false && refused.retryAt).toBeInstanceOf(Date);
    expect(await listStudioOutputs(visitor, notebook)).toHaveLength(3);
  });

  it('refuses once the Daily allowance is used up, until midnight in Berlin', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    await recordUsage({
      ...call,
      visitorId: visitor,
      // Chat spend counts against the same allowance; priced at the Studio model to use it up.
      feature: 'chat',
      model: MODELS.studio,
      inputTokens: 1_000,
      outputTokens: 1_000,
    });

    expect(await generate()).toEqual({
      ok: false,
      error: 'daily_allowance',
      retryAt: nextBerlinDayStart(new Date()),
    });
    expect(await listStudioOutputs(visitor, notebook)).toEqual([]);
  });
});

describe('the stale sweep', () => {
  it('fails a Briefing left processing as interrupted, and a late run does not overwrite it', async () => {
    await addReady('Heizungsgesetz', 'Erster Absatz.');
    const started = await startBriefing(visitor, notebook);
    if (!started.ok) throw new Error('not started');

    expect(await failStaleStudioOutputs({ olderThan: new Date(Date.now() - 60_000) })).toBe(0);
    expect(await failStaleStudioOutputs({ olderThan: new Date(Date.now() + 1_000) })).toBe(1);
    await runBriefing(visitor, started.output.id);

    const [briefing] = await listStudioOutputs(visitor, notebook);
    expect(briefing).toMatchObject({ status: 'failed', errorCode: 'interrupted', content: [] });
  });
});
