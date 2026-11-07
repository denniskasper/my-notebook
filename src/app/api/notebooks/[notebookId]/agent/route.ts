import { z } from 'zod';

import { runAgentTask, type AgentEvent } from '@/modules/agent';
import { ensureVisitor } from '@/modules/visitors';
import { encodeSseEvent, isSameOrigin, SSE_HEADERS } from '@/platform/http';
import { requestLogger } from '@/platform/logging';
import type { ChatEvent as WireChatEvent } from '@/ui/chat';

// Streams for as long as the run takes; never cached or prerendered.
export const dynamic = 'force-dynamic';
// Above the Agent's own wall-clock cap (AGENT_TIMEOUT_SECONDS), so the run ends first.
export const maxDuration = 300;

const bodySchema = z.object({ task: z.string() });

type Context = { params: Promise<{ notebookId: string }> };

/** Gives the Agent a task in the Notebook; its run streams back as SSE `AgentEvent`s. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  if (!isSameOrigin(request.headers)) return new Response(null, { status: 403 });
  const notebookId = z.uuid().safeParse((await params).notebookId);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!notebookId.success || !body.success) return new Response(null, { status: 400 });

  const visitorId = await ensureVisitor();
  const log = await requestLogger();
  log.info({ event: 'agent.task_received', notebookId: notebookId.data });

  // Stopping (the client aborts the request) or leaving ends the run;
  // runAgentTask still stores the partial run as `stopped`.
  const stop = new AbortController();
  request.signal.addEventListener('abort', () => stop.abort(), { once: true });

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AgentEvent) => {
        // `satisfies` keeps the module's events in step with the schema the client parses.
        if (open) controller.enqueue(encoder.encode(encodeSseEvent(event satisfies WireChatEvent)));
      };
      try {
        await runAgentTask(
          { visitorId, notebookId: notebookId.data, task: body.data.task },
          { signal: stop.signal, onEvent: send },
        );
      } catch (error) {
        log.error({ event: 'agent.failed', err: error });
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
