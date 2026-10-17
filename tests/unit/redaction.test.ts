import { describe, expect, it } from 'vitest';
import {
  isSensitiveKey,
  REDACTED,
  redact,
  stripUrlSecrets,
} from '../../src/common/logging/redaction.js';

describe('redaction', () => {
  describe('isSensitiveKey', () => {
    it.each([
      'password',
      'userPassword',
      'new_password',
      'passwordHash',
      'authorization',
      'sessionId',
      'csrf_token',
      'apiKey',
      'private-key',
      'recoveryCode',
      'cardNumber',
      'ssn',
    ])('flags %s', (key) => {
      expect(isSensitiveKey(key)).toBe(true);
    });

    it.each(['email', 'firstName', 'organisationId', 'createdAt', 'status'])(
      'does not flag %s',
      (key) => {
        expect(isSensitiveKey(key)).toBe(false);
      },
    );
  });

  describe('redact', () => {
    it('replaces sensitive values at any depth', () => {
      const output = redact({
        email: 'person@example.com',
        password: 'hunter2',
        nested: { authorization: 'Bearer abc', cardNumber: '4242424242424242' },
      }) as Record<string, unknown>;

      expect(output['email']).toBe('person@example.com');
      expect(output['password']).toBe(REDACTED);
      expect((output['nested'] as Record<string, unknown>)['authorization']).toBe(REDACTED);
      expect((output['nested'] as Record<string, unknown>)['cardNumber']).toBe(REDACTED);
    });

    it('redacts inside arrays of objects', () => {
      const output = redact([{ token: 'abc' }, { token: 'def', id: 1 }]) as Record<
        string,
        unknown
      >[];
      expect(output[0]?.['token']).toBe(REDACTED);
      expect(output[1]?.['token']).toBe(REDACTED);
      expect(output[1]?.['id']).toBe(1);
    });

    it('leaves primitives untouched', () => {
      expect(redact('hello')).toBe('hello');
      expect(redact(42)).toBe(42);
      expect(redact(true)).toBe(true);
      expect(redact(null)).toBeNull();
      expect(redact(undefined)).toBeUndefined();
    });

    it('handles cycles without recursing forever', () => {
      const cyclic: Record<string, unknown> = { name: 'root' };
      cyclic['self'] = cyclic;
      const output = redact(cyclic) as Record<string, unknown>;
      expect(output['name']).toBe('root');
      expect(output['self']).toBe('[Circular]');
    });

    it('caps recursion depth', () => {
      let deep: Record<string, unknown> = { value: 'leaf' };
      for (let index = 0; index < 12; index += 1) deep = { nested: deep };
      expect(JSON.stringify(redact(deep))).toContain('[MaxDepth]');
    });

    it('truncates oversized strings', () => {
      const output = redact('x'.repeat(5000)) as string;
      expect(output.length).toBeLessThan(5000);
      expect(output).toContain('[truncated]');
    });

    it('summarises errors rather than leaking arbitrary properties', () => {
      const output = redact(new Error('boom')) as Record<string, unknown>;
      expect(output['name']).toBe('Error');
      expect(output['message']).toBe('boom');
    });

    it('redacts sensitive keys in Maps', () => {
      const output = redact(new Map([['password', 'x'], ['id', '1']])) as Record<string, unknown>;
      expect(output['password']).toBe(REDACTED);
      expect(output['id']).toBe('1');
    });
  });

  describe('stripUrlSecrets', () => {
    it('removes query strings that may carry signed credentials', () => {
      const text = 'fetching https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc&X-Amz-Date=1';
      expect(stripUrlSecrets(text)).toContain('[REDACTED_QUERY]');
      expect(stripUrlSecrets(text)).not.toContain('X-Amz-Signature=abc');
    });

    it('leaves query-less URLs alone', () => {
      const text = 'see https://oreno.example/health for detail';
      expect(stripUrlSecrets(text)).toBe(text);
    });
  });
});
