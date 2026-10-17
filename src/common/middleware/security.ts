import type { NextFunction, Request, Response } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { loadConfig } from '../../config/index.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

/**
 * Exact-origin CORS.
 *
 * A wildcard origin is never combined with credentials. Origins are compared
 * exactly (scheme + host + port) against the configured allowlist; anything
 * else is rejected without an `Access-Control-Allow-Origin` header, which
 * makes the browser block the response.
 */
export function corsMiddleware() {
  const config = loadConfig();

  const options: CorsOptions = {
    origin(origin, callback) {
      // Same-origin, server-to-server and non-browser callers send no Origin.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(
        new AppError(ErrorCode.ORIGIN_NOT_ALLOWED, 403, {
          message: 'The request origin is not allowed.',
          details: { origin },
        }),
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-Id',
      'X-Request-Id',
      'Idempotency-Key',
      config.session.csrfHeaderName,
    ],
    exposedHeaders: [
      'X-Request-Id',
      'X-Correlation-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
      'Location',
    ],
    maxAge: 86_400,
  };

  return cors(options);
}

export function securityHeadersMiddleware() {
  return helmet({
    contentSecurityPolicy: false, // API serves JSON, not HTML documents.
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: loadConfig().isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    frameguard: { action: 'deny' },
    noSniff: true,
    hidePoweredBy: true,
  });
}

export function compressionMiddleware() {
  return compression({ threshold: 1024 });
}

/**
 * Reject state-changing requests whose Origin/Referer does not match the
 * allowlist. This is a second line of defence behind CSRF tokens and protects
 * the endpoints that authenticate by cookie.
 */
export function originCheckMiddleware() {
  const config = loadConfig();
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (safeMethods.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    if (origin) {
      if (config.allowedOrigins.includes(origin)) {
        next();
        return;
      }
      next(
        new AppError(ErrorCode.ORIGIN_NOT_ALLOWED, 403, {
          message: 'The request origin is not allowed.',
          details: { origin },
        }),
      );
      return;
    }

    // No Origin header: allow only when a Referer matches, or when the caller
    // presents a bearer/CSRF header (non-browser client).
    const referer = req.get('referer');
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (config.allowedOrigins.includes(refererOrigin)) {
          next();
          return;
        }
      } catch {
        // fall through to rejection
      }
    }

    if (req.get(config.session.csrfHeaderName) || req.get('authorization')) {
      next();
      return;
    }

    next(
      new AppError(ErrorCode.ORIGIN_NOT_ALLOWED, 403, {
        message: 'The request origin could not be verified.',
      }),
    );
  };
}
