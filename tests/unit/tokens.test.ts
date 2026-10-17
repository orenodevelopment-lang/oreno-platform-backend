import { describe, expect, it } from 'vitest';
import {
  fingerprint,
  generateNumericCode,
  generateOpaqueId,
  generateToken,
  hashToken,
  safeCompare,
} from '../../src/common/security/tokens.js';

describe('tokens', () => {
  describe('generateToken', () => {
    it('returns a token and the hash that is stored', () => {
      const { token, hash } = generateToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(hash).toBe(hashToken(token));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('never returns the same token twice', () => {
      const tokens = new Set(Array.from({ length: 200 }, () => generateToken().token));
      expect(tokens.size).toBe(200);
    });

    it('does not persist the token itself as the hash', () => {
      const { token, hash } = generateToken();
      expect(hash).not.toBe(token);
    });
  });

  describe('hashToken', () => {
    it('is deterministic', () => {
      expect(hashToken('abc')).toBe(hashToken('abc'));
    });

    it('separates distinct inputs', () => {
      expect(hashToken('abc')).not.toBe(hashToken('abd'));
    });
  });

  describe('safeCompare', () => {
    it('matches equal strings', () => {
      expect(safeCompare('same-value', 'same-value')).toBe(true);
    });

    it('rejects differing strings', () => {
      expect(safeCompare('same-value', 'different')).toBe(false);
    });

    it('rejects differing lengths without throwing', () => {
      expect(safeCompare('short', 'much-longer-value')).toBe(false);
      expect(safeCompare('', 'a')).toBe(false);
    });
  });

  describe('generateNumericCode', () => {
    it('produces the requested number of digits', () => {
      expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
      expect(generateNumericCode(4)).toMatch(/^\d{4}$/);
    });

    it('zero-pads short values', () => {
      // Draw many codes; at least one should exercise the padding path and every
      // code must still be the full width.
      for (let index = 0; index < 500; index += 1) {
        expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
      }
    });
  });

  describe('generateOpaqueId', () => {
    it('is URL-safe', () => {
      expect(generateOpaqueId()).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('fingerprint', () => {
    it('is stable and case- and whitespace-insensitive', () => {
      expect(fingerprint('  Person@Example.com ', 'lead')).toBe(fingerprint('person@example.com', 'lead'));
    });

    it('separates by scope', () => {
      expect(fingerprint('a@example.com', 'lead')).not.toBe(fingerprint('a@example.com', 'invite'));
    });
  });
});
