import { Router } from 'express';
import { asyncHandler } from '../common/http/async-handler.js';
import { snapshot } from '../common/observability/metrics.js';
import { checkDatabaseHealth } from '../database/prisma.js';
import { checkKeyValueHealth, isKeyValueConfigured } from '../database/key-value.js';
import { loadConfig } from '../config/index.js';

/**
 * Liveness, readiness and metrics.
 *
 * `live` answers "is this process running" and must never touch a dependency —
 * a failing database should not cause the platform to restart a healthy process.
 * `ready` answers "can this process serve traffic" and therefore does check its
 * dependencies, returning 503 so the load balancer holds traffic back.
 *
 * These paths are deliberately excluded from access logging (see
 * `request-logger.ts`) so probes do not drown the logs.
 */
export function createHealthRouter(): Router {
  const router = Router();
  const startedAt = Date.now();
  const config = loadConfig();

  const identity = {
    service: config.serviceName,
    environment: config.env,
  };

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      ...identity,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  router.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', ...identity });
  });

  router.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      const [database, keyValue] = await Promise.all([
        checkDatabaseHealth(),
        isKeyValueConfigured() ? checkKeyValueHealth() : Promise.resolve(true),
      ]);

      const ready = database && keyValue;
      res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'degraded',
        ...identity,
        checks: {
          database: database ? 'ok' : 'unavailable',
          // Key Value is optional: without it the API serves requests but
          // queues, rate-limit counters and socket scaling are degraded.
          keyValue: isKeyValueConfigured() ? (keyValue ? 'ok' : 'unavailable') : 'not_configured',
        },
      });
    }),
  );

  router.get('/health/startup', (_req, res) => {
    res.json({ status: 'ok', ...identity });
  });

  if (config.observability.metricsEnabled) {
    router.get('/metrics', (_req, res) => {
      res.json({ metrics: snapshot() });
    });
  }

  return router;
}
