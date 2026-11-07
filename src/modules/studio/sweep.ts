import { logger } from '@/platform/logging';

import { failStaleStudioOutputs, PROCESSING_STALE_AFTER_MS } from './store';

const SWEEP_EVERY_MS = 60_000;

/**
 * The boot sweep: fails Studio outputs left `processing` as `interrupted` now,
 * and keeps checking, since one the previous instance was generating when it
 * stopped only turns stale after this one has booted.
 */
export function startStaleStudioOutputSweep(): void {
  const sweep = async () => {
    try {
      const failed = await failStaleStudioOutputs({
        olderThan: new Date(Date.now() - PROCESSING_STALE_AFTER_MS),
      });
      if (failed > 0)
        logger().warn({ event: 'studio.sweep', failed }, 'interrupted outputs failed');
    } catch (error) {
      logger().error({ event: 'studio.sweep_failed', err: error });
    }
  };
  void sweep();
  setInterval(sweep, SWEEP_EVERY_MS).unref();
}
