import type { MembershipStatus, RoleKey } from '@prisma/client';
import { ValidationError } from '../../common/errors/app-error.js';

/**
 * The authenticated actor for a request.
 *
 * `AuthContext` is deliberately a resolved snapshot: by the time a controller
 * runs, the actor's roles and permissions have already been loaded from the
 * database and no service needs to re-query them. Services still re-check
 * permissions for actions that are reachable from more than one route, because
 * a route-level gate is not a substitute for a domain-level one.
 */
export type AuthMethod = 'session' | 'bearer' | 'impersonation';

export interface ImpersonationContext {
  readonly sessionId: string;
  readonly adminUserId: string;
  readonly reason: string;
  readonly expiresAt: Date;
}

/** The `UserSession` row backing a cookie-authenticated request. */
export interface SessionContext {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly mfaSatisfied: boolean;
  /** SHA-256 of the CSRF token; compared by the CSRF middleware. */
  readonly csrfTokenHash: string;
}

export interface AuthContext {
  readonly userId: string;
  readonly method: AuthMethod;
  /** Present only for cookie-authenticated sessions. */
  readonly session?: SessionContext;

  /** True when the user holds the coarse bootstrap admin flag. */
  readonly isPlatformAdmin: boolean;
  readonly platformRoles: readonly RoleKey[];
  readonly platformPermissions: ReadonlySet<string>;

  /** The organisation the request is scoped to, when one was selected. */
  readonly organisationId?: string;
  readonly membershipId?: string;
  readonly membershipStatus?: MembershipStatus;
  readonly organisationRole?: RoleKey;
  readonly organisationPermissions: ReadonlySet<string>;
  /** Departments a manager is narrowed to, when scoped. Empty means "all". */
  readonly scopedDepartmentIds: readonly string[];

  readonly impersonation?: ImpersonationContext;
}

/** Union of platform and organisation grants applicable to the active scope. */
export function effectivePermissions(auth: AuthContext): ReadonlySet<string> {
  if (auth.platformPermissions.size === 0) return auth.organisationPermissions;
  if (auth.organisationPermissions.size === 0) return auth.platformPermissions;
  return new Set([...auth.platformPermissions, ...auth.organisationPermissions]);
}

export function hasPermission(auth: AuthContext, permission: string): boolean {
  return auth.platformPermissions.has(permission) || auth.organisationPermissions.has(permission);
}

export function hasAnyPermission(auth: AuthContext, permissions: readonly string[]): boolean {
  return permissions.some((permission) => hasPermission(auth, permission));
}

export function hasAllPermissions(auth: AuthContext, permissions: readonly string[]): boolean {
  return permissions.every((permission) => hasPermission(auth, permission));
}

/** True when the actor is a platform administrator (coarse flag or any platform role). */
export function isAdministrator(auth: AuthContext): boolean {
  return auth.isPlatformAdmin || auth.platformRoles.length > 0;
}

/**
 * The active organisation, or a thrown 400 if the action needs one and the
 * request was not scoped. Kept here so every service fails the same way.
 */
export function requireOrganisationScope(auth: AuthContext): string {
  if (!auth.organisationId) {
    throw new ValidationError('This action must be performed within an organisation.', {
      details: { header: 'X-Organisation-Id' },
    });
  }
  return auth.organisationId;
}
