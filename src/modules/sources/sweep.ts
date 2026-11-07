import { logger } from '@/platform/logging';

import { failStaleSources } from './store';

// Working a Source takes seconds; anything older lost its process. The margin
// spares Sources the previous instance is still working during a start-first deploy.
const STALE_AFTER_MS = 2 * 60_000;
const SWEEP_EVERY_MS = 60_000;

/**
 * The boot sweep: fails stale `processing` Sources as `interrupted` now, and
 * keeps checking, since a Source the previous instance was working when it
 * stopped only turns stale after this one has booted.
 */
export function startStaleSourceSweep(): void {
  const sweep = async () => {
    try {
      const failed = await failStaleSources({ olderThan: new Date(Date.now() - STALE_AFTER_MS) });
      if (failed > 0)
        logger().warn({ event: 'source.sweep', failed }, 'interrupted Sources failed');
    } catch (error) {
      logger().error({ event: 'source.sweep_failed', err: error });
    }
  };
  void sweep();
  setInterval(sweep, SWEEP_EVERY_MS).unref();
}
