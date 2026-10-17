import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { loadConfig } from '../../config/index.js';
import { RateLimitError } from '../errors/app-error.js';
import { increment, MetricName } from '../observability/metrics.js';

/**
 * Rate limiting.
 *
 * The default store is in-process. When Key Value is configured the caller
 * should supply a Redis-backed store (see `createRateLimitStore`) so limits are
 * shared across Render instances.
 */
export type RateLimitStoreFactory = (prefix: string) => Options['store'];

let storeFactory: RateLimitStoreFactory | undefined;

export function registerRateLimitStore(factory: RateLimitStoreFactory): void {
  storeFactory = factory;
}

function buildLimiter(prefix: string, options: Partial<Options>): RateLimitRequestHandler {
  const config = loadConfig();

  return rateLimit({
    windowMs: config.rateLimit.windowSeconds * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Key by authenticated user where available so one noisy tenant behind a
    // shared NAT does not exhaust the budget for everyone else.
    keyGenerator: (req: Request) => req.auth?.userId ?? req.ip ?? 'unknown',
    handler: (_req, _res, next) => {
      increment(MetricName.HTTP_ERROR, { type: 'rate_limited', limiter: prefix });
      next(new RateLimitError());
    },
    ...(storeFactory ? { store: storeFactory(prefix) } : {}),
    ...options,
  });
}

/** Broad limit applied to every API route. */
export function globalRateLimit() {
  const config = loadConfig();
  return buildLimiter('global', { limit: config.rateLimit.max });
}

/**
 * Strict limit for authentication endpoints. Deliberately generous enough that
 * a shared office IP is not locked out, but tight enough that credential
 * stuffing is impractical. Account-level lockout is a separate control.
 */
export function authRateLimit() {
  const config = loadConfig();
  return buildLimiter('auth', {
    limit: config.rateLimit.authMax,
    // Failed attempts should not keep a successful user locked out.
    skipSuccessfulRequests: true,
  });
}

export function applicationRateLimit() {
  const config = loadConfig();
  return buildLimiter('applications', { limit: config.rateLimit.applicationMax });
}

export function messageRateLimit() {
  const config = loadConfig();
  return buildLimiter('messages', { limit: config.rateLimit.messageMax });
}

export function uploadRateLimit() {
  const config = loadConfig();
  return buildLimiter('uploads', { limit: config.rateLimit.uploadMax });
}

/** Public unauthenticated forms (demo, contact, newsletter). */
export function publicFormRateLimit() {
  return buildLimiter('public-forms', { limit: 5, skipSuccessfulRequests: true });
}
