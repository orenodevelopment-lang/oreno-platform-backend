/**
 * Field names whose values must never reach a log sink, an error report or an
 * audit summary. Matching is case-insensitive and substring-based so that
 * `userPassword`, `new_password` and `passwordHash` are all caught.
 */
const SENSITIVE_KEY_PATTERNS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'auth_header',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
  'clientsecret',
  'client_secret',
  'cookie',
  'sessionid',
  'session_id',
  'csrftoken',
  'csrf_token',
  'recoverycode',
  'recovery_code',
  'totp',
  'otp',
  'mfa',
  'credential',
  'signature',
  'signed_url',
  'signedurl',
  'presigned',
  'connectionstring',
  'connection_string',
  'database_url',
  'bankaccount',
  'bank_account',
  'accountnumber',
  'account_number',
  'routingnumber',
  'routing_number',
  'iban',
  'swift',
  'cvv',
  'cardnumber',
  'card_number',
  'ssn',
  'nationalid',
  'national_id',
  'taxid',
  'tax_id',
  'salary',
  'hourlyrate',
  'hourly_rate',
  'payrate',
  'pay_rate',
  'cv',
  'resume',
  'coverletter',
  'cover_letter',
];

export const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-.\s]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalised.includes(pattern.replace(/[-_]/g, '')),
  );
}

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 2000;

/**
 * Recursively copy `value`, replacing sensitive fields with `[REDACTED]`.
 *
 * Handles cycles, caps depth and array length, and truncates long strings so a
 * single oversized payload cannot flood the log pipeline.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'function' || typeof value === 'symbol') return '[Function]';

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack.split('\n').slice(0, 6).join('\n') } : {}),
    };
  }

  if (depth >= MAX_DEPTH) return '[MaxDepth]';

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) {
        items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
      }
      return items;
    }

    if (value instanceof Map) {
      return Object.fromEntries(
        [...value.entries()]
          .slice(0, MAX_ARRAY_ITEMS)
          .map(([k, v]) => [
            String(k),
            isSensitiveKey(String(k)) ? REDACTED : redact(v, depth + 1, seen),
          ]),
      );
    }

    if (value instanceof Set) {
      return [...value.values()]
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => redact(item, depth + 1, seen));
    }

    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(nested, depth + 1, seen);
    }
    return output;
  }

  // Everything above handles objects, arrays, maps and sets, so only primitives
  // and functions reach here. Stringifying them individually avoids the default
  // `[object Object]` that a bare `String(value)` would risk.
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.toString();
  return '[unserialisable]';
}

/**
 * Remove query strings from anything that looks like a URL before logging.
 * Signed URLs carry credentials in their query parameters.
 */
export function stripUrlSecrets(text: string): string {
  return text.replace(/(https?:\/\/[^\s"']+)\?[^\s"']*/g, '$1?[REDACTED_QUERY]');
}

export { isSensitiveKey };
