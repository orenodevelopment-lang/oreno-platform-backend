import { parseEnv, type RawEnv } from './env.js';

export { EnvironmentValidationError, parseEnv } from './env.js';

export interface AppConfig {
  readonly env: RawEnv['NODE_ENV'];
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly isDevelopment: boolean;
  readonly serviceName: string;
  readonly port: number;
  readonly logLevel: RawEnv['LOG_LEVEL'];

  readonly appUrl: string;
  readonly apiUrl: string;
  readonly allowedOrigins: readonly string[];

  readonly database: {
    readonly url: string;
    readonly directUrl: string;
    readonly poolMax: number;
  };

  readonly keyValue: {
    readonly url: string | undefined;
    readonly tls: boolean;
    readonly queuePrefix: string;
    /** True when Key Value is configured; queues and socket scaling require it. */
    readonly enabled: boolean;
  };

  readonly session: {
    readonly secret: string;
    readonly cookieName: string;
    readonly cookieDomain: string | undefined;
    readonly ttlHours: number;
    readonly idleTimeoutMinutes: number;
    readonly csrfCookieName: string;
    readonly csrfHeaderName: string;
  };

  readonly auth: {
    readonly provider: RawEnv['IDENTITY_PROVIDER'];
    readonly issuer: string;
    readonly audience: string;
    readonly redirectAllowlist: readonly string[];
    readonly google: OAuthProviderConfig | undefined;
    readonly linkedin: OAuthProviderConfig | undefined;
  };

  readonly email: {
    readonly provider: RawEnv['EMAIL_PROVIDER'];
    readonly fromAddress: string;
    readonly fromName: string;
    readonly captureDir: string;
    readonly smtp:
      | {
          readonly host: string;
          readonly port: number;
          readonly secure: boolean;
          readonly user: string | undefined;
          readonly password: string | undefined;
        }
      | undefined;
    readonly apiKey: string | undefined;
  };

  readonly storage: {
    readonly driver: RawEnv['STORAGE_DRIVER'];
    readonly localDir: string;
    readonly region: string;
    readonly accessKeyId: string | undefined;
    readonly secretAccessKey: string | undefined;
    readonly endpoint: string | undefined;
    readonly forcePathStyle: boolean;
    readonly buckets: {
      readonly public: string;
      readonly private: string;
      readonly quarantine: string;
      readonly exports: string;
    };
    readonly presignedUploadTtlSeconds: number;
    readonly presignedDownloadTtlSeconds: number;
    readonly maxUploadBytes: number;
  };

  readonly cloudfront: {
    readonly domain: string | undefined;
    readonly keyPairId: string | undefined;
    readonly privateKey: string | undefined;
    readonly enabled: boolean;
  };

  readonly malwareScanner: {
    readonly driver: RawEnv['MALWARE_SCANNER'];
    readonly clamav: { readonly host: string; readonly port: number } | undefined;
    readonly guardDuty: {
      readonly pollSeconds: number;
      readonly timeoutMinutes: number;
    };
  };

  readonly rateLimit: {
    readonly windowSeconds: number;
    readonly max: number;
    readonly authMax: number;
    readonly applicationMax: number;
    readonly messageMax: number;
    readonly uploadMax: number;
  };

  readonly observability: {
    readonly errorMonitoringDsn: string | undefined;
    readonly metricsEnabled: boolean;
  };

  readonly platform: {
    readonly bootstrapAdminEmails: readonly string[];
    readonly totpIssuer: string;
  };
  readonly policy: {
    readonly replacementWindowDays: number;
  };
}

export interface OAuthProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

function buildConfig(raw: RawEnv): AppConfig {
  const isProduction = raw.NODE_ENV === 'production';

  return Object.freeze({
    env: raw.NODE_ENV,
    isProduction,
    isTest: raw.NODE_ENV === 'test',
    isDevelopment: raw.NODE_ENV === 'development',
    serviceName: raw.SERVICE_NAME,
    port: raw.PORT,
    logLevel: raw.LOG_LEVEL,

    appUrl: raw.APP_URL,
    apiUrl: raw.API_URL,
    allowedOrigins: Object.freeze([...raw.ALLOWED_ORIGINS]),

    database: Object.freeze({
      url: raw.DATABASE_URL,
      directUrl: raw.DIRECT_DATABASE_URL ?? raw.DATABASE_URL,
      poolMax: raw.DATABASE_POOL_MAX,
    }),

    keyValue: Object.freeze({
      url: raw.KEY_VALUE_URL,
      tls: raw.KEY_VALUE_TLS,
      queuePrefix: raw.QUEUE_PREFIX,
      enabled: Boolean(raw.KEY_VALUE_URL),
    }),

    session: Object.freeze({
      secret: raw.SESSION_SECRET,
      cookieName: raw.SESSION_COOKIE_NAME,
      cookieDomain: raw.SESSION_COOKIE_DOMAIN,
      ttlHours: raw.SESSION_TTL_HOURS,
      idleTimeoutMinutes: raw.SESSION_IDLE_TIMEOUT_MINUTES,
      csrfCookieName: raw.CSRF_COOKIE_NAME,
      csrfHeaderName: raw.CSRF_HEADER_NAME,
    }),

    auth: Object.freeze({
      provider: raw.IDENTITY_PROVIDER,
      issuer: raw.AUTH_ISSUER,
      audience: raw.AUTH_AUDIENCE,
      redirectAllowlist: Object.freeze([...raw.AUTH_REDIRECT_ALLOWLIST]),
      google:
        raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET && raw.GOOGLE_REDIRECT_URI
          ? Object.freeze({
              clientId: raw.GOOGLE_CLIENT_ID,
              clientSecret: raw.GOOGLE_CLIENT_SECRET,
              redirectUri: raw.GOOGLE_REDIRECT_URI,
            })
          : undefined,
      linkedin:
        raw.LINKEDIN_CLIENT_ID && raw.LINKEDIN_CLIENT_SECRET && raw.LINKEDIN_REDIRECT_URI
          ? Object.freeze({
              clientId: raw.LINKEDIN_CLIENT_ID,
              clientSecret: raw.LINKEDIN_CLIENT_SECRET,
              redirectUri: raw.LINKEDIN_REDIRECT_URI,
            })
          : undefined,
    }),

    email: Object.freeze({
      provider: raw.EMAIL_PROVIDER,
      fromAddress: raw.EMAIL_FROM_ADDRESS,
      fromName: raw.EMAIL_FROM_NAME,
      captureDir: raw.EMAIL_CAPTURE_DIR,
      smtp: raw.SMTP_HOST
        ? Object.freeze({
            host: raw.SMTP_HOST,
            port: raw.SMTP_PORT,
            secure: raw.SMTP_SECURE,
            user: raw.SMTP_USER,
            password: raw.SMTP_PASSWORD,
          })
        : undefined,
      apiKey: raw.EMAIL_PROVIDER_API_KEY,
    }),

    storage: Object.freeze({
      driver: raw.STORAGE_DRIVER,
      localDir: raw.LOCAL_STORAGE_DIR,
      region: raw.AWS_REGION,
      accessKeyId: raw.AWS_ACCESS_KEY_ID,
      secretAccessKey: raw.AWS_SECRET_ACCESS_KEY,
      endpoint: raw.S3_ENDPOINT,
      forcePathStyle: raw.S3_FORCE_PATH_STYLE,
      buckets: Object.freeze({
        public: raw.S3_PUBLIC_BUCKET ?? 'oreno-public-local',
        private: raw.S3_PRIVATE_BUCKET ?? 'oreno-private-local',
        quarantine: raw.S3_QUARANTINE_BUCKET ?? 'oreno-quarantine-local',
        exports: raw.S3_EXPORT_BUCKET ?? 'oreno-exports-local',
      }),
      presignedUploadTtlSeconds: raw.PRESIGNED_UPLOAD_TTL_SECONDS,
      presignedDownloadTtlSeconds: raw.PRESIGNED_DOWNLOAD_TTL_SECONDS,
      maxUploadBytes: raw.MAX_UPLOAD_BYTES,
    }),

    cloudfront: Object.freeze({
      domain: raw.CLOUDFRONT_DOMAIN,
      keyPairId: raw.CLOUDFRONT_KEY_PAIR_ID,
      privateKey: raw.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      enabled: Boolean(
        raw.CLOUDFRONT_DOMAIN && raw.CLOUDFRONT_KEY_PAIR_ID && raw.CLOUDFRONT_PRIVATE_KEY,
      ),
    }),

    malwareScanner: Object.freeze({
      driver: raw.MALWARE_SCANNER,
      clamav:
        raw.MALWARE_SCANNER === 'clamav' && raw.CLAMAV_HOST
          ? Object.freeze({ host: raw.CLAMAV_HOST, port: raw.CLAMAV_PORT })
          : undefined,
      guardDuty: Object.freeze({
        pollSeconds: raw.GUARDDUTY_SCAN_POLL_SECONDS,
        timeoutMinutes: raw.GUARDDUTY_SCAN_TIMEOUT_MINUTES,
      }),
    }),

    rateLimit: Object.freeze({
      windowSeconds: raw.RATE_LIMIT_WINDOW_SECONDS,
      max: raw.RATE_LIMIT_MAX,
      authMax: raw.AUTH_RATE_LIMIT_MAX,
      applicationMax: raw.APPLICATION_RATE_LIMIT_MAX,
      messageMax: raw.MESSAGE_RATE_LIMIT_MAX,
      uploadMax: raw.UPLOAD_RATE_LIMIT_MAX,
    }),

    observability: Object.freeze({
      errorMonitoringDsn: raw.ERROR_MONITORING_DSN,
      metricsEnabled: raw.METRICS_ENABLED,
    }),

    platform: Object.freeze({
      bootstrapAdminEmails: Object.freeze([...raw.PLATFORM_ADMIN_EMAILS]),
      totpIssuer: raw.TOTP_ISSUER,
    }),
    policy: Object.freeze({
      replacementWindowDays: raw.REPLACEMENT_WINDOW_DAYS ?? 90,
    }),
  });
}

let cached: AppConfig | undefined;

/**
 * Return the process-wide configuration, parsing the environment on first use.
 * Call `loadConfig()` explicitly at process start so misconfiguration surfaces
 * before any server or worker begins accepting work.
 */
export function loadConfig(): AppConfig {
  cached ??= buildConfig(parseEnv());
  return cached;
}

/** Test-only escape hatch so suites can build a config from explicit values. */
export function buildConfigFromEnv(source: NodeJS.ProcessEnv): AppConfig {
  return buildConfig(parseEnv(source));
}

export function resetConfigCache(): void {
  cached = undefined;
}
