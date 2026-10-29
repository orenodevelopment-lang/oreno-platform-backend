import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { loadConfig, type OAuthProviderConfig } from '../../config/index.js';
import { getPrisma } from '../../database/prisma.js';
import { hashToken, safeCompare } from '../../common/security/tokens.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import {
  ForbiddenError,
  UnauthenticatedError,
  UnprocessableError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

const log = createModuleLogger('auth.oauth');
const GOOGLE_AUTHORIZATION_ISSUER = 'https://accounts.google.com';

/**
 * Federated sign-in.
 *
 * Only Google and LinkedIn are wired, and only through the authorisation-code
 * flow with a signed `state` parameter — the implicit flow and unsigned state
 * are both ruled out because either would let an attacker attach their own
 * identity to a victim's session.
 *
 * An identity is matched on `(provider, providerUserId)`, never on email alone:
 * an email address is not proof of ownership of a federated account, and two
 * providers can assert different addresses for the same person.
 */
export type OAuthProviderKey = 'google' | 'linkedin';
export type OAuthFlowMode = 'login' | 'talent_signup';

interface ProviderEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
}

const ENDPOINTS: Record<OAuthProviderKey, ProviderEndpoints> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  linkedin: {
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    scope: 'openid profile email',
  },
};

export interface OAuthIdentity {
  provider: OAuthProviderKey;
  providerUserId: string;
  email: string | undefined;
  emailVerified: boolean;
  displayName: string | undefined;
  avatarUrl: string | undefined;
}

export function isProviderConfigured(provider: string): provider is OAuthProviderKey {
  if (provider !== 'google' && provider !== 'linkedin') return false;
  return providerConfig(provider) !== undefined;
}

/**
 * Google implements RFC 9207 and can identify its authorisation server in the
 * callback. When present, that value must match Google's published issuer.
 */
export function isExpectedCallbackIssuer(
  provider: OAuthProviderKey,
  issuer: string | undefined,
): boolean {
  return provider !== 'google' || issuer === undefined || issuer === GOOGLE_AUTHORIZATION_ISSUER;
}

export function logOAuthCallbackFailure(
  provider: OAuthProviderKey,
  reason:
    | 'invalid_response'
    | 'invalid_state'
    | 'invalid_issuer'
    | 'provider_error'
    | 'account_not_found'
    | 'authentication_failed',
  providerError?: string,
): void {
  const safeProviderError =
    providerError && /^[A-Za-z0-9._-]{1,128}$/.test(providerError) ? providerError : undefined;
  log.warn(
    { provider, reason, ...(safeProviderError ? { providerError: safeProviderError } : {}) },
    'oauth callback failed',
  );
}

function providerConfig(provider: OAuthProviderKey): OAuthProviderConfig | undefined {
  const config = loadConfig();
  return provider === 'google' ? config.auth.google : config.auth.linkedin;
}

function requireProviderConfig(provider: OAuthProviderKey): OAuthProviderConfig {
  const config = providerConfig(provider);
  if (!config) {
    throw new UnprocessableError(
      ErrorCode.OAUTH_PROVIDER_DISABLED,
      'This sign-in provider is not enabled for this deployment.',
    );
  }
  return config;
}

/* -------------------------------------------------------------------------- */
/* Signed state                                                               */
/* -------------------------------------------------------------------------- */

interface StatePayload {
  nonce: string;
  provider: OAuthProviderKey;
  expiresAt: number;
}

interface OAuthAttemptMetadata {
  provider: OAuthProviderKey;
  redirectTo?: string;
  mode: OAuthFlowMode;
  acceptedTerms: boolean;
  codeVerifier: string;
  browserTokenHash: string;
}

export interface OAuthAttempt {
  state: string;
  codeChallenge: string;
  browserToken: string;
}

export interface ConsumedOAuthAttempt {
  redirectTo: string | undefined;
  mode: OAuthFlowMode;
  acceptedTerms: boolean;
  codeVerifier: string;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_STATE_COOKIE = 'oreno_oauth_state';

function signState(payload: string): string {
  return createHmac('sha256', loadConfig().session.secret).update(payload).digest('base64url');
}

/**
 * The `redirectTo` value is validated against the configured allowlist before
 * it is signed, so the state token can never be used as an open redirect.
 */
export async function buildSignedState(
  provider: OAuthProviderKey,
  redirectTo: string | undefined,
  options: { mode?: OAuthFlowMode; acceptedTerms?: boolean } = {},
): Promise<OAuthAttempt> {
  const config = loadConfig();
  let safeRedirect: string | undefined;

  if (redirectTo) {
    const resolved = new URL(redirectTo, config.appUrl).toString();
    const allowed = config.auth.redirectAllowlist.some((entry) => {
      try {
        const allowedUrl = new URL(entry);
        const resolvedUrl = new URL(resolved);
        return (
          allowedUrl.origin === resolvedUrl.origin &&
          (allowedUrl.pathname === '/' || allowedUrl.toString() === resolvedUrl.toString())
        );
      } catch {
        return false;
      }
    });
    if (!allowed) {
      throw new ForbiddenError(
        ErrorCode.ORIGIN_NOT_ALLOWED,
        'That redirect target is not allowed.',
      );
    }
    safeRedirect = resolved;
  }

  const payload: StatePayload = {
    nonce: randomUUID(),
    provider,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  };

  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const browserToken = randomBytes(32).toString('base64url');
  const metadata: OAuthAttemptMetadata = {
    provider,
    ...(safeRedirect ? { redirectTo: safeRedirect } : {}),
    mode: options.mode ?? 'login',
    acceptedTerms: options.acceptedTerms ?? false,
    codeVerifier,
    browserTokenHash: hashToken(browserToken),
  };

  await getPrisma().authToken.create({
    data: {
      purpose: 'OAUTH_STATE',
      tokenHash: hashToken(payload.nonce),
      expiresAt: new Date(payload.expiresAt),
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { state: `${body}.${signState(body)}`, codeChallenge, browserToken };
}

export async function readSignedState(
  state: string,
  expectedProvider: OAuthProviderKey,
  browserToken: string | undefined,
): Promise<ConsumedOAuthAttempt> {
  const [body, signature] = state.split('.');
  if (!body || !signature) {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'The sign-in attempt could not be verified.',
    );
  }

  const expected = signState(body);
  const provided = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'The sign-in attempt could not be verified.',
    );
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  } catch {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'The sign-in attempt could not be verified.',
    );
  }
  if (payload.expiresAt <= Date.now()) {
    throw new ForbiddenError(ErrorCode.OAUTH_STATE_INVALID, 'This sign-in attempt has expired.');
  }
  if (payload.provider !== expectedProvider) {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'The sign-in attempt could not be verified.',
    );
  }

  if (!browserToken) {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'The sign-in attempt is not associated with this browser.',
    );
  }

  const tokenHash = hashToken(payload.nonce);
  const stored = await getPrisma().authToken.findUnique({ where: { tokenHash } });
  if (
    !stored ||
    stored.purpose !== 'OAUTH_STATE' ||
    stored.consumedAt ||
    stored.expiresAt.getTime() <= Date.now()
  ) {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'This sign-in attempt is invalid, expired, or already used.',
    );
  }

  const metadata = stored.metadata as unknown as OAuthAttemptMetadata;
  if (
    metadata.provider !== expectedProvider ||
    typeof metadata.codeVerifier !== 'string' ||
    typeof metadata.browserTokenHash !== 'string' ||
    !safeCompare(metadata.browserTokenHash, hashToken(browserToken))
  ) {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'The sign-in attempt could not be verified.',
    );
  }

  const consumed = await getPrisma().authToken.updateMany({
    where: { id: stored.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new ForbiddenError(
      ErrorCode.OAUTH_STATE_INVALID,
      'This sign-in attempt was already used.',
    );
  }

  return {
    redirectTo: metadata.redirectTo,
    mode: metadata.mode === 'talent_signup' ? 'talent_signup' : 'login',
    acceptedTerms: metadata.acceptedTerms === true,
    codeVerifier: metadata.codeVerifier,
  };
}

/* -------------------------------------------------------------------------- */
/* Authorisation and token exchange                                           */
/* -------------------------------------------------------------------------- */

export function buildAuthorizationUrl(
  provider: OAuthProviderKey,
  state: string,
  codeChallenge: string,
): string {
  const config = requireProviderConfig(provider);
  const endpoints = ENDPOINTS[provider];

  const url = new URL(endpoints.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', endpoints.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // `prompt=select_account` stops a shared browser from silently reusing the
  // previous user's Google session.
  if (provider === 'google') url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export async function exchangeCodeForIdentity(
  provider: OAuthProviderKey,
  code: string,
  codeVerifier: string,
): Promise<OAuthIdentity> {
  const config = requireProviderConfig(provider);
  const endpoints = ENDPOINTS[provider];

  const tokenResponse = await fetch(endpoints.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text().catch(() => '');
    log.error({ provider, status: tokenResponse.status }, 'oauth token exchange failed');
    void detail;
    throw new UnauthenticatedError(
      ErrorCode.OAUTH_EXCHANGE_FAILED,
      'We could not complete sign-in with that provider. Please try again.',
    );
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) {
    throw new UnauthenticatedError(
      ErrorCode.OAUTH_EXCHANGE_FAILED,
      'The sign-in provider did not return an access token.',
    );
  }

  const profileResponse = await fetch(endpoints.userInfoUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
  });

  if (!profileResponse.ok) {
    throw new UnauthenticatedError(
      ErrorCode.OAUTH_EXCHANGE_FAILED,
      'We could not read your profile from the sign-in provider.',
    );
  }

  const profile = (await profileResponse.json()) as Record<string, unknown>;
  return normaliseProfile(provider, profile);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normaliseProfile(
  provider: OAuthProviderKey,
  profile: Record<string, unknown>,
): OAuthIdentity {
  const subject = asString(profile['sub']) ?? asString(profile['id']) ?? asString(profile['email']);

  if (!subject) {
    throw new UnauthenticatedError(
      ErrorCode.OAUTH_EMAIL_UNAVAILABLE,
      'The sign-in provider did not return an account identifier.',
    );
  }

  const email = asString(profile['email'])?.toLowerCase();
  const emailVerifiedRaw = profile['email_verified'] ?? profile['emailVerified'];
  const emailVerified = emailVerifiedRaw === true || emailVerifiedRaw === 'true';

  const name = asString(profile['name']);
  const givenName = asString(profile['given_name']);
  const familyName = asString(profile['family_name']);

  return {
    provider,
    providerUserId: subject,
    email,
    emailVerified,
    displayName: name ?? ([givenName, familyName].filter(Boolean).join(' ') || undefined),
    avatarUrl: asString(profile['picture']) ?? asString(profile['avatar_url']) ?? undefined,
  };
}
