import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({ quiet: true });

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1' || value === 'yes';
  });

const integer = (fallback: number) => z.coerce.number().int().positive().default(fallback);

/** Comma-separated list, trimmed, with empty entries removed. */
const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim()));

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');

const schema = z
  .object({
    NODE_ENV: nodeEnv,
    PORT: integer(4000),
    SERVICE_NAME: z.string().default('oreno-api'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    APP_URL: z.string().url(),
    API_URL: z.string().url(),
    ALLOWED_ORIGINS: csv,

    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: optionalString,
    DATABASE_POOL_MAX: integer(10),

    KEY_VALUE_URL: optionalString,
    KEY_VALUE_TLS: booleanish.default(false),
    QUEUE_PREFIX: z.string().default('oreno'),

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_COOKIE_NAME: z.string().default('oreno_session'),
    SESSION_COOKIE_DOMAIN: optionalString,
    SESSION_TTL_HOURS: integer(720),
    SESSION_IDLE_TIMEOUT_MINUTES: integer(10080),
    CSRF_COOKIE_NAME: z.string().default('oreno_csrf'),
    CSRF_HEADER_NAME: z.string().default('x-oreno-csrf'),

    IDENTITY_PROVIDER: z.enum(['baseline']).default('baseline'),
    AUTH_ISSUER: z.string().default('http://localhost:4000'),
    AUTH_AUDIENCE: z.string().default('oreno-api'),

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_REDIRECT_URI: optionalString,

    LINKEDIN_CLIENT_ID: optionalString,
    LINKEDIN_CLIENT_SECRET: optionalString,
    LINKEDIN_REDIRECT_URI: optionalString,

    AUTH_REDIRECT_ALLOWLIST: csv,

    EMAIL_PROVIDER: z.enum(['log', 'capture', 'smtp', 'ses', 'resend']).default('log'),
    EMAIL_FROM_ADDRESS: z.string().email().default('no-reply@oreno.local'),
    EMAIL_FROM_NAME: z.string().default('Oreno'),
    SMTP_HOST: optionalString,
    SMTP_PORT: integer(587),
    SMTP_SECURE: booleanish.default(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    EMAIL_PROVIDER_API_KEY: optionalString,
    EMAIL_CAPTURE_DIR: z.string().default('tmp/emails'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('tmp/storage'),
    AWS_REGION: z.string().default('eu-west-1'),
    AWS_ACCESS_KEY_ID: optionalString,
    AWS_SECRET_ACCESS_KEY: optionalString,
    S3_PUBLIC_BUCKET: optionalString,
    S3_PRIVATE_BUCKET: optionalString,
    S3_QUARANTINE_BUCKET: optionalString,
    S3_EXPORT_BUCKET: optionalString,
    S3_FORCE_PATH_STYLE: booleanish.default(false),
    S3_ENDPOINT: optionalString,
    PRESIGNED_UPLOAD_TTL_SECONDS: integer(900),
    PRESIGNED_DOWNLOAD_TTL_SECONDS: integer(300),
    MAX_UPLOAD_BYTES: integer(26_214_400),

    CLOUDFRONT_DOMAIN: optionalString,
    CLOUDFRONT_KEY_PAIR_ID: optionalString,
    CLOUDFRONT_PRIVATE_KEY: optionalString,

    MALWARE_SCANNER: z.enum(['none', 'clamav']).default('none'),
    CLAMAV_HOST: optionalString,
    CLAMAV_PORT: integer(3310),

    RATE_LIMIT_WINDOW_SECONDS: integer(60),
    RATE_LIMIT_MAX: integer(300),
    AUTH_RATE_LIMIT_MAX: integer(10),
    APPLICATION_RATE_LIMIT_MAX: integer(30),
    MESSAGE_RATE_LIMIT_MAX: integer(120),
    UPLOAD_RATE_LIMIT_MAX: integer(60),
    REPLACEMENT_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).optional(),

    ERROR_MONITORING_DSN: optionalString,
    METRICS_ENABLED: booleanish.default(true),

    PLATFORM_ADMIN_EMAILS: csv,
    TOTP_ISSUER: z.string().default('Oreno Platform'),
  })
  .superRefine((value, ctx) => {
    const isProduction = value.NODE_ENV === 'production';

    if (isProduction && value.ALLOWED_ORIGINS.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOWED_ORIGINS'],
        message: 'At least one exact origin is required in production.',
      });
    }

    if (isProduction) {
      const appHost = new URL(value.APP_URL).hostname;
      const apiHost = new URL(value.API_URL).hostname;
      if (appHost !== apiHost) {
        const cookieDomain = value.SESSION_COOKIE_DOMAIN?.replace(/^\./, '');
        if (!cookieDomain || !appHost.endsWith(cookieDomain) || !apiHost.endsWith(cookieDomain)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SESSION_COOKIE_DOMAIN'],
            message:
              'Sibling frontend/API hosts require a shared SESSION_COOKIE_DOMAIN so cookie auth, CSRF and Socket.IO work in the browser.',
          });
        }
      }
      if (!value.ERROR_MONITORING_DSN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ERROR_MONITORING_DSN'],
          message: 'Production requires an error-monitoring provider DSN.',
        });
      }
    }

    for (const origin of value.ALLOWED_ORIGINS) {
      if (origin.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALLOWED_ORIGINS'],
          message: `Wildcard origin "${origin}" is not permitted; list exact origins.`,
        });
      }
      try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ALLOWED_ORIGINS'],
            message: `Origin "${origin}" must not include a path, query or trailing slash.`,
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALLOWED_ORIGINS'],
          message: `Origin "${origin}" is not a valid URL.`,
        });
      }
    }

    // A production deployment must not run an in-memory-only dependency set.
    if (isProduction && !value.KEY_VALUE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['KEY_VALUE_URL'],
        message:
          'KEY_VALUE_URL is required in production (queues, rate limits, socket coordination).',
      });
    }

    if (isProduction && value.EMAIL_PROVIDER === 'log') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_PROVIDER'],
        message: 'The log email adapter never sends mail and must not be used in production.',
      });
    }

    if (isProduction && value.MALWARE_SCANNER === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MALWARE_SCANNER'],
        message: 'Production requires a configured malware scanner; "none" is local/test only.',
      });
    }

    if (isProduction && value.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_DRIVER'],
        message: 'Production requires the S3 storage driver.',
      });
    }

    if (isProduction && !value.REPLACEMENT_WINDOW_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REPLACEMENT_WINDOW_DAYS'],
        message: 'Production requires a client-approved replacement eligibility window.',
      });
    }

    if (value.STORAGE_DRIVER === 's3') {
      const required = [
        'S3_PUBLIC_BUCKET',
        'S3_PRIVATE_BUCKET',
        'S3_QUARANTINE_BUCKET',
        'S3_EXPORT_BUCKET',
      ] as const;
      for (const key of required) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3.`,
          });
        }
      }
      if (isProduction && (!value.AWS_ACCESS_KEY_ID || !value.AWS_SECRET_ACCESS_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AWS_ACCESS_KEY_ID'],
          message: 'AWS credentials are required for S3 in production.',
        });
      }
    }

    if (value.EMAIL_PROVIDER === 'smtp' && !value.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp.',
      });
    }

    if (value.EMAIL_PROVIDER === 'resend' && !value.EMAIL_PROVIDER_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_PROVIDER_API_KEY'],
        message: 'EMAIL_PROVIDER_API_KEY is required when EMAIL_PROVIDER=resend.',
      });
    }
    if (
      value.EMAIL_PROVIDER === 'ses' &&
      (!value.AWS_ACCESS_KEY_ID || !value.AWS_SECRET_ACCESS_KEY)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AWS_ACCESS_KEY_ID'],
        message: 'AWS credentials are required when EMAIL_PROVIDER=ses.',
      });
    }

    const cloudFrontValues = [
      value.CLOUDFRONT_DOMAIN,
      value.CLOUDFRONT_KEY_PAIR_ID,
      value.CLOUDFRONT_PRIVATE_KEY,
    ];
    const configuredCloudFrontValues = cloudFrontValues.filter(Boolean).length;
    if (configuredCloudFrontValues !== 0 && configuredCloudFrontValues !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLOUDFRONT_DOMAIN'],
        message:
          'CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID and CLOUDFRONT_PRIVATE_KEY must be set together or all left blank.',
      });
    }

    if (value.MALWARE_SCANNER === 'clamav' && !value.CLAMAV_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLAMAV_HOST'],
        message: 'CLAMAV_HOST is required when MALWARE_SCANNER=clamav.',
      });
    }

    // OAuth providers are optional, but a half-configured provider is a mistake.
    const oauthPairs = [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
      ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'],
    ] as const;
    for (const [idKey, secretKey, redirectKey] of oauthPairs) {
      const id = value[idKey];
      const secret = value[secretKey];
      const redirect = value[redirectKey];
      const configured = [id, secret, redirect].filter(Boolean).length;
      if (configured !== 0 && configured !== 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idKey],
          message: `${idKey}, ${secretKey} and ${redirectKey} must be set together or all left blank.`,
        });
      }
    }
  });

export type RawEnv = z.infer<typeof schema>;

export class EnvironmentValidationError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

/**
 * Parse and validate `process.env`. Throws `EnvironmentValidationError` with every
 * problem listed so a misconfigured deployment fails fast at startup rather than
 * at the first request that touches the missing dependency.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): RawEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvironmentValidationError(issues);
  }
  return result.data;
}
