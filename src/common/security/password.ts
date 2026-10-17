import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * Password hashing with Argon2id.
 *
 * Parameters follow OWASP's current recommendation: 19 MiB memory, 2 iterations,
 * parallelism 1. These are tuned for a server-side Node process, not a browser.
 */
/** `Algorithm.Argon2id` from the library, inlined because it is a const enum. */
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

/** Minimum password policy. Enforced at the schema boundary and here. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export interface PasswordPolicyResult {
  valid: boolean;
  problems: string[];
}

/**
 * Length-first policy. Composition rules (uppercase/digit/symbol) are
 * deliberately not required: NIST SP 800-63B advises against them because they
 * push users toward predictable substitutions. Length and a breach check are
 * the effective controls; the breach check runs in the service layer.
 */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (/^\s|\s$/.test(password)) {
    problems.push('Password must not begin or end with whitespace.');
  }
  if (new Set(password).size < 5) {
    problems.push('Password must contain at least 5 distinct characters.');
  }

  return { valid: problems.length === 0, problems };
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against a stored hash.
 *
 * Returns `false` rather than throwing on a malformed hash so a corrupted row
 * cannot be distinguished from a wrong password by the caller.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Burn comparable CPU time when no user record exists, so that login timing
 * does not reveal whether an email address is registered.
 */
export async function simulatePasswordVerification(): Promise<void> {
  await argonHash('oreno-timing-equalisation-placeholder', ARGON2_OPTIONS);
}
