import type { Server } from 'node:http';
import type { Logger } from './common/logging/logger.js';
import { disconnectPrisma } from './database/prisma.js';
import { disconnectKeyValue, isKeyValueConfigured } from './database/key-value.js';

/**
 * Graceful shutdown for the API and worker processes.
 *
 * Render sends `SIGTERM` before replacing an instance and expects the process to
 * exit within a short grace period. The sequence is:
 *
 *   1. Stop accepting new connections and let in-flight requests finish.
 *   2. Run module teardown (close listeners, flush queues, drain HTTP clients).
 *   3. Close Key Value and the database pool.
 *
 * Steps 1 and 2 are bounded: if a request or a teardown step hangs, the process
 * closes forcibly rather than being killed mid-transaction by the platform.
 */
export interface ShutdownOptions {
  logger: Logger;
  /** Stop accepting connections on this server, if any. */
  server?: Server;
  /** Extra teardown, run after the server has drained. */
  teardown?: Array<() => unknown>;
  /** Upper bound on the whole sequence. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function installShutdownHandlers(
  options: ShutdownOptions,
): (signal: string, exitCode?: number) => Promise<void> {
  const { logger } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let shuttingDown = false;

  async function stopServer(): Promise<void> {
    const server = options.server;
    if (!server) return;

    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
      // Keep-alive sockets parked between requests would otherwise hold the
      // server open for the length of their idle timeout.
      server.closeIdleConnections?.();
    });
  }

  return async function shutdown(signal: string, exitCode = 0): Promise<void> {
    if (shuttingDown) {
      logger.warn({ signal }, 'shutdown already in progress');
      return;
    }
    shuttingDown = true;

    logger.info({ signal }, 'shutdown started');

    const forced = setTimeout(() => {
      logger.warn({ signal, timeoutMs }, 'shutdown timed out; forcing exit');
      options.server?.closeAllConnections?.();
    }, timeoutMs);
    forced.unref();

    try {
      await stopServer();

      for (const step of options.teardown ?? []) {
        await step();
      }

      if (isKeyValueConfigured()) await disconnectKeyValue();
      await disconnectPrisma();

      logger.info({ signal }, 'shutdown complete');
    } catch (error) {
      logger.error({ signal, err: error }, 'shutdown failed');
      exitCode = exitCode === 0 ? 1 : exitCode;
    } finally {
      clearTimeout(forced);
      process.exit(exitCode);
    }
  };
}
