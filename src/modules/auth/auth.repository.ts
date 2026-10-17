import type { Prisma, SecurityEvent, SecurityEventType, TokenPurpose, User } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';

/**
 * Data access for identity and account security.
 *
 * Password material lives only here: `UserCredential` is never selected by any
 * other module, so a careless `include` elsewhere cannot leak a password hash
 * into a response.
 */
export type Db = Prisma.TransactionClient;

export interface UserWithSecurityState extends User {
  credential: { passwordHash: string; passwordAlgo: string } | null;
  twoFactor: {
    enabledAt: Date | null;
    lockedUntil: Date | null;
    failedAttemptCount: number;
  } | null;
}

export async function findUserByEmail(email: string): Promise<UserWithSecurityState | undefined> {
  const user = await getPrisma().user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      credential: { select: { passwordHash: true, passwordAlgo: true } },
      twoFactor: {
        select: { enabledAt: true, lockedUntil: true, failedAttemptCount: true },
      },
    },
  });
  return user ?? undefined;
}

export async function findUserById(userId: string): Promise<UserWithSecurityState | undefined> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    include: {
      credential: { select: { passwordHash: true, passwordAlgo: true } },
      twoFactor: {
        select: { enabledAt: true, lockedUntil: true, failedAttemptCount: true },
      },
    },
  });
  return user ?? undefined;
}

export async function findPublicUserById(userId: string): Promise<User | undefined> {
  return (await getPrisma().user.findUnique({ where: { id: userId } })) ?? undefined;
}

export interface CreateUserRecord {
  registrationIntent: NonNullable<User['registrationIntent']>;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | undefined;
  timeZone?: string | undefined;
  status?: User['status'];
}

export async function createUserWithCredential(
  input: CreateUserRecord,
  passwordHash: string,
  client: Db = getPrisma(),
): Promise<User> {
  return client.user.create({
    data: {
      email: input.email.toLowerCase(),
      registrationIntent: input.registrationIntent,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      timeZone: input.timeZone ?? 'UTC',
      status: input.status ?? 'PENDING_VERIFICATION',
      credential: {
        create: { passwordHash, passwordAlgo: 'argon2id' },
      },
      preferences: { create: {} },
    },
  });
}

export async function updatePassword(
  userId: string,
  passwordHash: string,
  client: Db = getPrisma(),
): Promise<void> {
  const existing = await client.userCredential.findUnique({
    where: { userId },
    select: { passwordHash: true },
  });

  // Retain the previous hash so a recently used password cannot be reused.
  if (existing) {
    await client.passwordHistory.create({
      data: { userId, passwordHash: existing.passwordHash },
    });
  }

  await client.userCredential.upsert({
    where: { userId },
    create: { userId, passwordHash, passwordAlgo: 'argon2id' },
    update: { passwordHash, passwordAlgo: 'argon2id', changedAt: new Date() },
  });
}

/** The last N distinct password hashes, for reuse prevention. */
export async function recentPasswordHashes(userId: string, limit = 5): Promise<string[]> {
  const rows = await getPrisma().passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { passwordHash: true },
  });
  const current = await getPrisma().userCredential.findUnique({
    where: { userId },
    select: { passwordHash: true },
  });
  return [...(current ? [current.passwordHash] : []), ...rows.map((row) => row.passwordHash)];
}

export async function recordSecurityEvent(input: {
  userId?: string | null;
  organisationId?: string | null;
  type: SecurityEventType;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  detail?: Record<string, unknown> | undefined;
  client?: Db;
}): Promise<void> {
  await (input.client ?? getPrisma()).securityEvent.create({
    data: {
      userId: input.userId ?? null,
      organisationId: input.organisationId ?? null,
      type: input.type,
      ipAddress: input.ipAddress?.slice(0, 64) ?? null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      ...(input.detail ? { detail: input.detail as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function createAuthToken(input: {
  userId?: string | null;
  email?: string | null;
  purpose: TokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  metadata?: Record<string, unknown> | undefined;
  client?: Db;
}): Promise<void> {
  await (input.client ?? getPrisma()).authToken.create({
    data: {
      userId: input.userId ?? null,
      email: input.email?.toLowerCase() ?? null,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}

/**
 * Consume a single-use token atomically.
 *
 * The conditional update is what makes it single-use: two concurrent requests
 * presenting the same token cannot both see `consumedAt: null` and both proceed,
 * because only one of them updates a row.
 */
export async function consumeAuthToken(
  tokenHash: string,
  purpose: TokenPurpose,
): Promise<
  | { ok: true; userId: string | null; email: string | null }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' }
> {
  const prisma = getPrisma();

  const token = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      email: true,
      purpose: true,
      expiresAt: true,
      consumedAt: true,
    },
  });

  if (!token || token.purpose !== purpose) return { ok: false, reason: 'not_found' };
  if (token.consumedAt) return { ok: false, reason: 'used' };
  if (token.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  const result = await prisma.authToken.updateMany({
    where: { id: token.id, consumedAt: null },
    data: { consumedAt: new Date(), attemptCount: { increment: 1 } },
  });

  if (result.count === 0) return { ok: false, reason: 'used' };
  return { ok: true, userId: token.userId, email: token.email };
}

export async function invalidateAuthTokens(
  where: Prisma.AuthTokenWhereInput,
  client: Db = getPrisma(),
): Promise<number> {
  const result = await client.authToken.updateMany({
    where: { ...where, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return result.count;
}

export async function countRecentSecurityEvents(
  userId: string,
  type: SecurityEventType,
  windowMs: number,
): Promise<number> {
  return getPrisma().securityEvent.count({
    where: { userId, type, createdAt: { gte: new Date(Date.now() - windowMs) } },
  });
}

export async function registerFailedLogin(
  userId: string,
  lockThreshold: number,
  lockMinutes: number,
): Promise<boolean> {
  const prisma = getPrisma();
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });

  if (user.failedLoginCount >= lockThreshold) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + lockMinutes * 60_000),
        failedLoginCount: 0,
      },
    });
    return true;
  }
  return false;
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await getPrisma().user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

export async function listSecurityEvents(
  userId: string,
  pagination: { skip: number; take: number },
): Promise<{ items: SecurityEvent[]; total: number }> {
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.securityEvent.count({ where: { userId } }),
  ]);
  return { items, total };
}
