import type { Prisma, User } from '@prisma/client';
import { loadConfig } from '../../config/index.js';
import { getPrisma } from '../../database/prisma.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import { diffChanges, recordAudit } from '../../platform/audit/audit.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { stageEmail } from '../../platform/email/email.service.js';
import { completeIdempotent } from '../../platform/idempotency/idempotency.service.js';
import { EMAIL_TEMPLATES } from '../../platform/email/email.types.js';
import {
  hashPassword,
  simulatePasswordVerification,
  verifyPassword,
} from '../../common/security/password.js';
import {
  assessPassword,
  assertAcceptablePassword,
  PasswordPolicyError,
} from '../../common/security/password-policy.js';
import { generateToken, hashToken } from '../../common/security/tokens.js';
import {
  ConflictError,
  UnauthenticatedError,
  UnprocessableError,
  ValidationError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  createSession,
  listSessions,
  revokeAllSessions,
  revokeSession,
  type CreatedSession,
} from './session.service.js';
import { isTwoFactorEnabled, verifyTwoFactor } from './auth.two-factor.js';
import * as repository from './auth.repository.js';
import type {
  LoginInput,
  RegisterInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from './auth.schema.js';

const log = createModuleLogger('auth');

/**
 * Authentication service.
 *
 * Two invariants shape everything here:
 *
 *   1. Failures are indistinguishable. A login against an unknown address runs
 *      the same Argon2 work as a login against a known one, so response time
 *      does not reveal whether an account exists.
 *   2. Account enumeration is minimised. Registration is the one place that
 *      must disclose a duplicate address (the user needs to know to sign in
 *      instead), and password reset never discloses anything.
 */
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

export interface RequestMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  deviceLabel?: string | undefined;
}

export interface PublicUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  status: User['status'];
  firstName: string;
  lastName: string;
  displayName: string | null;
  phone: string | null;
  avatarFileId: string | null;
  locale: string;
  timeZone: string;
  countryCode: string | null;
  jobTitle: string | null;
  isPlatformAdmin: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function toPublicUser(user: User, twoFactorEnabled = false): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    status: user.status,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    phone: user.phone,
    avatarFileId: user.avatarFileId,
    locale: user.locale,
    timeZone: user.timeZone,
    countryCode: user.countryCode,
    jobTitle: user.jobTitle,
    isPlatformAdmin: user.isPlatformAdmin,
    twoFactorEnabled,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

export interface RegistrationResult {
  userId: string;
  accountType: RegisterInput['accountType'];
  talentProfileId: string | null;
  organisationId: string | null;
  nextStep: 'VERIFY_EMAIL';
}

export async function register(
  input: RegisterInput,
  meta: RequestMeta,
  idempotencyRecordId?: string,
): Promise<RegistrationResult> {
  const prisma = getPrisma();

  assertAcceptablePassword(input.password);

  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      ErrorCode.EMAIL_ALREADY_REGISTERED,
      'An account already exists for this email address. Try signing in instead.',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const { token, hash } = generateToken(32);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  const verificationUrl = `${loadConfig().appUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;

  const registration = await prisma.$transaction(async (tx) => {
    const created = await repository.createUserWithCredential(
      {
        registrationIntent: input.accountType,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        timeZone: input.timeZone,
        status: 'PENDING_VERIFICATION',
      },
      passwordHash,
      tx,
    );

    let talentProfileId: string | null = null;
    let organisationId: string | null = null;

    if (input.accountType === 'TALENT') {
      const profile = await tx.talentProfile.create({
        data: {
          userId: created.id,
          timeZone: created.timeZone,
          visibility: 'PRIVATE',
          status: 'DRAFT',
        },
        select: { id: true },
      });
      talentProfileId = profile.id;

      await emitEvent(tx, {
        eventKey: EVENT_KEYS.TALENT_PROFILE_CREATED,
        aggregateType: 'TalentProfile',
        aggregateId: profile.id,
        payload: { talentProfileId: profile.id, userId: created.id },
      });
    } else {
      const role = await tx.role.findUnique({
        where: { key: 'COMPANY_OWNER' },
        select: { id: true },
      });
      if (!role) {
        throw new Error('The COMPANY_OWNER role has not been seeded.');
      }

      const workspaceName = input.organisationName?.trim() || 'New organisation';
      const slugBase = workspaceName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 55) || 'organisation';
      const organisation = await tx.organisation.create({
        data: {
          name: workspaceName,
          slug: `${slugBase}-${created.id.slice(0, 8)}`,
          status: 'PENDING_VERIFICATION',
          verificationStatus: 'UNVERIFIED',
          primaryContactName: `${created.firstName} ${created.lastName}`,
          primaryContactEmail: created.email,
          timeZone: created.timeZone,
          onboarding: { create: { currentStep: 1 } },
          memberships: {
            create: {
              userId: created.id,
              roleId: role.id,
              status: 'ACTIVE',
              joinedAt: new Date(),
            },
          },
        },
        select: { id: true },
      });
      organisationId = organisation.id;

      await emitEvent(tx, {
        eventKey: EVENT_KEYS.ORGANISATION_CREATED,
        aggregateType: 'Organisation',
        aggregateId: organisation.id,
        organisationId: organisation.id,
        payload: { organisationId: organisation.id, ownerUserId: created.id },
      });
    }

    await tx.consentRecord.create({
      data: {
        userId: created.id,
        email: created.email,
        purpose: 'TERMS_AND_PRIVACY',
        granted: true,
        policyVersion: '2026-10-15',
        ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      },
    });

    await repository.createAuthToken({
      userId: created.id,
      email: created.email,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hash,
      expiresAt,
      client: tx,
    });

    await repository.recordSecurityEvent({
      userId: created.id,
      type: 'REGISTERED',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      client: tx,
    });

    await emitEvent(tx, {
      eventKey: EVENT_KEYS.USER_REGISTERED,
      aggregateType: 'User',
      aggregateId: created.id,
      payload: { userId: created.id },
    });
    await stageEmail(tx, {
      to: created.email,
      toName: created.firstName,
      template: EMAIL_TEMPLATES.EMAIL_VERIFICATION,
      variables: { firstName: created.firstName, verificationUrl },
      dedupeKey: `email-verification:${hash}`,
    });

    const result: RegistrationResult = {
      userId: created.id,
      accountType: input.accountType,
      talentProfileId,
      organisationId,
      nextStep: 'VERIFY_EMAIL',
    };

    // Completing the idempotency record in the same transaction closes the
    // response-lost window: a retry can replay this exact result without
    // creating a second account, profile, or organisation.
    if (idempotencyRecordId) {
      await completeIdempotent(idempotencyRecordId, 201, result, created.id, tx);
    }

    return { user: created, result };
  });

  return registration.result;
}

/* -------------------------------------------------------------------------- */
/* Login and logout                                                           */
/* -------------------------------------------------------------------------- */

export type LoginResult =
  | { outcome: 'authenticated'; user: PublicUser; session: CreatedSession }
  | { outcome: 'two_factor_required' };

export async function login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
  const { lockMinutes } = { lockMinutes: LOCK_MINUTES };
  const user = await repository.findUserByEmail(input.email);

  if (!user || !user.credential) {
    // Burn equivalent CPU so timing does not reveal that the address is unknown.
    await simulatePasswordVerification();
    throw new UnauthenticatedError(
      ErrorCode.INVALID_CREDENTIALS,
      'The email address or password is not correct.',
    );
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await repository.recordSecurityEvent({
      userId: user.id,
      type: 'LOGIN_FAILED',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail: { reason: 'locked' },
    });
    throw new UnauthenticatedError(
      ErrorCode.ACCOUNT_LOCKED,
      'This account is temporarily locked after repeated failed sign-in attempts.',
    );
  }

  const passwordMatches = await verifyPassword(user.credential.passwordHash, input.password);
  if (!passwordMatches) {
    const locked = await repository.registerFailedLogin(user.id, MAX_FAILED_LOGINS, lockMinutes);
    await repository.recordSecurityEvent({
      userId: user.id,
      type: locked ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new UnauthenticatedError(
      ErrorCode.INVALID_CREDENTIALS,
      'The email address or password is not correct.',
    );
  }

  assertAccountUsable(user);

  if (await isTwoFactorEnabled(user.id)) {
    if (!input.twoFactorCode) {
      throw new UnauthenticatedError(
        ErrorCode.TWO_FACTOR_REQUIRED,
        'Enter the code from your authenticator app to continue.',
      );
    }

    const verification = await verifyTwoFactor(user.id, input.twoFactorCode);
    if (!verification.valid) {
      await repository.recordSecurityEvent({
        userId: user.id,
        type: 'TWO_FACTOR_CHALLENGE_FAILED',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        detail: { reason: verification.reason },
      });
      throw new UnauthenticatedError(
        verification.reason === 'locked' ? ErrorCode.ACCOUNT_LOCKED : ErrorCode.TWO_FACTOR_INVALID,
        verification.reason === 'locked'
          ? 'Too many incorrect codes. Try again in a few minutes.'
          : 'That code is not valid.',
      );
    }

    await repository.recordSecurityEvent({
      userId: user.id,
      type: 'TWO_FACTOR_CHALLENGE_SUCCEEDED',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  const session = await createSession({
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    deviceLabel: meta.deviceLabel,
    // Reaching this point means either the account has no enabled factor or the
    // supplied factor was verified above.
    mfaSatisfied: true,
  });

  await repository.clearFailedLogins(user.id);
  await repository.recordSecurityEvent({
    userId: user.id,
    type: 'LOGIN_SUCCEEDED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    outcome: 'authenticated',
    user: toPublicUser(user, true),
    session,
  };
}

function assertAccountUsable(user: {
  status: User['status'];
  suspendedReason?: string | null;
}): void {
  switch (user.status) {
    case 'ACTIVE':
    case 'PENDING_VERIFICATION':
      return;
    case 'SUSPENDED':
      throw new UnauthenticatedError(
        ErrorCode.ACCOUNT_SUSPENDED,
        'This account has been suspended. Contact support for help.',
      );
    case 'DEACTIVATED':
      throw new UnauthenticatedError(
        ErrorCode.ACCOUNT_DEACTIVATED,
        'This account has been deactivated.',
      );
    default:
      throw new UnauthenticatedError(ErrorCode.UNAUTHENTICATED, 'This account cannot sign in.');
  }
}

export async function logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
  await revokeSession(sessionId, 'user_logout');
  await repository.recordSecurityEvent({
    userId,
    type: 'LOGOUT',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function logoutEverywhere(
  userId: string,
  exceptSessionId: string | undefined,
  meta: RequestMeta,
): Promise<number> {
  const count = await revokeAllSessions(userId, 'user_logout_all', {
    ...(exceptSessionId ? { exceptSessionId } : {}),
  });
  await repository.recordSecurityEvent({
    userId,
    type: 'SESSIONS_REVOKED_ALL',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    detail: { revokedCount: count },
  });
  return count;
}

/* -------------------------------------------------------------------------- */
/* Email verification                                                         */
/* -------------------------------------------------------------------------- */

export async function verifyEmail(token: string, meta: RequestMeta): Promise<void> {
  const result = await repository.consumeAuthToken(hashToken(token), 'EMAIL_VERIFICATION');

  if (!result.ok) {
    throw new UnprocessableError(
      result.reason === 'expired' ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
      result.reason === 'expired'
        ? 'This verification link has expired. Request a new one.'
        : 'This verification link is not valid or has already been used.',
    );
  }
  if (!result.userId) {
    throw new UnprocessableError(ErrorCode.TOKEN_INVALID, 'This verification link is not valid.');
  }

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: result.userId!, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.USER_EMAIL_VERIFIED,
      aggregateType: 'User',
      aggregateId: result.userId!,
      payload: { userId: result.userId },
    });
  });

  await repository.recordSecurityEvent({
    userId: result.userId,
    type: 'EMAIL_VERIFIED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

/**
 * Re-send a verification email.
 *
 * Always reports success: distinguishing "already verified" from "no such
 * account" would turn this endpoint into an account-enumeration oracle.
 */
export async function resendVerification(email: string, meta: RequestMeta): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true, status: true },
  });

  if (!user || user.emailVerifiedAt || user.status !== 'PENDING_VERIFICATION') {
    log.debug({ email }, 'verification resend requested for an ineligible address');
    return;
  }

  const { token, hash } = generateToken(32);
  const config = loadConfig();
  const verificationUrl = `${config.appUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  await prisma.$transaction(async (tx) => {
    // Only the newest link should work; supersede any outstanding ones.
    await repository.invalidateAuthTokens({ userId: user.id, purpose: 'EMAIL_VERIFICATION' }, tx);
    await repository.createAuthToken({
      userId: user.id,
      email: user.email,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      client: tx,
    });
    await stageEmail(tx, {
      to: user.email,
      toName: user.firstName,
      template: EMAIL_TEMPLATES.EMAIL_VERIFICATION,
      variables: { firstName: user.firstName, verificationUrl },
      dedupeKey: `email-verification:${hash}`,
    });
  });

  await repository.recordSecurityEvent({
    userId: user.id,
    type: 'EMAIL_VERIFICATION_RESENT',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

/* -------------------------------------------------------------------------- */
/* Password reset and change                                                  */
/* -------------------------------------------------------------------------- */

/** Always succeeds from the caller's perspective. Never discloses existence. */
export async function requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, firstName: true, status: true },
  });

  if (!user || user.status === 'DEACTIVATED') return;

  const { token, hash } = generateToken(32);
  const config = loadConfig();
  const resetUrl = `${config.appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  await prisma.$transaction(async (tx) => {
    await repository.invalidateAuthTokens({ userId: user.id, purpose: 'PASSWORD_RESET' }, tx);
    await repository.createAuthToken({
      userId: user.id,
      email: user.email,
      purpose: 'PASSWORD_RESET',
      tokenHash: hash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      client: tx,
    });
    await stageEmail(tx, {
      to: user.email,
      toName: user.firstName,
      template: EMAIL_TEMPLATES.PASSWORD_RESET,
      variables: { firstName: user.firstName, resetUrl },
      dedupeKey: `password-reset:${hash}`,
    });
  });

  await repository.recordSecurityEvent({
    userId: user.id,
    type: 'PASSWORD_RESET_REQUESTED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  assertAcceptablePassword(newPassword);

  const result = await repository.consumeAuthToken(hashToken(token), 'PASSWORD_RESET');
  if (!result.ok || !result.userId) {
    throw new UnprocessableError(
      result.ok === false && result.reason === 'expired'
        ? ErrorCode.TOKEN_EXPIRED
        : ErrorCode.TOKEN_INVALID,
      'This password reset link is not valid or has expired.',
    );
  }

  await assertPasswordNotReused(result.userId, newPassword);

  const passwordHash = await hashPassword(newPassword);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await repository.updatePassword(result.userId!, passwordHash, tx);
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.USER_PASSWORD_RESET_COMPLETED,
      aggregateType: 'User',
      aggregateId: result.userId!,
      payload: { userId: result.userId },
    });
  });

  await repository.recordSecurityEvent({
    userId: result.userId,
    type: 'PASSWORD_RESET_COMPLETED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  // A reset is a recovery action: assume any existing session may be the
  // attacker's and terminate them all.
  await revokeAllSessions(result.userId, 'password_reset');
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionId: string | undefined,
  meta: RequestMeta,
): Promise<void> {
  assertAcceptablePassword(newPassword);

  const user = await repository.findUserById(userId);
  if (!user?.credential) {
    throw new UnprocessableError(
      ErrorCode.INVALID_CREDENTIALS,
      'This account does not have a password to change.',
    );
  }

  if (!(await verifyPassword(user.credential.passwordHash, currentPassword))) {
    throw new UnauthenticatedError(
      ErrorCode.INVALID_CREDENTIALS,
      'Your current password is not correct.',
    );
  }

  if (currentPassword === newPassword) {
    throw new ValidationError('Choose a password you have not used before.', {
      fieldErrors: { newPassword: ['The new password must differ from the current one.'] },
    });
  }

  await assertPasswordNotReused(userId, newPassword);

  const passwordHash = await hashPassword(newPassword);
  const prisma = getPrisma();
  const config = loadConfig();

  await prisma.$transaction(async (tx) => {
    await repository.updatePassword(userId, passwordHash, tx);
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.USER_PASSWORD_CHANGED,
      aggregateType: 'User',
      aggregateId: userId,
      payload: { userId },
    });
    await stageEmail(tx, {
      to: user.email,
      toName: user.firstName,
      template: EMAIL_TEMPLATES.PASSWORD_CHANGED,
      variables: { firstName: user.firstName, changedAt: new Date().toUTCString() },
      replyTo: config.email.fromAddress,
    });
  });

  await repository.recordSecurityEvent({
    userId,
    type: 'PASSWORD_CHANGED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await revokeAllSessions(userId, 'password_changed', {
    ...(keepSessionId ? { exceptSessionId: keepSessionId } : {}),
  });

}

async function assertPasswordNotReused(userId: string, password: string): Promise<void> {
  const previous = await repository.recentPasswordHashes(userId);
  for (const hash of previous) {
    if (await verifyPassword(hash, password)) {
      throw new ValidationError('Choose a password you have not used before.', {
        fieldErrors: { newPassword: ['This password was used recently on this account.'] },
      });
    }
  }
}

export function passwordProblems(password: string): string[] {
  return assessPassword(password).problems;
}

/* -------------------------------------------------------------------------- */
/* Profile, preferences and account activity                                  */
/* -------------------------------------------------------------------------- */

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await repository.findPublicUserById(userId);
  if (!user) {
    throw new UnauthenticatedError(ErrorCode.UNAUTHENTICATED, 'This account no longer exists.');
  }
  return toPublicUser(user, await isTwoFactorEnabled(userId));
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  meta: RequestMeta,
): Promise<PublicUser> {
  const prisma = getPrisma();

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      displayName: true,
      phone: true,
      locale: true,
      timeZone: true,
      countryCode: true,
      jobTitle: true,
    },
  });
  if (!before) {
    throw new UnauthenticatedError(ErrorCode.UNAUTHENTICATED, 'This account no longer exists.');
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.displayName !== undefined) data.displayName = input.displayName || null;
  if (input.phone !== undefined) data.phone = input.phone ?? null;
  if (input.locale !== undefined) data.locale = input.locale;
  if (input.timeZone !== undefined) data.timeZone = input.timeZone;
  if (input.countryCode !== undefined) data.countryCode = input.countryCode ?? null;
  if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle || null;

  const updated = await prisma.user.update({ where: { id: userId }, data });

  await prisma.$transaction(async (tx) => {
    const changes = diffChanges(before, {
      firstName: updated.firstName,
      lastName: updated.lastName,
      displayName: updated.displayName,
      phone: updated.phone,
      locale: updated.locale,
      timeZone: updated.timeZone,
      countryCode: updated.countryCode,
      jobTitle: updated.jobTitle,
    });
    if (changes) {
      await recordAudit(
        {
          action: 'UPDATE',
          resourceType: 'User',
          resourceId: userId,
          summary: 'Profile details updated',
          changes,
        },
        tx,
      );
    }
  });

  void meta;
  return toPublicUser(updated, await isTwoFactorEnabled(userId));
}

export async function getPreferences(userId: string) {
  const prisma = getPrisma();
  const preferences = await prisma.userPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return preferences;
}

export async function updatePreferences(userId: string, input: UpdatePreferencesInput) {
  const prisma = getPrisma();
  return prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: { ...input },
  });
}

export interface SessionSummary {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export async function listSessionsForUser(
  userId: string,
  currentSessionId: string | undefined,
): Promise<SessionSummary[]> {
  const sessions = await listSessions(userId);
  return sessions.map((session) => ({
    id: session.id,
    current: session.id === currentSessionId,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    deviceLabel: session.deviceLabel,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  }));
}

export async function revokeUserSession(
  userId: string,
  sessionId: string,
  meta: RequestMeta,
): Promise<void> {
  const prisma = getPrisma();
  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId, revokedAt: null },
    select: { id: true },
  });

  if (!session) {
    throw new UnprocessableError(
      ErrorCode.NOT_FOUND,
      'That session was not found or has already ended.',
    );
  }

  await revokeSession(sessionId, 'revoked_by_user');
  await repository.recordSecurityEvent({
    userId,
    type: 'SESSION_REVOKED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    detail: { sessionId },
  });
}

export async function listAccountActivity(
  userId: string,
  pagination: { skip: number; take: number },
) {
  return repository.listSecurityEvents(userId, pagination);
}

export { PasswordPolicyError };
