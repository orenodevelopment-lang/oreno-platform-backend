import type { MembershipStatus, UserStatus } from '@prisma/client';

/**
 * The shapes the users module returns.
 *
 * `UserSummary` is the safe projection of a person used anywhere in the
 * platform that needs to render "who is this" without exposing contact detail
 * or security state. `UserProfile` is the fuller view, returned only under the
 * policy in `user.policy.ts`.
 */
export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatarFileId: string | null;
  jobTitle: string | null;
  status: UserStatus;
}

export interface UserOrganisationMembership {
  organisationId: string;
  name: string;
  slug: string;
  roleKey: string;
  status: MembershipStatus;
}

export interface UserProfile extends UserSummary {
  email: string;
  emailVerified: boolean;
  timeZone: string;
  locale: string;
  countryCode: string | null;
  isPlatformAdmin: boolean;
  createdAt: string;
  /** Organisations the user belongs to, visible only to the user or an admin. */
  memberships: UserOrganisationMembership[];
}
