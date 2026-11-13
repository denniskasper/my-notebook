import { NextResponse } from 'next/server';

import { buildInfo } from '@/platform/build';
import { pingDatabase } from '@/platform/db';
import { env } from '@/platform/env';
import { requestLogger } from '@/platform/logging';

export const dynamic = 'force-dynamic';

/** Liveness for the orchestrator and the deploy job: DB ping, version and running commit. */
export async function GET() {
  // Rollback demo (#45), reverted right after: production runs the real LLM, so its new
  // container never turns healthy and Swarm rolls back; CI runs the fake and stays green.
  if (env().LLM_MODE === 'real') {
    return NextResponse.json({ status: 'degraded', ...buildInfo() }, { status: 503 });
  }
  const database = (await pingDatabase()) ? 'ok' : 'down';
  const body = {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    ...buildInfo(),
  };
  if (database !== 'ok') (await requestLogger()).warn({ event: 'health.degraded', ...body });
  return NextResponse.json(body, {
    status: database === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
