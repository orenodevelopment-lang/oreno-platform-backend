import type { MembershipStatus, RoleKey } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { createModuleLogger } from '../../common/logging/logger.js';

const log = createModuleLogger('rbac');

/**
 * Resolves what an actor is allowed to do.
 *
 * Platform grants come from `PlatformRoleAssignment`; organisation grants come
 * from `OrganisationMembership`. Both are read with their role's permissions in
 * a single query each, so authorising a request costs two indexed lookups at
 * most, and the result is cached briefly in-process.
 *
 * The cache is invalidated explicitly whenever a role, membership or grant
 * changes (see `invalidateUser`), so a permission change is visible on the
 * next request without waiting for a TTL.
 */
export interface ResolvedAuthorisation {
  userId: string;
  isPlatformAdmin: boolean;
  platformRoles: RoleKey[];
  platformPermissions: Set<string>;
  organisationId?: string;
  membershipId?: string;
  membershipStatus?: MembershipStatus;
  organisationRole?: RoleKey;
  organisationPermissions: Set<string>;
  scopedDepartmentIds: string[];
}

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: ResolvedAuthorisation;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, organisationId: string | undefined): string {
  return `${userId}::${organisationId ?? '-'}`;
}

function readCache(key: string): ResolvedAuthorisation | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(key: string, value: ResolvedAuthorisation): void {
  // Bound the cache so a long-lived process cannot grow without limit.
  if (cache.size > 5_000) cache.clear();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Drop every cached authorisation for a user (all organisation scopes). */
export function invalidateUser(userId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}::`)) cache.delete(key);
  }
}

/** Drop every cached authorisation touching an organisation. */
export function invalidateOrganisation(organisationId: string): void {
  for (const key of cache.keys()) {
    if (key.endsWith(`::${organisationId}`)) cache.delete(key);
  }
}

export function clearAuthorisationCache(): void {
  cache.clear();
}

async function loadPlatformGrants(userId: string): Promise<{
  roles: RoleKey[];
  permissions: Set<string>;
}> {
  const prisma = getPrisma();
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { userId, revokedAt: null, role: { scope: 'PLATFORM' } },
    select: {
      role: {
        select: {
          key: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  const roles: RoleKey[] = [];
  const permissions = new Set<string>();
  for (const assignment of assignments) {
    roles.push(assignment.role.key);
    for (const grant of assignment.role.permissions) permissions.add(grant.permission.key);
  }
  return { roles, permissions };
}

async function loadOrganisationGrants(
  userId: string,
  organisationId: string,
): Promise<
  Pick<
    ResolvedAuthorisation,
    | 'membershipId'
    | 'membershipStatus'
    | 'organisationRole'
    | 'organisationPermissions'
    | 'scopedDepartmentIds'
  >
> {
  const prisma = getPrisma();
  const membership = await prisma.organisationMembership.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    select: {
      id: true,
      status: true,
      scopedDepartmentIds: true,
      role: {
        select: {
          key: true,
          scope: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  if (!membership || membership.role.scope !== 'ORGANISATION') {
    return { organisationPermissions: new Set<string>(), scopedDepartmentIds: [] };
  }

  const permissions = new Set<string>();
  // Suspended and revoked memberships retain their row for history but hold no
  // grants: the membership record is evidence, not authorisation.
  if (membership.status === 'ACTIVE') {
    for (const grant of membership.role.permissions) permissions.add(grant.permission.key);
  }

  const scoped = Array.isArray(membership.scopedDepartmentIds)
    ? (membership.scopedDepartmentIds as unknown[]).filter(
        (value): value is string => typeof value === 'string',
      )
    : [];

  return {
    membershipId: membership.id,
    membershipStatus: membership.status,
    organisationRole: membership.role.key,
    organisationPermissions: permissions,
    scopedDepartmentIds: scoped,
  };
}

/**
 * Resolve the actor's full authorisation for an optional organisation scope.
 * Never throws for a missing membership: an absent membership is an actor with
 * no organisation grants, which downstream policy turns into a 403 or a 404.
 */
export async function resolveAuthorisation(
  userId: string,
  organisationId: string | undefined,
  options: { bypassCache?: boolean } = {},
): Promise<ResolvedAuthorisation> {
  const key = cacheKey(userId, organisationId);
  if (!options.bypassCache) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  const prisma = getPrisma();
  const [user, platform, organisation] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } }),
    loadPlatformGrants(userId),
    organisationId
      ? loadOrganisationGrants(userId, organisationId)
      : Promise.resolve({
          organisationPermissions: new Set<string>(),
          scopedDepartmentIds: [] as string[],
        }),
  ]);

  const resolved: ResolvedAuthorisation = {
    userId,
    isPlatformAdmin: user?.isPlatformAdmin ?? false,
    platformRoles: platform.roles,
    platformPermissions: platform.permissions,
    ...(organisationId ? { organisationId } : {}),
    ...organisation,
  };

  writeCache(key, resolved);
  return resolved;
}

/**
 * Assert that a resolved actor holds a permission, returning a boolean rather
 * than throwing so callers choose the failure shape (403 at a route, 404 when
 * revealing existence would itself leak information).
 */
export function allows(authorisation: ResolvedAuthorisation, permission: string): boolean {
  return (
    authorisation.platformPermissions.has(permission) ||
    authorisation.organisationPermissions.has(permission)
  );
}

export function allowsAny(
  authorisation: ResolvedAuthorisation,
  permissions: readonly string[],
): boolean {
  return permissions.some((permission) => allows(authorisation, permission));
}

export async function hasPlatformPermission(userId: string, permission: string): Promise<boolean> {
  const resolved = await resolveAuthorisation(userId, undefined);
  return resolved.platformPermissions.has(permission);
}

/** Log when a decision is denied for auditability without leaking the rule set. */
export function logDenied(userId: string, permission: string, route: string): void {
  log.warn({ userId, permission, route }, 'authorisation denied');
}
