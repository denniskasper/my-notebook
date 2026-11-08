import { describe, expect, it } from 'vitest';

import { readFormDataWithin } from '.';

/** A streamed request without Content-Length, as a chunked upload would arrive. */
function streamed(chunks: Uint8Array[], contentType: string): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request('http://localhost/upload', {
    method: 'POST',
    body,
    headers: { 'content-type': contentType },
    duplex: 'half',
  } as RequestInit);
}

async function multipart(fileBytes: number): Promise<{ bytes: Uint8Array; contentType: string }> {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(fileBytes)], 'a.pdf', { type: 'application/pdf' }));
  const encoded = new Response(form);
  return {
    bytes: new Uint8Array(await encoded.arrayBuffer()),
    contentType: encoded.headers.get('content-type') ?? '',
  };
}

describe('readFormDataWithin', () => {
  it('parses a body within the limit', async () => {
    const { bytes, contentType } = await multipart(1000);
    const result = await readFormDataWithin(streamed([bytes], contentType), 10_000);
    expect(result).not.toBe('too_large');
    expect(result).not.toBe('invalid');
    const file = (result as FormData).get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).size).toBe(1000);
  });

  it('stops reading once a body without Content-Length passes the limit', async () => {
    const { bytes, contentType } = await multipart(5000);
    const half = Math.floor(bytes.length / 2);
    const result = await readFormDataWithin(
      streamed([bytes.slice(0, half), bytes.slice(half)], contentType),
      3000,
    );
    expect(result).toBe('too_large');
  });

  it('rejects a declared Content-Length over the limit without reading the body', async () => {
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '999999', 'content-type': 'multipart/form-data; boundary=b' },
    });
    expect(await readFormDataWithin(request, 100)).toBe('too_large');
  });

  it('reports a body that is not form data as invalid', async () => {
    expect(await readFormDataWithin(streamed([new Uint8Array([1, 2, 3])], 'text/plain'), 100)).toBe(
      'invalid',
    );
  });
});
