import type { Env } from '@/platform/env';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Why the demo seed must not run against this database, or null if it may.
 * Demo data is for local and e2e databases only: production Notebooks are built
 * by hand in the UI, so the seed refuses production and any non-local host.
 */
export function seedRefusal(target: {
  nodeEnv: Env['NODE_ENV'];
  databaseUrl: string;
}): string | null {
  if (target.nodeEnv === 'production') return 'the demo seed never runs in production';
  const { hostname } = new URL(target.databaseUrl);
  if (!LOCAL_HOSTS.has(hostname)) {
    return `the demo seed only runs against a local database, not ${hostname}`;
  }
  return null;
}
