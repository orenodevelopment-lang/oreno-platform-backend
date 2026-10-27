import type { Prisma, UserSession } from '@prisma/client';
import { loadConfig } from '../../config/index.js';
import { getPrisma } from '../../database/prisma.js';
import { generateToken, hashToken } from '../../common/security/tokens.js';
import { issueCsrfToken } from '../../common/security/csrf.js';
import { createModuleLogger } from '../../common/logging/logger.js';

const log = createModuleLogger('auth.session');

/**
 * Session lifecycle.
 *
 * The database is the source of truth. Key Value may cache a validated session,
 * but a cache miss must fall back to PostgreSQL rather than deny — and losing
 * the cache must never grant access. That ordering is what makes an
 * infrastructure restart a non-event.
 */
export interface CreatedSession {
  session: UserSession;
  /** Handed to the client once, in an HttpOnly cookie. Never persisted raw. */
  token: string;
  /** Handed to the client once, in a readable cookie, to echo as a header. */
  csrfToken: string;
}

export interface CreateSessionInput {
  userId: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
  deviceLabel?: string | undefined;
  mfaSatisfied?: boolean;
  /** Session rotation: the session this one replaces. */
  rotatedFromId?: string | undefined;
}

const TOUCH_INTERVAL_MS = 60_000;

export async function createSession(input: CreateSessionInput): Promise<CreatedSession> {
  const config = loadConfig();
  const prisma = getPrisma();

  const { token, hash } = generateToken(32);
  const csrf = issueCsrfToken();
  const expiresAt = new Date(Date.now() + config.session.ttlHours * 60 * 60 * 1000);

  const session = await prisma.userSession.create({
    data: {
      userId: input.userId,
      tokenHash: hash,
      csrfTokenHash: csrf.hash,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      ipAddress: input.ipAddress?.slice(0, 64) ?? null,
      deviceLabel: input.deviceLabel?.slice(0, 160) ?? null,
      mfaSatisfied: input.mfaSatisfied ?? false,
      expiresAt,
      lastSeenAt: new Date(),
      ...(input.rotatedFromId ? { rotatedFromId: input.rotatedFromId } : {}),
    },
  });

  return { session, token, csrfToken: csrf.token };
}

export interface ResolvedSession {
  session: UserSession;
  user: {
    id: string;
    email: string;
    status: string;
    isPlatformAdmin: boolean;
  };
}

export type SessionResolution =
  | { outcome: 'valid'; value: ResolvedSession }
  | { outcome: 'missing' }
  | { outcome: 'expired' }
  | { outcome: 'revoked' }
  | { outcome: 'idle_timeout' }
  | { outcome: 'account_unavailable' };

/**
 * Look up a session by its raw token.
 *
 * Returns a discriminated result rather than throwing so the middleware can
 * distinguish "no session" (anonymous) from "session ended" (requires a
 * specific error code so the frontend can redirect to sign-in).
 */
export async function resolveSession(rawToken: string): Promise<SessionResolution> {
  const prisma = getPrisma();
  const tokenHash = hashToken(rawToken);

  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, email: true, status: true, isPlatformAdmin: true },
      },
    },
  });

  if (!session) return { outcome: 'missing' };
  if (session.revokedAt) return { outcome: 'revoked' };

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return { outcome: 'expired' };

  const config = loadConfig();
  const idleLimitMs = config.session.idleTimeoutMinutes * 60_000;
  if (now - session.lastSeenAt.getTime() > idleLimitMs) {
    await prisma.userSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'idle_timeout' },
    });
    return { outcome: 'idle_timeout' };
  }

  if (session.user.status !== 'ACTIVE') {
    return { outcome: 'account_unavailable' };
  }

  // Refresh `lastSeenAt` at most once a minute so a busy client does not turn
  // every read into a write.
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    void prisma.userSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch((error: unknown) => {
        log.warn({ err: error, sessionId: session.id }, 'failed to refresh session lastSeenAt');
      });
  }

  const { user, ...rest } = session;
  return { outcome: 'valid', value: { session: rest, user } };
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await getPrisma().userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason.slice(0, 255) },
  });
}

export async function revokeAllSessions(
  userId: string,
  reason: string,
  options: { exceptSessionId?: string } = {},
): Promise<number> {
  const where: Prisma.UserSessionWhereInput = { userId, revokedAt: null };
  if (options.exceptSessionId) where.id = { not: options.exceptSessionId };

  const result = await getPrisma().userSession.updateMany({
    where,
    data: { revokedAt: new Date(), revokedReason: reason.slice(0, 255) },
  });
  return result.count;
}

export async function listSessions(userId: string): Promise<UserSession[]> {
  return getPrisma().userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  });
}

/** Mark a session as having satisfied the second factor. */
export async function satisfyMfa(sessionId: string): Promise<void> {
  await getPrisma().userSession.update({
    where: { id: sessionId },
    data: { mfaSatisfied: true },
  });
}

/** Housekeeping: delete sessions that expired long ago. Run by the worker. */
export async function pruneExpiredSessions(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await getPrisma().userSession.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return result.count;
}
