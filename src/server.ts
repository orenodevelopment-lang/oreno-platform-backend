import './config/load-env.js';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createModuleLogger, initLogger, serialiseError } from './common/logging/logger.js';
import { registerRateLimitStore } from './common/middleware/rate-limit.js';
import { createRateLimitStore } from './common/middleware/rate-limit-redis.js';
import { startMetricsReporter } from './common/observability/metrics.js';
import { initialiseConfiguredErrorMonitor } from './common/observability/error-monitor.js';
import { connectKeyValue } from './database/key-value.js';
import { connectPrisma } from './database/prisma.js';
import { installShutdownHandlers } from './shutdown.js';
import { installMessagingSocket } from './modules/messaging/messaging.socket.js';
import { startWorkers } from './workers/index.js';

/**
 * API entry point.
 *
 * Configuration is parsed before anything else so a misconfigured deployment
 * fails at startup with a readable error rather than on the first request.
 * The worker normally has its own entry point (`worker.ts`) so it can scale
 * independently. Small always-on deployments may instead enable the same
 * workers in this process with `RUN_WORKER_IN_API=true`.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  initLogger({
    level: config.logLevel,
    serviceName: config.serviceName,
    isProduction: config.isProduction,
  });
  const log = createModuleLogger('server');
  const flushErrorMonitor = initialiseConfiguredErrorMonitor();

  await connectPrisma();
  log.info('database connected');

  if (config.keyValue.enabled) {
    await connectKeyValue();
    // Share rate-limit counters across instances. Without Key Value the
    // in-process store is used, which is correct for a single instance only.
    registerRateLimitStore(createRateLimitStore);
    log.info('key value connected');
  } else if (config.isProduction) {
    log.warn(
      'KEY_VALUE_URL is not set: rate limits are per-instance and background work is unavailable',
    );
  }

  const embeddedWorkers = config.keyValue.runWorkerInApi ? await startWorkers() : undefined;
  if (embeddedWorkers) log.info('embedded background workers ready');

  const stopMetrics = config.observability.metricsEnabled ? startMetricsReporter() : undefined;

  const app = createApp();
  const server = app.listen(config.port, () => {
    log.info({ port: config.port, environment: config.env }, 'api listening');
  });
  const messagingSocket = await installMessagingSocket(server);

  // Render's load balancer holds connections open between requests. Node's
  // default 5s keep-alive would close them first, producing sporadic 502s as
  // the balancer reuses a connection the origin just dropped.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const shutdown = installShutdownHandlers({
    logger: log,
    server,
    teardown: [
      () => messagingSocket.close(),
      () => embeddedWorkers?.stop(),
      () => stopMetrics?.(),
      flushErrorMonitor,
    ],
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    log.error({ err: serialiseError(reason) }, 'unhandled rejection');
  });

  process.on('uncaughtException', (error) => {
    // The process is in an unknown state after an uncaught exception; log it and
    // shut down so the orchestrator can replace the instance.
    log.fatal({ err: serialiseError(error) }, 'uncaught exception');
    void shutdown('uncaughtException', 1);
  });
}

void main().catch((error: unknown) => {
  // The logger may not exist yet if configuration parsing failed.
  console.error('failed to start api:', error);
  process.exit(1);
});
