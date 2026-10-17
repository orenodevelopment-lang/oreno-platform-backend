import { checkPasswordPolicy } from './password.js';

/**
 * Password acceptance policy.
 *
 * Composition rules (an uppercase letter, a digit, a symbol) are deliberately
 * absent: NIST SP 800-63B discourages them because they push users toward
 * predictable substitutions such as `Password1!`. What actually resists offline
 * cracking is length, and what actually resists credential stuffing is refusing
 * passwords that already appear in breach corpora.
 *
 * The deny-list below is a compact set of the passwords that dominate breach
 * dumps plus Oreno-specific terms. It is a local check on purpose: a live
 * breach-corpus lookup would put a third-party network call on the registration
 * path, which is an operator decision rather than a code default.
 */
const DENY_LIST: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'letmein',
  'welcome',
  'welcome1',
  'welcome123',
  'admin',
  'administrator',
  'admin123',
  'root',
  'iloveyou',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'master',
  'shadow',
  'superman',
  'batman',
  'trustno1',
  'abc123',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '12345678910',
  '111111',
  '000000',
  '654321',
  'qazwsx',
  'asdfghjkl',
  'zxcvbnm',
  '1q2w3e4r',
  '1qaz2wsx',
  'changeme',
  'secret',
  'default',
  'temp1234',
  'oreno',
  'oreno123',
  'orenopassword',
  'hireoreno',
]);

/** Sequential runs and repetitions that satisfy a length rule but add no entropy. */
function looksSequential(password: string): boolean {
  const lowered = password.toLowerCase();
  const sequences = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl'];
  return sequences.some((sequence) =>
    sequence.split('').some((_, index) => {
      const forward = sequence.slice(index, index + 6);
      if (forward.length < 6) return false;
      const reversed = forward.split('').reverse().join('');
      return lowered.includes(forward) || lowered.includes(reversed);
    }),
  );
}

export interface PasswordAcceptance {
  acceptable: boolean;
  problems: string[];
}

export function assessPassword(password: string): PasswordAcceptance {
  const problems = [...checkPasswordPolicy(password).problems];
  const lowered = password.toLowerCase();

  if (DENY_LIST.has(lowered)) {
    problems.push('This password is too common and has appeared in breach lists.');
  }
  if (looksSequential(password)) {
    problems.push('Password must not contain an obvious sequence such as "abcdef" or "123456".');
  }
  if (/^[a-z]+$/i.test(password) && password.length < 16) {
    problems.push('A letters-only password must be at least 16 characters.');
  }

  return { acceptable: problems.length === 0, problems };
}

export function assertAcceptablePassword(password: string): void {
  const result = assessPassword(password);
  if (!result.acceptable) {
    const error = new PasswordPolicyError(result.problems);
    throw error;
  }
}

export class PasswordPolicyError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super('The password does not meet the account security policy.');
    this.name = 'PasswordPolicyError';
    this.problems = problems;
  }
}
