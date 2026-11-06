import { z } from 'zod';

import { askQuestion } from '@/modules/chat';
import { ensureVisitor } from '@/modules/visitors';
import { encodeSseEvent, isSameOrigin, SSE_HEADERS } from '@/platform/http';
import { requestLogger } from '@/platform/logging';
import type { ChatEvent } from '@/ui/chat';

// Streams for as long as the answer takes; never cached or prerendered.
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ question: z.string() });

type Context = { params: Promise<{ notebookId: string }> };

/** Asks a question in the Notebook's Chat; the answer streams back as SSE `ChatEvent`s. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  if (!isSameOrigin(request.headers)) return new Response(null, { status: 403 });
  const notebookId = z.uuid().safeParse((await params).notebookId);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!notebookId.success || !body.success) return new Response(null, { status: 400 });

  const visitorId = await ensureVisitor();
  const log = await requestLogger();
  log.info({ event: 'chat.asked', notebookId: notebookId.data });

  // Stopping (the client aborts the request) or leaving ends the LLM stream;
  // askQuestion still stores the partial answer as `stopped`.
  const stop = new AbortController();
  request.signal.addEventListener('abort', () => stop.abort(), { once: true });

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (open) controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };
      try {
        await askQuestion(
          { visitorId, notebookId: notebookId.data, question: body.data.question },
          { signal: stop.signal, onEvent: send },
        );
      } catch (error) {
        log.error({ event: 'chat.failed', err: error });
        send({ type: 'error', error: 'llm_failed' });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // Already cancelled by the client.
        }
      }
    },
    cancel() {
      stop.abort();
    },
  });

  return new Response(body$, { headers: SSE_HEADERS });
}
