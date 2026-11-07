import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook } from '@/modules/notebooks';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { resetDatabase } from '@/test/database';
import { scannedPdf, textPdf } from '@/test/pdf';

import { addPdfSource, getSourceWithPassages, listSources, PDF_MAX_BYTES, processSource } from '.';

let visitor: string;
let otherVisitor: string;
let notebook: string;

beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  otherVisitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'KI-Verordnung')).id;
});
afterAll(closeDb);

const twoPages = textPdf([
  [
    'Die KI-Verordnung ordnet KI-Systeme nach ihrem Risiko.',
    '',
    'Verboten ist das soziale Scoring',
    'durch Behörden.',
  ],
  ['Hochrisiko-Systeme brauchen ein Risiko-', 'management und eine Dokumentation.'],
]);

describe('addPdfSource', () => {
  it('extracts the text into page-aware Passages and adds the Source as processing', async () => {
    const result = await addPdfSource(visitor, notebook, {
      fileName: 'ki-verordnung.pdf',
      data: twoPages,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.source).toMatchObject({
      kind: 'pdf',
      title: 'ki-verordnung',
      status: 'processing',
    });

    const read = await getSourceWithPassages(visitor, notebook, result.source.id);
    expect(read?.passages.map(({ ordinal, text, page }) => ({ ordinal, text, page }))).toEqual([
      { ordinal: 0, text: 'Die KI-Verordnung ordnet KI-Systeme nach ihrem Risiko.', page: 1 },
      { ordinal: 1, text: 'Verboten ist das soziale Scoring durch Behörden.', page: 1 },
      {
        ordinal: 2,
        text: 'Hochrisiko-Systeme brauchen ein Risikomanagement und eine Dokumentation.',
        page: 2,
      },
    ]);
  });

  it('counts tokens and applies the cap like a text Source', async () => {
    const added = await addPdfSource(visitor, notebook, { fileName: 'a.pdf', data: twoPages });
    if (!added.ok) throw new Error(added.error);
    const processed = await processSource(added.source.id);
    expect(processed).toMatchObject({ status: 'ready', tokenCount: expect.any(Number) });

    // The integration cap is 1000 tokens, about 4000 characters with the fake.
    const line = 'Ein langer Satz über Anforderungen an Hochrisiko-Systeme und deren Pflichten.';
    const big = textPdf(Array.from({ length: 4 }, () => Array.from({ length: 16 }, () => line)));
    const tooMuch = await addPdfSource(visitor, notebook, { fileName: 'b.pdf', data: big });
    if (!tooMuch.ok) throw new Error(tooMuch.error);
    expect(await processSource(tooMuch.source.id)).toMatchObject({
      status: 'failed',
      errorCode: 'token_cap_exceeded',
    });
  });

  it('rejects a scanned PDF without a text layer and adds nothing', async () => {
    const result = await addPdfSource(visitor, notebook, {
      fileName: 'scan.pdf',
      data: scannedPdf(3),
    });
    expect(result).toEqual({ ok: false, error: 'pdf_no_text' });
    expect(await listSources(visitor, notebook)).toEqual([]);
  });

  it('rejects a file that is not a PDF, or one over the size limit', async () => {
    const notPdf = new TextEncoder().encode('Nur ein Text, kein PDF.');
    expect(await addPdfSource(visitor, notebook, { fileName: 'x.pdf', data: notPdf })).toEqual({
      ok: false,
      error: 'pdf_invalid',
    });
    const broken = twoPages.slice(0, 200);
    expect(await addPdfSource(visitor, notebook, { fileName: 'x.pdf', data: broken })).toEqual({
      ok: false,
      error: 'pdf_invalid',
    });
    const huge = new Uint8Array(PDF_MAX_BYTES + 1);
    expect(await addPdfSource(visitor, notebook, { fileName: 'x.pdf', data: huge })).toEqual({
      ok: false,
      error: 'pdf_too_large',
    });
    expect(await listSources(visitor, notebook)).toEqual([]);
  });

  it('does not add to another Visitor’s Notebook', async () => {
    expect(
      await addPdfSource(otherVisitor, notebook, { fileName: 'a.pdf', data: twoPages }),
    ).toEqual({ ok: false, error: 'not_found' });
  });
});
