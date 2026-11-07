import { extractTextItems, getDocumentProxy } from 'unpdf';

import { logger } from '@/platform/logging';

import { SOURCE_TEXT_MAX_LENGTH, SOURCE_TITLE_MAX_LENGTH } from './input';
import { pdfPassages, type PdfPassageDraft } from './pdf-passages';

// Text PDFs of the size the token cap allows stay far below this; scans and image-heavy files don't.
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
// Below this many characters per page there is no real text layer: a scan, maybe with a stray header.
const MIN_CHARS_PER_PAGE = 16;

export type PdfError = 'pdf_invalid' | 'pdf_too_large' | 'pdf_no_text' | 'token_cap_exceeded';

/**
 * Reads a PDF's text layer into page-aware Passages. The bytes are only held
 * in memory for this call: uploads are never stored.
 */
export async function extractPdfPassages(
  data: Uint8Array,
): Promise<{ ok: true; passages: PdfPassageDraft[] } | { ok: false; error: PdfError }> {
  if (data.byteLength > PDF_MAX_BYTES) return { ok: false, error: 'pdf_too_large' };
  if (!startsWithPdfHeader(data)) return { ok: false, error: 'pdf_invalid' };

  let pages: Awaited<ReturnType<typeof extractTextItems>>;
  try {
    // A copy: PDF.js may take over (detach) the buffer it is given.
    const document = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 });
    try {
      pages = await extractTextItems(document);
    } finally {
      // Frees PDF.js's parsed document; the bytes go with it.
      await document.loadingTask.destroy();
    }
  } catch (error) {
    logger().info({ event: 'source.pdf_unreadable', err: error });
    return { ok: false, error: 'pdf_invalid' };
  }

  const passages = pdfPassages(pages.items);
  const chars = passages.reduce((sum, passage) => sum + passage.text.replace(/\s/g, '').length, 0);
  if (chars < MIN_CHARS_PER_PAGE * Math.max(pages.totalPages, 1)) {
    return { ok: false, error: 'pdf_no_text' };
  }
  // Far more text than the token cap allows: don't store Passages that can never be enabled.
  const length = passages.reduce((sum, passage) => sum + passage.text.length, 0);
  if (length > SOURCE_TEXT_MAX_LENGTH) return { ok: false, error: 'token_cap_exceeded' };
  return { ok: true, passages };
}

function startsWithPdfHeader(data: Uint8Array): boolean {
  // `%PDF-` may follow a little leading junk; PDF readers search the first KB for it.
  const head = new TextDecoder('latin1').decode(data.subarray(0, 1024));
  return head.includes('%PDF-');
}

/** A Source title from the uploaded file's name: without the `.pdf` extension. */
export function titleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_\s]+/g, ' ')
    .trim();
  return (base || fileName).slice(0, SOURCE_TITLE_MAX_LENGTH);
}
