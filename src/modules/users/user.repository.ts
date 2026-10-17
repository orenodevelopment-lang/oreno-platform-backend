import type { User, UserStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import type { UserProfile, UserSummary } from './user.types.js';

/** The columns that make up a `UserSummary`; shared by every projection. */
const SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatarFileId: true,
  jobTitle: true,
  status: true,
} satisfies Prisma.UserSelect;

export function toSummary(
  user: Pick<
    User,
    'id' | 'firstName' | 'lastName' | 'displayName' | 'avatarFileId' | 'jobTitle' | 'status'
  >,
): UserSummary {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    avatarFileId: user.avatarFileId,
    jobTitle: user.jobTitle,
    status: user.status,
  };
}

export async function findUserById(userId: string): Promise<User | undefined> {
  return (await getPrisma().user.findUnique({ where: { id: userId } })) ?? undefined;
}

/**
 * Load the profile view: the user plus their organisation memberships. The
 * caller decides whether the membership list may be returned (see policy); it
 * is loaded here because a second round trip would double the query count for
 * the common "view my own profile" case.
 */
export async function findUserProfile(userId: string): Promise<UserProfile | undefined> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        orderBy: { createdAt: 'asc' },
        select: {
          status: true,
          role: { select: { key: true } },
          organisation: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!user) return undefined;

  return {
    ...toSummary(user),
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    timeZone: user.timeZone,
    locale: user.locale,
    countryCode: user.countryCode,
    isPlatformAdmin: user.isPlatformAdmin,
    createdAt: user.createdAt.toISOString(),
    memberships: user.memberships.map((membership) => ({
      organisationId: membership.organisation.id,
      name: membership.organisation.name,
      slug: membership.organisation.slug,
      roleKey: membership.role.key,
      status: membership.status,
    })),
  };
}

/** Active organisation ids for a user, used to decide shared-tenancy visibility. */
export async function findActiveOrganisationIds(userId: string): Promise<string[]> {
  const rows = await getPrisma().organisationMembership.findMany({
    where: { userId, status: 'ACTIVE', organisation: { status: 'ACTIVE' } },
    select: { organisationId: true },
  });
  return rows.map((row) => row.organisationId);
}

export async function updateAvatar(
  userId: string,
  fileId: string | null,
): Promise<User> {
  return getPrisma().user.update({ where: { id: userId }, data: { avatarFileId: fileId } });
}

export interface SearchUsersParams {
  query?: string | undefined;
  status?: UserStatus | undefined;
  /** When set, results are limited to active members of these organisations. */
  organisationIds?: readonly string[] | undefined;
  skip: number;
  take: number;
}

export async function searchUsers(
  params: SearchUsersParams,
): Promise<{ items: UserSummary[]; total: number }> {
  const where: Prisma.UserWhereInput = {};

  if (params.query) {
    // Case-insensitive prefix/substring match across the identifying fields.
    // The dedicated search index arrives with the search module; this is the
    // correct-but-simple baseline for the member picker.
    where.OR = [
      { firstName: { contains: params.query, mode: 'insensitive' } },
      { lastName: { contains: params.query, mode: 'insensitive' } },
      { email: { contains: params.query, mode: 'insensitive' } },
      { displayName: { contains: params.query, mode: 'insensitive' } },
    ];
  }
  if (params.status) where.status = params.status;
  if (params.organisationIds) {
    where.memberships = { some: { organisationId: { in: [...params.organisationIds] } } };
  }

  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: params.skip,
      take: params.take,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: items.map(toSummary), total };
}
