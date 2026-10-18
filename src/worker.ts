import './config/load-env.js';
import { DependencyUnavailableError } from './common/errors/app-error.js';
import { createModuleLogger, initLogger, serialiseError } from './common/logging/logger.js';
import { startMetricsReporter } from './common/observability/metrics.js';
import { initialiseConfiguredErrorMonitor } from './common/observability/error-monitor.js';
import { loadConfig } from './config/index.js';
import { connectKeyValue } from './database/key-value.js';
import { connectPrisma } from './database/prisma.js';
import { installShutdownHandlers } from './shutdown.js';
import { startWorkers } from './workers/index.js';

/**
 * Worker entry point.
 *
 * Runs the same code as the API but with no HTTP listener: it consumes the
 * BullMQ queues, drains the outbox and performs scheduled housekeeping. It is a
 * separate process so it can be scaled — or held back from a deploy — without
 * affecting request serving.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  initLogger({
    level: config.logLevel,
    serviceName: `${config.serviceName}-worker`,
    isProduction: config.isProduction,
  });
  const log = createModuleLogger('worker');
  const flushErrorMonitor = initialiseConfiguredErrorMonitor();

  if (!config.keyValue.enabled) {
    // Without Key Value there is no queue to consume, so the process would sit
    // idle while appearing healthy. Refuse to start instead.
    throw new DependencyUnavailableError('KEY_VALUE_URL must be set to run the background worker.');
  }

  await connectPrisma();
  await connectKeyValue();
  log.info('database and key value connected');

  const workers = await startWorkers();
  const stopMetrics = config.observability.metricsEnabled ? startMetricsReporter() : undefined;

  const shutdown = installShutdownHandlers({
    logger: log,
    teardown: [() => workers.stop(), () => stopMetrics?.(), flushErrorMonitor],
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    log.error({ err: serialiseError(reason) }, 'unhandled rejection');
  });

  process.on('uncaughtException', (error) => {
    log.fatal({ err: serialiseError(error) }, 'uncaught exception');
    void shutdown('uncaughtException', 1);
  });

  log.info('worker ready');
}

void main().catch((error: unknown) => {
  console.error('failed to start worker:', error);
  process.exit(1);
});
