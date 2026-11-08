import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';

import { addPdfSource, PDF_MAX_BYTES, processSource } from '@/modules/sources';
import { ensureVisitor } from '@/modules/visitors';
import { isSameOrigin, readFormDataWithin } from '@/platform/http';
import { requestLogger } from '@/platform/logging';
import type { PdfUploadResponse } from '@/ui/sources';

export const dynamic = 'force-dynamic';

// Room for the multipart envelope around a file at the size limit.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

type Context = { params: Promise<{ notebookId: string }> };

function reply(body: PdfUploadResponse, status: number): Response {
  return Response.json(body, { status });
}

/**
 * Uploads a PDF (multipart field `file`) as a new Source. Its text is
 * extracted into Passages during the request and the file is dropped;
 * token counting runs after the response, as for pasted text.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  if (!isSameOrigin(request.headers)) return new Response(null, { status: 403 });
  const notebookId = z.uuid().safeParse((await params).notebookId);
  if (!notebookId.success) return reply({ ok: false, error: 'not_found' }, 404);

  const form = await readFormDataWithin(request, PDF_MAX_BYTES + MULTIPART_OVERHEAD_BYTES);
  if (form === 'too_large') return reply({ ok: false, error: 'pdf_too_large' }, 413);
  const file = form === 'invalid' ? null : form.get('file');
  if (!(file instanceof File)) return reply({ ok: false, error: 'pdf_invalid' }, 400);
  const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!looksLikePdf) return reply({ ok: false, error: 'pdf_invalid' }, 415);
  if (file.size > PDF_MAX_BYTES) return reply({ ok: false, error: 'pdf_too_large' }, 413);

  const visitorId = await ensureVisitor();
  const result = await addPdfSource(visitorId, notebookId.data, {
    fileName: file.name,
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const log = await requestLogger();
  if (!result.ok) {
    log.info({ event: 'source.pdf_rejected', notebookId: notebookId.data, error: result.error });
    return reply(result, result.error === 'not_found' ? 404 : 422);
  }

  log.info({ event: 'source.added', sourceId: result.source.id, kind: 'pdf' });
  after(async () => {
    await processSource(result.source.id);
  });
  revalidatePath(`/notebooks/${notebookId.data}`);
  return reply({ ok: true, sourceId: result.source.id }, 201);
}
