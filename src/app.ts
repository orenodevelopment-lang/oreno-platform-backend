import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { errorHandlerMiddleware, notFoundMiddleware } from './common/middleware/error-handler.js';
import { globalRateLimit } from './common/middleware/rate-limit.js';
import { requestContextMiddleware } from './common/middleware/request-context.js';
import { requestLoggerMiddleware } from './common/middleware/request-logger.js';
import {
  compressionMiddleware,
  corsMiddleware,
  originCheckMiddleware,
  securityHeadersMiddleware,
} from './common/middleware/security.js';
import { csrfProtectionMiddleware } from './common/security/csrf.js';
import { loadConfig } from './config/index.js';
import { optionalAuthenticate } from './modules/auth/index.js';
import { createDocsRouter } from './routes/docs.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createApiRouter } from './routes/index.js';

/**
 * JSON bodies stay small because file bytes never pass through the API: uploads
 * go straight to object storage with a presigned URL, and the API only ever
 * receives metadata. A one-megabyte ceiling keeps a malformed or hostile body
 * from consuming a worker's memory.
 */
const JSON_BODY_LIMIT = '1mb';

/**
 * Build the Express application.
 *
 * Middleware order is deliberate and load-bearing:
 *
 *   1. Request context — every later layer logs with the request/correlation id.
 *   2. Security headers, CORS, compression.
 *   3. Body parsing, cookie parsing.
 *   4. Access logging.
 *   5. Rate limiting — before authentication, so credential stuffing is capped
 *      before it reaches the database.
 *   6. Optional authentication — attaches `req.auth` when a session is present,
 *      without rejecting anonymous requests.
 *   7. Origin check, then CSRF — both need `req.auth` and both gate only
 *      state-changing requests.
 *   8. Module routers.
 *   9. Not-found, then the terminal error handler.
 */
export function createApp(): Express {
  const config = loadConfig();
  const app = express();

  // Render terminates TLS one hop in front of the process. Without this, every
  // request appears to originate from the proxy and rate limiting becomes a
  // global bucket. It is disabled elsewhere so a spoofed X-Forwarded-For cannot
  // forge a client address in development or tests.
  app.set('trust proxy', config.isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(requestContextMiddleware());
  app.use(securityHeadersMiddleware());
  app.use(corsMiddleware());
  app.use(compressionMiddleware());

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use(requestLoggerMiddleware());

  // Probes and metrics are mounted outside `/api` and outside the rate limiter:
  // a throttled health check would make a busy service look unhealthy.
  app.use(createHealthRouter());

  // Browsable documentation is a development affordance, not a production
  // surface. It is mounted before the `/api` middleware chain so that neither
  // rate limiting nor CSRF applies to loading the page itself.
  if (!config.isProduction) {
    app.use(createDocsRouter());
  }

  app.use('/api', globalRateLimit());
  app.use('/api', optionalAuthenticate());
  app.use('/api', originCheckMiddleware());
  app.use('/api', csrfProtectionMiddleware());

  app.use('/api/v1', createApiRouter());

  app.use(notFoundMiddleware());
  app.use(errorHandlerMiddleware());

  return app;
}
