import { authenticator } from 'otplib';
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import { generateToken, hashToken } from '../../src/common/security/tokens.js';
import {
  consumeAuthToken,
  createAuthToken,
} from '../../src/modules/auth/auth.repository.js';
import { buildSignedState, readSignedState } from '../../src/modules/auth/auth.oauth.js';
import {
  beginTwoFactorSetup,
  confirmTwoFactor,
} from '../../src/modules/auth/auth.two-factor.js';
import { acceptInvitation } from '../../src/modules/organisations/organisation.service.js';
import {
  authContext,
  createTestOrganisation,
  createTestUser,
  ensureOrganisationRole,
  suffix,
} from '../helpers/factories.js';

function oauthNonce(state: string): string {
  const body = state.split('.')[0];
  if (!body) throw new Error('OAuth state has no body.');
  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
    nonce: string;
  };
  return parsed.nonce;
}

describe('expiring, hashed, single-use security material', () => {
  it('atomically consumes verification and reset tokens once and rejects expiration', async () => {
    const user = await createTestUser('auth-token');
    const verification = generateToken();
    await createAuthToken({
      userId: user.id,
      email: user.email,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: verification.hash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const stored = await getPrisma().authToken.findUniqueOrThrow({
      where: { tokenHash: verification.hash },
    });
    expect(stored.tokenHash).toBe(hashToken(verification.token));
    expect(stored.tokenHash).not.toBe(verification.token);

    const simultaneous = await Promise.all([
      consumeAuthToken(verification.hash, 'EMAIL_VERIFICATION'),
      consumeAuthToken(verification.hash, 'EMAIL_VERIFICATION'),
    ]);
    expect(simultaneous.filter((result) => result.ok)).toHaveLength(1);
    expect(simultaneous.filter((result) => !result.ok)).toHaveLength(1);

    const reset = generateToken();
    await createAuthToken({
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      tokenHash: reset.hash,
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await consumeAuthToken(reset.hash, 'PASSWORD_RESET')).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('binds OAuth state to its browser, hashes it at rest, expires it, and prevents replay', async () => {
    const prisma = getPrisma();
    const attempt = await buildSignedState('google', undefined);
    const nonce = oauthNonce(attempt.state);
    const stored = await prisma.authToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(nonce) },
    });
    expect(stored.tokenHash).not.toBe(nonce);
    expect(JSON.stringify(stored.metadata)).not.toContain(attempt.browserToken);

    await expect(
      readSignedState(attempt.state, 'google', `${attempt.browserToken}-wrong`),
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID', status: 403 });
    const consumed = await readSignedState(attempt.state, 'google', attempt.browserToken);
    expect(consumed.codeVerifier).toBeTruthy();
    await expect(
      readSignedState(attempt.state, 'google', attempt.browserToken),
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID', status: 403 });

    const expired = await buildSignedState('linkedin', undefined);
    await prisma.authToken.update({
      where: { tokenHash: hashToken(oauthNonce(expired.state)) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      readSignedState(expired.state, 'linkedin', expired.browserToken),
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID', status: 403 });
    await expect(
      buildSignedState('google', 'https://attacker.example/return'),
    ).rejects.toMatchObject({ code: 'ORIGIN_NOT_ALLOWED', status: 403 });
  });

  it('keeps 2FA setup pending until confirmation and clears the one-time challenge', async () => {
    const prisma = getPrisma();
    const user = await createTestUser('two-factor');
    const setup = await beginTwoFactorSetup(user.id, user.email);
    const pending = await prisma.twoFactorCredential.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(pending.enabledAt).toBeNull();
    expect(pending.setupTokenHash).toBe(hashToken(setup.setupToken));
    expect(pending.setupTokenHash).not.toBe(setup.setupToken);
    expect(pending.setupExpiresAt?.getTime()).toBeGreaterThan(Date.now());

    const enabled = await confirmTwoFactor(
      user.id,
      authenticator.generate(setup.secret),
      setup.setupToken,
    );
    expect(enabled.recoveryCodes).toHaveLength(10);
    const confirmed = await prisma.twoFactorCredential.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(confirmed.enabledAt).not.toBeNull();
    expect(confirmed.setupTokenHash).toBeNull();
    const storedCodes = await prisma.twoFactorRecoveryCode.findMany({
      where: { userId: user.id },
    });
    expect(storedCodes).toHaveLength(10);
    expect(storedCodes.map((item) => item.codeHash)).not.toContain(enabled.recoveryCodes[0]);
    await expect(
      confirmTwoFactor(user.id, authenticator.generate(setup.secret), setup.setupToken),
    ).rejects.toMatchObject({ code: 'TWO_FACTOR_ALREADY_ENABLED', status: 409 });

    const expiredUser = await createTestUser('expired-two-factor');
    const expiredSetup = await beginTwoFactorSetup(expiredUser.id, expiredUser.email);
    await prisma.twoFactorCredential.update({
      where: { userId: expiredUser.id },
      data: { setupExpiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      confirmTwoFactor(
        expiredUser.id,
        authenticator.generate(expiredSetup.secret),
        expiredSetup.setupToken,
      ),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 });
  });

  it('accepts a hashed invitation once and rejects expired invitations', async () => {
    const prisma = getPrisma();
    const inviter = await createTestUser('inviter');
    const invited = await createTestUser('invited');
    const organisation = await createTestOrganisation('invitation');
    const role = await ensureOrganisationRole('MANAGER');
    const token = generateToken();
    const invitation = await prisma.invitation.create({
      data: {
        organisationId: organisation.id,
        email: invited.email,
        firstName: invited.firstName,
        lastName: invited.lastName,
        roleId: role.id,
        tokenHash: token.hash,
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect(invitation.tokenHash).toBe(hashToken(token.token));
    expect(invitation.tokenHash).not.toBe(token.token);

    const membership = await acceptInvitation(authContext(invited.id), token.token);
    expect(membership).toMatchObject({
      organisationId: organisation.id,
      userId: invited.id,
      status: 'ACTIVE',
    });
    await expect(
      acceptInvitation(authContext(invited.id), token.token),
    ).rejects.toMatchObject({ code: 'INVITATION_ALREADY_ACCEPTED', status: 409 });

    const expiredUser = await createTestUser(`expired-invite-${suffix()}`);
    const expiredToken = generateToken();
    await prisma.invitation.create({
      data: {
        organisationId: organisation.id,
        email: expiredUser.email,
        firstName: expiredUser.firstName,
        lastName: expiredUser.lastName,
        roleId: role.id,
        tokenHash: expiredToken.hash,
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(
      acceptInvitation(authContext(expiredUser.id), expiredToken.token),
    ).rejects.toMatchObject({ code: 'INVITATION_EXPIRED', status: 422 });
  });
});
