import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque token generation and hashing.
 *
 * Every bearer-style secret in Oreno (session tokens, email verification,
 * password reset, invitations, API-style grants) follows the same rule:
 *
 *   - a high-entropy random value is generated and given to the client once;
 *   - only a SHA-256 hash of that value is persisted;
 *   - lookup is by hash, so a database leak does not yield usable tokens.
 *
 * SHA-256 is correct here (unlike for passwords) because the input is already
 * 256 bits of entropy — there is nothing to brute-force or dictionary-attack.
 */

const TOKEN_BYTES = 32; // 256 bits -> 43 base64url characters

export interface GeneratedToken {
  /** The value handed to the client. Never persisted. */
  token: string;
  /** The value stored in the database. */
  hash: string;
}

export function generateToken(bytes: number = TOKEN_BYTES): GeneratedToken {
  const token = randomBytes(bytes).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two token hashes. Used where a token is looked up
 * by a non-unique key and then compared, to avoid leaking a match position.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** A short, human-transcribable numeric code (email OTP, recovery fallback). */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  // Rejection-free: randomInt-like scaling is adequate for short-lived codes
  // that are additionally rate-limited and single-use.
  const value = randomBytes(4).readUInt32BE(0) % max;
  return value.toString().padStart(digits, '0');
}

/** URL-safe slug suitable for object keys and idempotency scopes. */
export function generateOpaqueId(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Derive a stable, non-reversible fingerprint for a value that must be
 * deduplicated without being stored in the clear (e.g. a lead email).
 */
export function fingerprint(value: string, scope: string): string {
  return createHash('sha256')
    .update(`${scope}:${value.toLowerCase().trim()}`, 'utf8')
    .digest('hex');
}
