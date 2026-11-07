import { z } from 'zod';

/** Why a PDF upload was refused; each code has a message in `strings.errors.codes`. */
export const PDF_UPLOAD_ERRORS = [
  'not_found',
  'pdf_invalid',
  'pdf_too_large',
  'pdf_no_text',
  'token_cap_exceeded',
] as const;

/** The PDF upload Route Handler's JSON reply, parsed by the upload dialog. */
export const pdfUploadResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), sourceId: z.uuid() }),
  z.object({ ok: z.literal(false), error: z.enum(PDF_UPLOAD_ERRORS) }),
]);

export type PdfUploadResponse = z.infer<typeof pdfUploadResponseSchema>;
