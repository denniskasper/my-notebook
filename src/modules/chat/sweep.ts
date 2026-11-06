import { logger } from '@/platform/logging';

import { STREAMING_STALE_AFTER_MS } from './ask';
import { failStaleMessages } from './store';

const SWEEP_EVERY_MS = 60_000;

/**
 * The boot sweep: fails answers left `streaming` as `interrupted` now, and
 * keeps checking, since an answer the previous instance was streaming when it
 * stopped only turns stale after this one has booted.
 */
export function startStaleMessageSweep(): void {
  const sweep = async () => {
    try {
      const failed = await failStaleMessages({
        olderThan: new Date(Date.now() - STREAMING_STALE_AFTER_MS),
      });
      if (failed > 0) logger().warn({ event: 'chat.sweep', failed }, 'interrupted answers failed');
    } catch (error) {
      logger().error({ event: 'chat.sweep_failed', err: error });
    }
  };
  void sweep();
  setInterval(sweep, SWEEP_EVERY_MS).unref();
}
