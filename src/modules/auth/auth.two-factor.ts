import { authenticator } from 'otplib';
import { loadConfig } from '../../config/index.js';
import { getPrisma } from '../../database/prisma.js';
import { decryptField, encryptField } from '../../common/security/encryption.js';
import {
  generateNumericCode,
  generateToken,
  hashToken,
  safeCompare,
} from '../../common/security/tokens.js';
import { verifyPassword } from '../../common/security/password.js';
import {
  ConflictError,
  UnauthenticatedError,
  UnprocessableError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

/**
 * Time-based one-time passwords.
 *
 * The shared secret is encrypted at rest, recovery codes are stored only as
 * hashes, and a wrong code increments a counter that locks the second factor
 * after repeated failures — otherwise a TOTP field is a six-digit brute-force
 * target with no rate limit of its own.
 */
const RECOVERY_CODE_COUNT = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const ALLOWED_DRIFT_SECONDS = 30;
const SETUP_TTL_MS = 10 * 60 * 1000;

authenticator.options = {
  window: [1, 1], // Accept the adjacent 30-second step on either side.
  step: ALLOWED_DRIFT_SECONDS,
};

export interface TwoFactorSetup {
  /** Base32 secret, shown once so the user can enter it manually. */
  secret: string;
  /** `otpauth://` URI for the authenticator app / QR code. */
  otpauthUrl: string;
  /** Opaque, single-use proof that this session initiated the setup. */
  setupToken: string;
  expiresAt: string;
}

export async function beginTwoFactorSetup(userId: string, email: string): Promise<TwoFactorSetup> {
  const prisma = getPrisma();
  const config = loadConfig();

  const existing = await prisma.twoFactorCredential.findUnique({ where: { userId } });
  if (existing?.enabledAt) {
    throw new ConflictError(
      ErrorCode.TWO_FACTOR_ALREADY_ENABLED,
      'Two-factor authentication is already enabled for this account.',
    );
  }

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, config.platform.totpIssuer, secret);
  const setup = generateToken(32);
  const setupExpiresAt = new Date(Date.now() + SETUP_TTL_MS);

  await prisma.twoFactorCredential.upsert({
    where: { userId },
    create: {
      userId,
      secretEncrypted: encryptField(secret),
      setupTokenHash: setup.hash,
      setupExpiresAt,
    },
    // Re-running setup before confirmation replaces the pending secret rather
    // than leaving a stale one.
    update: {
      secretEncrypted: encryptField(secret),
      setupTokenHash: setup.hash,
      setupExpiresAt,
      failedAttemptCount: 0,
      lockedUntil: null,
    },
  });

  return { secret, otpauthUrl, setupToken: setup.token, expiresAt: setupExpiresAt.toISOString() };
}

export interface TwoFactorEnableResult {
  /** Plaintext recovery codes. Returned once and never retrievable again. */
  recoveryCodes: string[];
}

export async function confirmTwoFactor(
  userId: string,
  code: string,
  setupToken: string,
): Promise<TwoFactorEnableResult> {
  const prisma = getPrisma();
  const credential = await prisma.twoFactorCredential.findUnique({ where: { userId } });

  if (!credential) {
    throw new UnprocessableError(
      ErrorCode.TWO_FACTOR_NOT_ENABLED,
      'Start two-factor setup before confirming it.',
    );
  }
  if (credential.enabledAt) {
    throw new ConflictError(
      ErrorCode.TWO_FACTOR_ALREADY_ENABLED,
      'Two-factor authentication is already enabled for this account.',
    );
  }

  if (
    !credential.setupTokenHash ||
    !credential.setupExpiresAt ||
    credential.setupExpiresAt.getTime() <= Date.now() ||
    !safeCompare(credential.setupTokenHash, hashToken(setupToken))
  ) {
    throw new UnauthenticatedError(
      ErrorCode.TOKEN_EXPIRED,
      'This two-factor setup has expired. Start setup again.',
    );
  }

  const secret = decryptField(credential.secretEncrypted);
  if (!authenticator.check(code.replace(/\s+/g, ''), secret)) {
    throw new UnauthenticatedError(
      ErrorCode.TWO_FACTOR_INVALID,
      'That code is not valid. Check your authenticator app and try again.',
    );
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    formatRecoveryCode(generateNumericCode(10)),
  );

  await prisma.$transaction(async (tx) => {
    const enabled = await tx.twoFactorCredential.updateMany({
      where: {
        userId,
        enabledAt: null,
        setupTokenHash: credential.setupTokenHash,
        setupExpiresAt: { gt: new Date() },
      },
      data: {
        enabledAt: new Date(),
        setupTokenHash: null,
        setupExpiresAt: null,
        failedAttemptCount: 0,
        lockedUntil: null,
      },
    });
    if (enabled.count !== 1) {
      throw new UnauthenticatedError(
        ErrorCode.TOKEN_ALREADY_USED,
        'This two-factor setup was already completed or expired.',
      );
    }
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
    await tx.twoFactorRecoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({
        userId,
        codeHash: hashToken(normaliseRecoveryCode(recoveryCode)),
      })),
    });
  });

  return { recoveryCodes };
}

export type TwoFactorVerification =
  { valid: true; via: 'totp' | 'recovery_code' } | { valid: false; reason: 'locked' | 'invalid' };

/**
 * Verify a second-factor code, accepting either a TOTP code or an unused
 * recovery code. A used recovery code is deleted immediately.
 */
export async function verifyTwoFactor(
  userId: string,
  code: string,
): Promise<TwoFactorVerification> {
  const prisma = getPrisma();
  const credential = await prisma.twoFactorCredential.findUnique({ where: { userId } });
  if (!credential?.enabledAt) return { valid: false, reason: 'invalid' };

  if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
    return { valid: false, reason: 'locked' };
  }

  const submitted = code.trim();
  const secret = decryptField(credential.secretEncrypted);
  const normalised = submitted.replace(/\s+/g, '');

  const isTotp = /^\d{6}$/.test(normalised) && authenticator.check(normalised, secret);
  if (isTotp) {
    await prisma.twoFactorCredential.update({
      where: { userId },
      data: { lastUsedAt: new Date(), failedAttemptCount: 0, lockedUntil: null },
    });
    return { valid: true, via: 'totp' };
  }

  const recoveryHash = hashToken(normaliseRecoveryCode(submitted));
  const candidates = await prisma.twoFactorRecoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  // Recovery codes are short and human-typed, so compare in constant time
  // against each stored hash rather than relying on a direct index lookup.
  const match = candidates.find((candidate) => safeCompare(candidate.codeHash, recoveryHash));
  if (match) {
    const consumed = await prisma.twoFactorRecoveryCode.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 1) {
      await prisma.twoFactorCredential.update({
        where: { userId },
        data: { lastUsedAt: new Date(), failedAttemptCount: 0, lockedUntil: null },
      });
      return { valid: true, via: 'recovery_code' };
    }
  }

  const failed = await prisma.twoFactorCredential.update({
    where: { userId },
    data: { failedAttemptCount: { increment: 1 } },
    select: { failedAttemptCount: true },
  });

  if (failed.failedAttemptCount >= MAX_FAILED_ATTEMPTS) {
    await prisma.twoFactorCredential.update({
      where: { userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
        failedAttemptCount: 0,
      },
    });
    return { valid: false, reason: 'locked' };
  }

  return { valid: false, reason: 'invalid' };
}

export async function disableTwoFactor(
  userId: string,
  password: string,
  code: string,
): Promise<void> {
  const prisma = getPrisma();
  const [credential, user] = await Promise.all([
    prisma.twoFactorCredential.findUnique({ where: { userId } }),
    prisma.userCredential.findUnique({ where: { userId }, select: { passwordHash: true } }),
  ]);

  if (!credential?.enabledAt) {
    throw new UnprocessableError(
      ErrorCode.TWO_FACTOR_NOT_ENABLED,
      'Two-factor authentication is not enabled for this account.',
    );
  }

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new UnauthenticatedError(ErrorCode.INVALID_CREDENTIALS, 'Your password is not correct.');
  }

  const verification = await verifyTwoFactor(userId, code);
  if (!verification.valid) {
    throw new UnauthenticatedError(
      ErrorCode.TWO_FACTOR_INVALID,
      verification.reason === 'locked'
        ? 'Too many incorrect codes. Try again later.'
        : 'That code is not valid.',
    );
  }

  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorCredential.delete({ where: { userId } }),
  ]);
}

export async function regenerateRecoveryCodes(
  userId: string,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  const verification = await verifyTwoFactor(userId, code);
  if (!verification.valid) {
    throw new UnauthenticatedError(ErrorCode.TWO_FACTOR_INVALID, 'That code is not valid.');
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    formatRecoveryCode(generateNumericCode(10)),
  );

  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({
        userId,
        codeHash: hashToken(normaliseRecoveryCode(recoveryCode)),
      })),
    }),
  ]);

  return { recoveryCodes };
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const credential = await getPrisma().twoFactorCredential.findUnique({
    where: { userId },
    select: { enabledAt: true },
  });
  return Boolean(credential?.enabledAt);
}

/** `12345-67890` — grouped so it is transcribable from a printed list. */
function formatRecoveryCode(digits: string): string {
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normaliseRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, '');
}
