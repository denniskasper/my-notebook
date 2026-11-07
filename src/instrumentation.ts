/** Runs once per server start: refuse to serve with an invalid environment. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { env } = await import('@/platform/env');
  try {
    env();
  } catch (error) {
    // Next.js would log a failed register() and keep serving 500s; exiting lets
    // the orchestrator see the failed start and keep the previous release.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const { logger } = await import('@/platform/logging');
  logger().info({ event: 'boot' }, 'server starting');
  const { startStaleSourceSweep } = await import('@/modules/sources');
  startStaleSourceSweep();
  const { startStaleMessageSweep } = await import('@/modules/chat');
  startStaleMessageSweep();
  const { startVisitorPurge } = await import('@/modules/visitors');
  startVisitorPurge();
  const { startStaleStudioOutputSweep } = await import('@/modules/studio');
  startStaleStudioOutputSweep();
}
