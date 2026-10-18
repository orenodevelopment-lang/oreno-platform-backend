import { describe, expect, it } from 'vitest';
import { EnvironmentValidationError, parseEnv } from '../../src/config/env.js';

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    APP_URL: 'https://app.oreno.test',
    API_URL: 'https://api.oreno.test',
    ALLOWED_ORIGINS: 'https://app.oreno.test',
    DATABASE_URL: 'postgresql://oreno:secret@db.internal/oreno',
    KEY_VALUE_URL: 'redis://redis.internal:6379',
    SESSION_SECRET: 'a-production-session-secret-longer-than-32-characters',
    SESSION_COOKIE_DOMAIN: '.oreno.test',
    AUTH_REDIRECT_ALLOWLIST: 'https://app.oreno.test/auth/callback',
    EMAIL_PROVIDER: 'resend',
    EMAIL_FROM_ADDRESS: 'no-reply@oreno.test',
    EMAIL_PROVIDER_API_KEY: 'resend-test-key',
    STORAGE_DRIVER: 's3',
    AWS_REGION: 'eu-west-1',
    AWS_ACCESS_KEY_ID: 'test-access-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_PUBLIC_BUCKET: 'oreno-public',
    S3_PRIVATE_BUCKET: 'oreno-private',
    S3_QUARANTINE_BUCKET: 'oreno-quarantine',
    S3_EXPORT_BUCKET: 'oreno-exports',
    MALWARE_SCANNER: 'clamav',
    CLAMAV_HOST: 'clamav.internal',
    ERROR_MONITORING_DSN: 'https://public@example.ingest.sentry.io/1',
    REPLACEMENT_WINDOW_DAYS: '90',
    ...overrides,
  };
}

function expectInvalid(overrides: NodeJS.ProcessEnv, expected: string): void {
  expect(() => parseEnv(productionEnv(overrides))).toThrowError(EnvironmentValidationError);
  try {
    parseEnv(productionEnv(overrides));
  } catch (error) {
    expect((error as EnvironmentValidationError).issues.join('\n')).toContain(expected);
  }
}

describe('production provider and browser topology configuration', () => {
  it('accepts the complete production baseline', () => {
    expect(parseEnv(productionEnv()).NODE_ENV).toBe('production');
  });

  it('requires a shared cookie domain across sibling app and API hosts', () => {
    expectInvalid({ SESSION_COOKIE_DOMAIN: '' }, 'SESSION_COOKIE_DOMAIN');
  });

  it('requires error monitoring in production', () => {
    expectInvalid({ ERROR_MONITORING_DSN: '' }, 'ERROR_MONITORING_DSN');
  });

  it('requires every CloudFront signing value when any is configured', () => {
    expectInvalid({ CLOUDFRONT_DOMAIN: 'cdn.oreno.test' }, 'must be set together');
  });

  it('accepts SES with AWS credentials and no Resend API key', () => {
    const parsed = parseEnv(productionEnv({ EMAIL_PROVIDER: 'ses', EMAIL_PROVIDER_API_KEY: '' }));
    expect(parsed.EMAIL_PROVIDER).toBe('ses');
  });
});
