import type { NextFunction, Request, Response } from 'express';
import { createModuleLogger } from '../logging/logger.js';
import { getContext } from '../logging/context.js';

const log = createModuleLogger('http');

/** Paths excluded from access logging to keep health-check noise out of logs. */
const SILENT_PATHS = new Set(['/health', '/health/live', '/health/ready', '/metrics']);

export function requestLoggerMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      if (SILENT_PATHS.has(req.path)) return;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const context = getContext();
      const route = req.route as { path?: string } | undefined;

      const record = {
        method: req.method,
        // Use the route pattern, not the raw URL, so identifiers do not create
        // unbounded log cardinality.
        route: route?.path ? `${req.baseUrl}${route.path}` : req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ...(context?.userId ? { userId: context.userId } : {}),
        ...(context?.organisationId ? { organisationId: context.organisationId } : {}),
      };

      if (res.statusCode >= 500) {
        log.error(record, 'request failed');
      } else if (res.statusCode >= 400) {
        log.warn(record, 'request rejected');
      } else {
        log.info(record, 'request completed');
      }
    });

    next();
  };
}
