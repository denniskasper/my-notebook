import { NextResponse } from 'next/server';

import { pingDatabase } from '@/platform/db';
import { env } from '@/platform/env';
import { requestLogger } from '@/platform/logging';

import packageJson from '../../../../package.json';

export const dynamic = 'force-dynamic';

/** Liveness for Swarm and the deploy job: DB ping, version and running commit. */
export async function GET() {
  const database = (await pingDatabase()) ? 'ok' : 'down';
  const body = {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    version: packageJson.version,
    commit: env().COMMIT,
  };
  if (database !== 'ok') (await requestLogger()).warn({ event: 'health.degraded', ...body });
  return NextResponse.json(body, {
    status: database === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
