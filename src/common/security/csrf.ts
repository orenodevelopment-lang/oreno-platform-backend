import type { NextFunction, Request, Response } from 'express';
import { loadConfig } from '../../config/index.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { generateToken, hashToken, safeCompare } from './tokens.js';

/**
 * Double-submit CSRF protection for cookie-authenticated state changes.
 *
 * A random token is issued in a readable (non-HttpOnly) cookie and must be
 * echoed back in a request header. The server stores only a hash of the token
 * against the session, so a forged cookie alone is insufficient — the attacker
 * would also need the matching session row.
 *
 * Requests authenticated by an `Authorization` header instead of a cookie are
 * exempt: they are not automatically attached by the browser, so they are not
 * forgeable cross-site.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(): { token: string; hash: string } {
  return generateToken(32);
}

export function setCsrfCookie(res: Response, token: string): void {
  const config = loadConfig();
  res.cookie(config.session.csrfCookieName, token, {
    httpOnly: false, // Must be readable by the frontend to echo it back.
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: config.session.ttlHours * 60 * 60 * 1000,
  });
}

export function clearCsrfCookie(res: Response): void {
  const config = loadConfig();
  res.clearCookie(config.session.csrfCookieName, { path: '/' });
}

export function csrfProtectionMiddleware() {
  const config = loadConfig();

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    // Bearer-authenticated requests are not cookie-forgeable.
    if (req.get('authorization')) {
      next();
      return;
    }

    const session = req.auth?.session;
    if (!session) {
      // No session yet (e.g. login, register): nothing to protect.
      next();
      return;
    }

    const headerToken = req.get(config.session.csrfHeaderName);
    if (!headerToken) {
      next(
        new AppError(ErrorCode.CSRF_TOKEN_INVALID, 403, {
          message: 'A CSRF token is required for this request.',
        }),
      );
      return;
    }

    const providedHash = hashToken(headerToken);
    if (!safeCompare(providedHash, session.csrfTokenHash)) {
      next(
        new AppError(ErrorCode.CSRF_TOKEN_INVALID, 403, {
          message: 'The CSRF token is invalid or has expired.',
        }),
      );
      return;
    }

    next();
  };
}
