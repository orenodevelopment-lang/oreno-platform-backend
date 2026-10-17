import type { AuthContext } from '../auth/index.js';
import { hasAnyPermission, isAdministrator } from '../auth/index.js';

/**
 * Authorisation for the users module.
 *
 * The rules are intentionally conservative: a person's profile is visible to
 * themselves, to a platform administrator who holds a user-management
 * permission, or to someone who shares an active organisation with them. Sharing
 * a *suspended* organisation grants nothing, mirroring the membership rule in
 * the RBAC resolver.
 */
export function canViewOwnProfile(auth: AuthContext, targetUserId: string): boolean {
  return auth.userId === targetUserId;
}

export function canViewAnyProfile(auth: AuthContext): boolean {
  // Only platform-scoped grants confer platform-wide visibility. An
  // organisation-level `membership:read` grant must never turn into access to
  // arbitrary users in other tenants.
  return (
    auth.platformPermissions.has('admin:read') ||
    auth.platformPermissions.has('admin:manage_user')
  );
}

export function canViewProfile(
  auth: AuthContext,
  targetUserId: string,
  sharesOrganisation: boolean,
): boolean {
  if (canViewOwnProfile(auth, targetUserId)) return true;
  if (canViewAnyProfile(auth)) return true;
  return sharesOrganisation;
}

/** Directory search is a platform capability; tenant users get a scoped picker. */
export function canSearchDirectory(auth: AuthContext): boolean {
  return isAdministrator(auth) || hasAnyPermission(auth, ['membership:read', 'membership:invite']);
}

/**
 * A tenant user without a platform role may only search within their own
 * organisations; a platform administrator may search the whole directory.
 */
export function searchScope(auth: AuthContext, activeOrganisationIds: readonly string[]): {
  organisationIds?: readonly string[];
} {
  if (isAdministrator(auth)) return {};
  return { organisationIds: activeOrganisationIds };
}

export function canManageAvatar(auth: AuthContext, targetUserId: string): boolean {
  return auth.userId === targetUserId;
}
