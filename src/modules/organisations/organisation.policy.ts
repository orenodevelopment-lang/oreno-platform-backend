import { ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { AuthContext } from '../auth/index.js';

export function assertOrganisationAccess(
  auth: AuthContext,
  organisationId: string,
  permission: string,
): void {
  const platformAllowed = auth.platformPermissions.has(permission) ||
    auth.platformPermissions.has('admin:read') ||
    auth.platformPermissions.has('admin:manage_organisation');
  const tenantAllowed =
    auth.organisationId === organisationId &&
    auth.membershipStatus === 'ACTIVE' &&
    auth.organisationPermissions.has(permission);

  if (!platformAllowed && !tenantAllowed) {
    throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'That organisation was not found.');
  }
}

export function assertOrganisationMutation(
  auth: AuthContext,
  organisationId: string,
  permission: string,
): void {
  const platformAllowed = auth.platformPermissions.has(permission) ||
    auth.platformPermissions.has('admin:manage_organisation');
  const tenantAllowed =
    auth.organisationId === organisationId &&
    auth.membershipStatus === 'ACTIVE' &&
    auth.organisationPermissions.has(permission);
  if (!platformAllowed && !tenantAllowed) {
    throw new ForbiddenError(
      ErrorCode.ORGANISATION_ACCESS_DENIED,
      'You do not have permission to change this organisation.',
    );
  }
}

export function assertNotSelfMembership(auth: AuthContext, membershipUserId: string): void {
  if (auth.userId === membershipUserId) {
    throw new ForbiddenError(
      ErrorCode.RESOURCE_ACCESS_DENIED,
      'Use account settings to manage your own access.',
    );
  }
}
