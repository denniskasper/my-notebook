import { headers } from 'next/headers';
import pino, { type Logger } from 'pino';

import { env } from '@/platform/env';
import { REQUEST_ID_HEADER } from '@/platform/http';

export type { Logger };

let base: Logger | undefined;

/** The process-wide JSON logger (stdout). */
export function logger(): Logger {
  base ??= pino({
    level: env().LOG_LEVEL,
    base: { commit: env().COMMIT },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
  return base;
}

/** A child logger carrying the current request's id (set by the proxy). */
export async function requestLogger(): Promise<Logger> {
  const requestId = (await headers()).get(REQUEST_ID_HEADER) ?? undefined;
  return logger().child({ requestId });
}
