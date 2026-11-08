/**
 * Parses a multipart request body, reading at most `maxBytes`. A declared
 * Content-Length over the limit is rejected before reading; a body without
 * one, or with an understated one, is cut off as soon as it passes the limit,
 * so an oversized upload is never buffered in full.
 */
export async function readFormDataWithin(
  request: Request,
  maxBytes: number,
): Promise<FormData | 'too_large' | 'invalid'> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return 'too_large';
  if (!request.body) return 'invalid';

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return 'too_large';
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentType = request.headers.get('content-type') ?? '';
  return new Response(body, { headers: { 'content-type': contentType } })
    .formData()
    .catch(() => 'invalid' as const);
}
