import { getPrisma } from '../../database/prisma.js';
import { NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { recordAudit } from '../../platform/audit/audit.service.js';
import type { AuthContext } from '../auth/index.js';
import * as repository from './user.repository.js';
import * as policy from './user.policy.js';
import type { UserProfile, UserSummary } from './user.types.js';
import type { UserSearchQuery } from './user.schema.js';
import { toSkipTake } from '../../common/pagination/pagination.js';

/**
 * Users service.
 *
 * Every read here is filtered by the same question first: may this actor see
 * this person at all? A negative answer returns 404 rather than 403, because a
 * 403 on a profile endpoint would confirm that the id exists.
 */

export interface SearchResult {
  items: UserSummary[];
  total: number;
}

/** A viewer sees the full profile or the public summary, never a partial mix. */
export type ProfileView = UserProfile | UserSummary;

export async function getProfile(auth: AuthContext, targetUserId: string): Promise<ProfileView> {
  const profile = await repository.findUserProfile(targetUserId);
  if (!profile) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'That user was not found.');
  }

  const isSelf = policy.canViewOwnProfile(auth, targetUserId);
  const isAdmin = policy.canViewAnyProfile(auth);

  let sharesOrganisation = false;
  if (!isSelf && !isAdmin) {
    sharesOrganisation = await sharesActiveOrganisation(auth.userId, targetUserId);
  }

  if (!policy.canViewProfile(auth, targetUserId, sharesOrganisation)) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'That user was not found.');
  }

  // A viewer who is neither the subject nor an administrator gets the public
  // summary: enough to render a name and avatar, and nothing else.
  if (isSelf || isAdmin) return profile;
  return repository.toSummary(profile);
}

async function sharesActiveOrganisation(actorId: string, targetId: string): Promise<boolean> {
  const actorOrganisations = new Set(await repository.findActiveOrganisationIds(actorId));
  if (actorOrganisations.size === 0) return false;
  const targetOrganisations = await repository.findActiveOrganisationIds(targetId);
  return targetOrganisations.some((organisationId) => actorOrganisations.has(organisationId));
}

export async function search(auth: AuthContext, query: UserSearchQuery): Promise<SearchResult> {
  if (!policy.canSearchDirectory(auth)) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'No users matched.');
  }

  const activeOrganisationIds = await repository.findActiveOrganisationIds(auth.userId);
  const scope = policy.searchScope(auth, activeOrganisationIds);

  // A tenant user who belongs to no active organisation can see nobody; the
  // empty list is more honest than an unscoped query that would leak the whole
  // directory.
  if (scope.organisationIds && scope.organisationIds.length === 0) {
    return { items: [], total: 0 };
  }

  return repository.searchUsers({
    query: query.q,
    status: query.status,
    ...scope,
    ...toSkipTake(query),
  });
}

export async function setAvatar(
  auth: AuthContext,
  fileId: string | null,
): Promise<UserSummary> {
  if (!policy.canManageAvatar(auth, auth.userId)) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'That user was not found.');
  }

  if (fileId) {
    const file = await getPrisma().fileObject.findFirst({
      where: { id: fileId, ownerId: auth.userId },
      select: { id: true, status: true, category: true },
    });
    if (!file) {
      throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That file was not found.');
    }
    if (file.status !== 'READY') {
      throw new UnprocessableError(
        ErrorCode.FILE_NOT_READY,
        'The image is still being processed. Try again in a moment.',
      );
    }
    if (file.category !== 'PROFILE_PHOTO') {
      throw new UnprocessableError(
        ErrorCode.FILE_CATEGORY_NOT_PERMITTED,
        'Only a profile photo upload can be set as your avatar.',
      );
    }
  }

  const before = await repository.findUserById(auth.userId);
  const updated = await repository.updateAvatar(auth.userId, fileId);

  await recordAudit({
    action: 'UPDATE',
    resourceType: 'User',
    resourceId: auth.userId,
    summary: fileId ? 'Profile avatar updated' : 'Profile avatar removed',
    changes: { avatarFileId: { from: before?.avatarFileId ?? null, to: fileId } },
  });

  return repository.toSummary(updated);
}
