import { env } from '@/platform/env';

import packageJson from '../../../package.json';

/** The running build: app version and the `COMMIT` build arg (`unknown` locally). */
export type BuildInfo = { version: string; commit: string };

/** The running build. `/api/health` and the sidebar label both read it, so they agree. */
export function buildInfo(): BuildInfo {
  return { version: packageJson.version, commit: env().COMMIT };
}
