import { env } from '@/platform/env';

import packageJson from '../../../package.json';

/** The running build: app version and commit. `/api/health` and the sidebar label both read it, so they agree. */
export function buildInfo(): { version: string; commit: string } {
  return { version: packageJson.version, commit: env().COMMIT };
}
