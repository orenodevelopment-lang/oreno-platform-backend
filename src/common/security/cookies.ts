import type { Response } from 'express';
import { loadConfig } from '../../config/index.js';

/**
 * Session cookie policy.
 *
 * The session token lives only in a Secure, HttpOnly cookie: JavaScript cannot
 * read it, so an XSS flaw cannot exfiltrate the session. `SameSite=None` is
 * required because the frontend (Vercel) and API (Render) are different
 * registrable domains; CSRF is handled by the double-submit token instead.
 */
export interface SessionCookieOptions {
  maxAgeMs?: number;
}

export function setSessionCookie(
  res: Response,
  token: string,
  options: SessionCookieOptions = {},
): void {
  const config = loadConfig();
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: options.maxAgeMs ?? config.session.ttlHours * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  const config = loadConfig();
  res.clearCookie(config.session.cookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
  });
}

/** Read the raw session token from the request cookies. */
export function readSessionToken(cookies: Record<string, unknown>): string | undefined {
  const config = loadConfig();
  const value = cookies[config.session.cookieName];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
