import { z } from 'zod';

/** Public identifiers are UUIDs; they are never sequential integers. */
export const uuidSchema = z.string().uuid();

export const idParamSchema = z.object({ id: uuidSchema });

export const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase hyphenated slug.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Must be a valid email address.')
  .max(254);

export const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^[+()\d\s-]+$/, 'Must be a valid phone number.');

export const personNameSchema = z.string().trim().min(1).max(120);

export const urlSchema = z.string().trim().url().max(2048);

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD).');

export const isoDateTimeSchema = z
  .string()
  .trim()
  .datetime({ offset: true, message: 'Must be an ISO 8601 UTC timestamp.' });

/** A UTC instant. Accepts ISO strings and converts to a Date. */
export const utcDateTimeSchema = z.coerce.date();

/** ISO 4217 currency code, uppercase. */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 currency code.');

/**
 * Money is carried as a decimal-safe string, never a JavaScript float.
 * `"1500.00"`, `"0.01"` and `"12345678.99"` are valid; `1.5e3` is not.
 */
export const moneyAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,13}(\.\d{1,4})?$/, 'Must be a decimal amount as a string, e.g. "1500.00".');

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid IANA time zone, e.g. "Africa/Lagos".' },
  );

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 country code.');

export const reasonSchema = z.string().trim().min(10).max(1000);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(255)
  .regex(
    /^[\w.:-]+$/,
    'Idempotency keys may contain letters, digits, dot, colon, dash and underscore.',
  );

export const searchQuerySchema = z.string().trim().min(1).max(200);

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

/** Strip control characters from free-text input before persistence. */
export const safeTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // eslint-disable-next-line no-control-regex
    .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''));

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const cursorQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
