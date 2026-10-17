import type { IdentityProvider } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { UnauthenticatedError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import * as repository from './auth.repository.js';
import type { OAuthIdentity, OAuthProviderKey } from './auth.oauth.js';
import type { RequestMeta } from './auth.service.js';

const log = createModuleLogger('auth.oauth');

/**
 * Resolve a federated identity to a local user.
 *
 * The order matters and is security-relevant:
 *
 *   1. Match on the provider's stable subject identifier. This is the only
 *      identifier a provider guarantees will not change.
 *   2. Only if there is no existing link do we consider the email address, and
 *      only when the provider asserts the address is verified. Auto-linking on
 *      an unverified address would let anyone who can register that address at
 *      any provider take over an existing Oreno account.
 */
export interface OAuthResolution {
  userId: string;
  created: boolean;
  linked: boolean;
}

export async function resolveOAuthUser(
  identity: OAuthIdentity,
  meta: RequestMeta,
): Promise<OAuthResolution> {
  const prisma = getPrisma();
  const provider = identity.provider.toUpperCase() as IdentityProvider;

  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider,
        providerUserId: identity.providerUserId,
      },
    },
    select: { userId: true, user: { select: { status: true } } },
  });

  if (existingIdentity) {
    await prisma.userIdentity.update({
      where: {
        provider_providerUserId: { provider, providerUserId: identity.providerUserId },
      },
      data: { lastUsedAt: new Date() },
    });

    if (
      existingIdentity.user.status === 'SUSPENDED' ||
      existingIdentity.user.status === 'DEACTIVATED'
    ) {
      throw new UnauthenticatedError(
        ErrorCode.ACCOUNT_SUSPENDED,
        'This account is not available. Contact support for help.',
      );
    }

    await repository.recordSecurityEvent({
      userId: existingIdentity.userId,
      type: 'LOGIN_SUCCEEDED',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail: { provider },
    });

    return { userId: existingIdentity.userId, created: false, linked: false };
  }

  if (!identity.email || !identity.emailVerified) {
    await repository.recordSecurityEvent({
      type: 'OAUTH_LOGIN_FAILED',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail: { provider, reason: 'no_verified_email' },
    });
    throw new UnauthenticatedError(
      ErrorCode.OAUTH_EMAIL_UNAVAILABLE,
      'That provider did not share a verified email address. Sign in with email and link the provider from your account settings.',
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true, status: true, emailVerifiedAt: true },
  });

  if (existingUser) {
    if (existingUser.status === 'SUSPENDED' || existingUser.status === 'DEACTIVATED') {
      throw new UnauthenticatedError(
        ErrorCode.ACCOUNT_SUSPENDED,
        'This account is not available. Contact support for help.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.userIdentity.create({
        data: {
          userId: existingUser.id,
          provider,
          providerUserId: identity.providerUserId,
          email: identity.email ?? null,
          displayName: identity.displayName ?? null,
          avatarUrl: identity.avatarUrl ?? null,
          lastUsedAt: new Date(),
        },
      });
      // A verified provider address also verifies the local account.
      if (!existingUser.emailVerifiedAt) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
        });
      }
    });

    await repository.recordSecurityEvent({
      userId: existingUser.id,
      type: 'OAUTH_LINKED',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail: { provider },
    });

    log.info(
      { userId: existingUser.id, provider },
      'linked federated identity to existing account',
    );
    return { userId: existingUser.id, created: false, linked: true };
  }

  const [firstName, ...rest] = (
    identity.displayName ??
    identity.email.split('@')[0] ??
    'Oreno'
  ).split(' ');
  const userId = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: identity.email!,
        registrationIntent: 'TALENT',
        firstName: (firstName ?? 'Oreno').slice(0, 120),
        lastName: rest.join(' ').slice(0, 120) || 'Member',
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
        preferences: { create: {} },
        identities: {
          create: {
            provider,
            providerUserId: identity.providerUserId,
            email: identity.email ?? null,
            displayName: identity.displayName ?? null,
            avatarUrl: identity.avatarUrl ?? null,
            lastUsedAt: new Date(),
          },
        },
      },
      select: { id: true },
    });

    await emitEvent(tx, {
      eventKey: EVENT_KEYS.USER_REGISTERED,
      aggregateType: 'User',
      aggregateId: created.id,
      payload: { userId: created.id, provider },
    });

    return created.id;
  });

  await repository.recordSecurityEvent({
    userId,
    type: 'REGISTERED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    detail: { provider },
  });

  return { userId, created: true, linked: false };
}

/** Detach a federated identity, refusing to leave the account unreachable. */
export async function unlinkIdentity(userId: string, provider: OAuthProviderKey): Promise<void> {
  const prisma = getPrisma();
  const identity = await prisma.userIdentity.findFirst({
    where: { userId, provider: provider.toUpperCase() as IdentityProvider },
    select: { id: true },
  });

  if (!identity) {
    throw new UnauthenticatedError(
      ErrorCode.OAUTH_EXCHANGE_FAILED,
      'That sign-in provider is not linked to this account.',
    );
  }

  const [credential, identityCount] = await Promise.all([
    prisma.userCredential.findUnique({ where: { userId }, select: { userId: true } }),
    prisma.userIdentity.count({ where: { userId } }),
  ]);

  if (!credential && identityCount <= 1) {
    throw new UnauthenticatedError(
      ErrorCode.OAUTH_IDENTITY_ALREADY_LINKED,
      'Set a password before removing your only sign-in method.',
    );
  }

  await prisma.userIdentity.delete({ where: { id: identity.id } });
  await repository.recordSecurityEvent({
    userId,
    type: 'OAUTH_UNLINKED',
    detail: { provider },
  });
}
