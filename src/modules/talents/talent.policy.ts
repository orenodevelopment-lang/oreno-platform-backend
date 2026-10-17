import { NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { AuthContext } from '../auth/index.js';

export function assertOwnProfile(auth: AuthContext, profileUserId: string): void {
  if (auth.userId !== profileUserId) {
    throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'That talent profile was not found.');
  }
}

export function canUseCompanyDiscovery(auth: AuthContext | undefined): boolean {
  return Boolean(
    auth?.organisationId &&
      auth.membershipStatus === 'ACTIVE' &&
      auth.organisationPermissions.has('talent:read'),
  );
}
