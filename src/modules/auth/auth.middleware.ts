import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getPrisma } from '../../database/prisma.js';
import { readSessionToken } from '../../common/security/cookies.js';
import { enrichContext } from '../../common/logging/context.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { resolveSession, type SessionResolution } from './session.service.js';
import { resolveAuthorisation } from '../../platform/rbac/rbac.service.js';
import type { AuthContext, ImpersonationContext } from './auth.types.js';

const log = createModuleLogger('auth.middleware');

/**
 * Authentication and authorisation middleware.
 *
 * `authenticate` resolves the session once per request and attaches an
 * `AuthContext` carrying the actor's roles and permissions. Route-level
 * `requirePermission` gates are a coarse filter; services still re-check the
 * permission that matters for the specific transition they are performing,
 * because a single route can be reachable for several reasons.
 */
const ORGANISATION_HEADER = 'x-organisation-id';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `authenticate`/`optionalAuthenticate`. */
    auth?: AuthContext;
  }
}

export function extractBearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return undefined;
  return value.trim() || undefined;
}

async function buildAuthContext(
  req: Request,
  resolved: Extract<SessionResolution, { outcome: 'valid' }>['value'],
): Promise<AuthContext | undefined> {
  const { session, user } = resolved;
  const organisationId = await resolveOrganisationId(req, user.id);

  const [authorisation, impersonation] = await Promise.all([
    resolveAuthorisation(user.id, organisationId),
    findActiveImpersonation(user.id),
  ]);

  const context: AuthContext = {
    userId: user.id,
    method: impersonation ? 'impersonation' : 'session',
    session: {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      mfaSatisfied: session.mfaSatisfied,
      csrfTokenHash: session.csrfTokenHash,
    },
    isPlatformAdmin: user.isPlatformAdmin,
    platformRoles: authorisation.platformRoles,
    platformPermissions: authorisation.platformPermissions,
    ...(authorisation.organisationId ? { organisationId: authorisation.organisationId } : {}),
    ...(authorisation.membershipId ? { membershipId: authorisation.membershipId } : {}),
    ...(authorisation.membershipStatus ? { membershipStatus: authorisation.membershipStatus } : {}),
    ...(authorisation.organisationRole ? { organisationRole: authorisation.organisationRole } : {}),
    organisationPermissions: authorisation.organisationPermissions,
    scopedDepartmentIds: authorisation.scopedDepartmentIds,
    ...(impersonation ? { impersonation } : {}),
  };

  return context;
}

async function findActiveImpersonation(userId: string): Promise<ImpersonationContext | undefined> {
  const record = await getPrisma().impersonationSession.findFirst({
    where: { targetUserId: userId, endedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, adminUserId: true, reason: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return undefined;
  return {
    sessionId: record.id,
    adminUserId: record.adminUserId,
    reason: record.reason,
    expiresAt: record.expiresAt,
  };
}

/**
 * Choose the active organisation.
 *
 * An explicit `X-Organisation-Id` header wins. Otherwise, a user with exactly
 * one active membership is scoped to it automatically, which is the common case
 * and removes a redundant round trip from the frontend. A user in several
 * organisations must choose explicitly rather than being silently defaulted.
 */
async function resolveOrganisationId(req: Request, userId: string): Promise<string | undefined> {
  const header = req.get(ORGANISATION_HEADER);
  const pathValue = req.params['organisationId'];
  const pathId = typeof pathValue === 'string' && pathValue.length > 0 ? pathValue : undefined;
  const headerId = header?.trim() || undefined;
  if (pathId && headerId && pathId !== headerId) {
    throw new ValidationError('The organisation path and X-Organisation-Id header must match.');
  }
  const explicitId = pathId ?? headerId;
  if (explicitId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(explicitId)) {
      throw new ValidationError('The organisation id must be a valid UUID.');
    }
    return explicitId;
  }

  const memberships = await getPrisma().organisationMembership.findMany({
    where: { userId, status: 'ACTIVE', organisation: { status: 'ACTIVE' } },
    select: { organisationId: true },
    take: 2,
  });

  return memberships.length === 1 ? memberships[0]?.organisationId : undefined;
}

async function attachContext(
  req: Request,
  resolved: Extract<SessionResolution, { outcome: 'valid' }>['value'],
): Promise<AuthContext | undefined> {
  const context = await buildAuthContext(req, resolved);
  if (!context) return undefined;

  req.auth = context;
  enrichContext({
    userId: context.userId,
    ...(context.organisationId ? { organisationId: context.organisationId } : {}),
    ...(context.impersonation ? { impersonatedByUserId: context.impersonation.adminUserId } : {}),
  });
  return context;
}

function authFailure(resolutionHint: string | undefined): UnauthenticatedError {
  switch (resolutionHint) {
    case 'expired':
      return new UnauthenticatedError(
        ErrorCode.SESSION_EXPIRED,
        'Your session has expired. Please sign in again.',
      );
    case 'revoked':
      return new UnauthenticatedError(
        ErrorCode.SESSION_REVOKED,
        'This session has ended. Please sign in again.',
      );
    case 'idle_timeout':
      return new UnauthenticatedError(
        ErrorCode.SESSION_EXPIRED,
        'You were signed out after a period of inactivity.',
      );
    case 'account_unavailable':
      return new UnauthenticatedError(
        ErrorCode.ACCOUNT_SUSPENDED,
        'This account is not available. Contact support for help.',
      );
    default:
      return new UnauthenticatedError(
        ErrorCode.UNAUTHENTICATED,
        'Authentication is required to perform this action.',
      );
  }
}

/** Require a valid session. */
export function authenticate(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const rawToken =
      readSessionToken((req.cookies ?? {}) as Record<string, unknown>) ?? extractBearerToken(req);

    if (!rawToken) {
      next(authFailure(undefined));
      return;
    }

    resolveSessionAndAttach(req, rawToken, next, true, false);
  };
}

/**
 * Resolve a session that is waiting for its second factor. This is intentionally
 * exported only for the MFA challenge endpoint; every ordinary protected route
 * uses `authenticate` and rejects a pending-MFA session.
 */
export function authenticatePendingMfa(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const rawToken =
      readSessionToken((req.cookies ?? {}) as Record<string, unknown>) ?? extractBearerToken(req);

    if (!rawToken) {
      next(authFailure(undefined));
      return;
    }

    resolveSessionAndAttach(req, rawToken, next, true, true);
  };
}

/** Attach the actor when present, but never reject an anonymous request. */
export function optionalAuthenticate(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const rawToken =
      readSessionToken((req.cookies ?? {}) as Record<string, unknown>) ?? extractBearerToken(req);

    if (!rawToken) {
      next();
      return;
    }

    resolveSessionAndAttach(req, rawToken, next, false, true);
  };
}

function resolveSessionAndAttach(
  req: Request,
  rawToken: string,
  next: NextFunction,
  required: boolean,
  allowPendingMfa: boolean,
): void {
  resolveSession(rawToken)
    .then(async (resolution) => {
      if (resolution.outcome !== 'valid') {
        if (required) {
          next(authFailure(resolution.outcome));
          return;
        }
        next();
        return;
      }

      const context = await attachContext(req, resolution.value);
      if (!context && required) {
        next(authFailure('revoked'));
        return;
      }
      if (context?.session && !context.session.mfaSatisfied && !allowPendingMfa) {
        next(
          new UnauthenticatedError(
            ErrorCode.TWO_FACTOR_REQUIRED,
            'Confirm your second factor to continue.',
          ),
        );
        return;
      }
      next();
    })
    .catch(next);
}

/** The actor attached by `authenticate`; throws when it is absent. */
export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth) {
    throw new UnauthenticatedError(
      ErrorCode.UNAUTHENTICATED,
      'Authentication is required to perform this action.',
    );
  }
  return req.auth;
}

export function requirePermission(...permissions: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(
        new UnauthenticatedError(
          ErrorCode.UNAUTHENTICATED,
          'Authentication is required to perform this action.',
        ),
      );
      return;
    }

    const allowed = permissions.some(
      (permission) =>
        auth.platformPermissions.has(permission) || auth.organisationPermissions.has(permission),
    );

    if (!allowed) {
      log.warn(
        { userId: auth.userId, route: req.baseUrl + req.path, permissions },
        'permission denied',
      );
      next(
        new ForbiddenError(
          ErrorCode.FORBIDDEN,
          'You do not have permission to perform this action.',
        ),
      );
      return;
    }

    next();
  };
}

export function requirePlatformPermission(...permissions: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(new UnauthenticatedError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.'));
      return;
    }

    const allowed = permissions.some((permission) => auth.platformPermissions.has(permission));
    if (!allowed) {
      log.warn(
        {
          userId: auth.userId,
          route: req.baseUrl + req.path,
          permissions,
          platformRoles: auth.platformRoles,
        },
        'platform permission denied',
      );
      next(
        new ForbiddenError(
          ErrorCode.PLATFORM_ROLE_REQUIRED,
          'This action requires platform administrator access.',
        ),
      );
      return;
    }

    next();
  };
}

/** Require an active organisation scope for the request. */
export function requireOrganisation(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(new UnauthenticatedError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.'));
      return;
    }
    if (!auth.organisationId) {
      next(
        new ForbiddenError(
          ErrorCode.ORGANISATION_ACCESS_DENIED,
          'Select an organisation before performing this action.',
          { details: { header: ORGANISATION_HEADER } },
        ),
      );
      return;
    }
    const hasPlatformAccess = auth.isPlatformAdmin || auth.platformRoles.length > 0;
    if ((!auth.membershipId || auth.membershipStatus !== 'ACTIVE') && !hasPlatformAccess) {
      next(
        new ForbiddenError(
          ErrorCode.MEMBERSHIP_NOT_FOUND,
          'Your access to this organisation is not active.',
        ),
      );
      return;
    }
    next();
  };
}

/** Require an active session that has satisfied the second factor. */
export function requireMfaSatisfied(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth?.session) {
      next(new UnauthenticatedError(ErrorCode.UNAUTHENTICATED, 'Authentication is required.'));
      return;
    }
    if (!auth.session.mfaSatisfied) {
      next(
        new UnauthenticatedError(
          ErrorCode.TWO_FACTOR_REQUIRED,
          'Confirm your second factor to continue.',
        ),
      );
      return;
    }
    next();
  };
}

export { ORGANISATION_HEADER };
