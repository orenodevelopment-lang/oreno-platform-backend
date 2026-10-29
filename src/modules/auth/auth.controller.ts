import type { Request, Response } from 'express';
import { sendSuccess, sendNoContent } from '../../common/http/response.js';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  isAppError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { validate } from '../../common/validation/validate.js';
import {
  pagePaginationSchema,
  buildPageMeta,
  toSkipTake,
} from '../../common/pagination/pagination.js';
import { setCsrfCookie, clearCsrfCookie } from '../../common/security/csrf.js';
import { setSessionCookie, clearSessionCookie } from '../../common/security/cookies.js';
import { loadConfig } from '../../config/index.js';
import {
  abortIdempotent,
  beginIdempotent,
  requestFingerprint,
  requireIdempotencyKey,
} from '../../platform/idempotency/idempotency.service.js';
import { requireAuthContext } from './auth.middleware.js';
import * as service from './auth.service.js';
import * as twoFactor from './auth.two-factor.js';
import * as oauth from './auth.oauth.js';
import { resolveOAuthUser, unlinkIdentity } from './auth.oauth-linking.js';
import { satisfyMfa } from './session.service.js';
import {
  changePasswordSchema,
  disableTwoFactorSchema,
  forgotPasswordSchema,
  loginSchema,
  oauthCallbackQuerySchema,
  oauthCallbackStateSchema,
  oauthStartQuerySchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdParamsSchema,
  twoFactorCodeSchema,
  twoFactorSetupConfirmSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from './auth.schema.js';

function metaFrom(req: Request): service.RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: registerSchema });
  const key = requireIdempotencyKey(req);
  const claim = await beginIdempotent({
    scope: 'POST:/api/v1/auth/register',
    key,
    requestHash: requestFingerprint(req),
  });

  if (claim.state === 'mismatch') {
    throw new ConflictError(
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
      'This Idempotency-Key was already used for a different registration.',
    );
  }
  if (claim.state === 'in_progress') {
    throw new ConflictError(
      ErrorCode.IDEMPOTENCY_IN_PROGRESS,
      'This registration is already being processed. Please retry shortly.',
    );
  }
  if (claim.state === 'replayed') {
    res.status(claim.statusCode).json({ data: claim.body, meta: { replayed: true } });
    return;
  }

  let result: service.RegistrationResult;
  try {
    result = await service.register(body, metaFrom(req), claim.recordId);
  } catch (error) {
    await abortIdempotent(claim.recordId);
    throw error;
  }

  sendSuccess(
    res,
    result,
    { status: 201 },
  );
}

export async function login(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: loginSchema });
  const result = await service.login(body, { ...metaFrom(req), deviceLabel: body.deviceLabel });

  if (result.outcome === 'two_factor_required') {
    // 401 with a distinct code so the client can prompt for a code and retry
    // the same request rather than treating it as a failed sign-in.
    res.status(401).json({
      error: {
        code: 'TWO_FACTOR_REQUIRED',
        message: 'Enter the code from your authenticator app to continue.',
        requestId: req.requestId,
      },
    });
    return;
  }

  setSessionCookie(res, result.session.token);
  setCsrfCookie(res, result.session.csrfToken);

  const config = loadConfig();
  sendSuccess(res, {
    user: result.user,
    session: {
      expiresAt: result.session.session.expiresAt.toISOString(),
      cookieName: config.session.cookieName,
      csrfHeaderName: config.session.csrfHeaderName,
    },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  if (auth.session) {
    await service.logout(auth.userId, auth.session.id, metaFrom(req));
  }
  clearSessionCookie(res);
  clearCsrfCookie(res);
  sendNoContent(res);
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const revoked = await service.logoutEverywhere(auth.userId, undefined, metaFrom(req));
  clearSessionCookie(res);
  clearCsrfCookie(res);
  sendSuccess(res, { revokedSessions: revoked });
}

export async function currentUser(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const user = await service.getProfile(auth.userId);

  sendSuccess(res, {
    user,
    context: {
      organisationId: auth.organisationId ?? null,
      organisationRole: auth.organisationRole ?? null,
      membershipId: auth.membershipId ?? null,
      isPlatformAdmin: auth.isPlatformAdmin,
      platformRoles: auth.platformRoles,
      permissions: [...auth.platformPermissions, ...auth.organisationPermissions].sort(),
      mfaSatisfied: auth.session?.mfaSatisfied ?? true,
      sessionExpiresAt: auth.session?.expiresAt.toISOString() ?? null,
      impersonation: auth.impersonation
        ? {
            adminUserId: auth.impersonation.adminUserId,
            reason: auth.impersonation.reason,
            expiresAt: auth.impersonation.expiresAt.toISOString(),
          }
        : null,
    },
  });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: updateProfileSchema });
  sendSuccess(res, { user: await service.updateProfile(auth.userId, body, metaFrom(req)) });
}

export async function getPreferences(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  sendSuccess(res, { preferences: await service.getPreferences(auth.userId) });
}

export async function updatePreferences(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: updatePreferencesSchema });
  sendSuccess(res, { preferences: await service.updatePreferences(auth.userId, body) });
}

export async function listActivity(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { query } = validate(req, { query: pagePaginationSchema });
  const { items, total } = await service.listAccountActivity(auth.userId, toSkipTake(query));

  sendSuccess(
    res,
    {
      activity: items.map((event) => ({
        id: event.id,
        type: event.type,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        detail: event.detail,
        createdAt: event.createdAt.toISOString(),
      })),
    },
    { meta: { ...buildPageMeta(query, total) } },
  );
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const sessions = await service.listSessionsForUser(auth.userId, auth.session?.id);
  sendSuccess(res, { sessions });
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { params } = validate(req, { params: sessionIdParamsSchema });
  await service.revokeUserSession(auth.userId, params.sessionId, metaFrom(req));
  sendNoContent(res);
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: verifyEmailSchema });
  await service.verifyEmail(body.token, metaFrom(req));
  sendSuccess(res, { verified: true });
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: resendVerificationSchema });
  await service.resendVerification(body.email, metaFrom(req));
  // Always 202: a different response for an unknown address would enumerate.
  sendSuccess(res, { accepted: true }, { status: 202 });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: forgotPasswordSchema });
  await service.requestPasswordReset(body.email, metaFrom(req));
  sendSuccess(res, { accepted: true }, { status: 202 });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: resetPasswordSchema });
  await service.resetPassword(body.token, body.password, metaFrom(req));
  clearSessionCookie(res);
  clearCsrfCookie(res);
  sendSuccess(res, { reset: true });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: changePasswordSchema });
  await service.changePassword(
    auth.userId,
    body.currentPassword,
    body.newPassword,
    auth.session?.id,
    metaFrom(req),
  );
  sendSuccess(res, { changed: true });
}

/* -------------------------------------------------------------------------- */
/* Two-factor authentication                                                  */
/* -------------------------------------------------------------------------- */

export async function startTwoFactorSetup(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const user = await service.getProfile(auth.userId);
  const setup = await twoFactor.beginTwoFactorSetup(auth.userId, user.email);
  sendSuccess(res, setup);
}

export async function confirmTwoFactorSetup(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: twoFactorSetupConfirmSchema });
  const result = await twoFactor.confirmTwoFactor(auth.userId, body.code, body.setupToken);
  sendSuccess(res, {
    enabled: true,
    // Shown once. Only hashes are stored, so these cannot be retrieved later.
    recoveryCodes: result.recoveryCodes,
  });
}

export async function disableTwoFactor(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: disableTwoFactorSchema });
  await twoFactor.disableTwoFactor(auth.userId, body.password, body.code);
  sendSuccess(res, { enabled: false });
}

export async function regenerateRecoveryCodes(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: twoFactorCodeSchema });
  const result = await twoFactor.regenerateRecoveryCodes(auth.userId, body.code);
  sendSuccess(res, { recoveryCodes: result.recoveryCodes });
}

export async function completeTwoFactorChallenge(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: twoFactorCodeSchema });
  if (!auth.session) {
    throw new UnprocessableError(
      ErrorCode.TWO_FACTOR_REQUIRED,
      'A pending sign-in session is required.',
    );
  }

  const verification = await twoFactor.verifyTwoFactor(auth.userId, body.code);
  if (!verification.valid) {
    throw new UnprocessableError(
      ErrorCode.TWO_FACTOR_INVALID,
      verification.reason === 'locked'
        ? 'Too many incorrect codes. Try again later.'
        : 'That code is not valid.',
    );
  }

  await satisfyMfa(auth.session.id);
  sendSuccess(res, { authenticated: true });
}

/* -------------------------------------------------------------------------- */
/* Federated sign-in                                                          */
/* -------------------------------------------------------------------------- */

export async function startOAuth(req: Request, res: Response): Promise<void> {
  const provider = parseProvider(req.params.provider);
  const { query } = validate(req, { query: oauthStartQuerySchema });
  if (query.mode === 'talent_signup' && query.acceptTerms !== 'true') {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'Accept the terms and privacy policy before creating a talent account.',
    );
  }
  const attempt = await oauth.buildSignedState(provider, query.redirectTo, {
    mode: query.mode,
    acceptedTerms: query.acceptTerms === 'true',
  });
  const config = loadConfig();
  res.cookie(oauth.OAUTH_STATE_COOKIE, attempt.browserToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/api/v1/auth/oauth',
    maxAge: 10 * 60 * 1000,
  });
  sendSuccess(res, {
    authorizationUrl: oauth.buildAuthorizationUrl(
      provider,
      attempt.state,
      attempt.codeChallenge,
    ),
  });
}

export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  const provider = parseProvider(req.params.provider);
  const cookies = (req.cookies ?? {}) as Record<string, unknown>;
  const browserToken =
    typeof cookies[oauth.OAUTH_STATE_COOKIE] === 'string'
      ? cookies[oauth.OAUTH_STATE_COOKIE]
      : undefined;

  res.clearCookie(oauth.OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: loadConfig().isProduction,
    sameSite: loadConfig().isProduction ? 'none' : 'lax',
    path: '/api/v1/auth/oauth',
  });

  const callbackState = oauthCallbackStateSchema.safeParse(req.query);
  if (!callbackState.success) {
    oauth.logOAuthCallbackFailure(provider, 'invalid_state');
    redirectOAuthFailure(res, provider, undefined, 'invalid_state');
    return;
  }

  let state: oauth.ConsumedOAuthAttempt;
  try {
    state = await oauth.readSignedState(callbackState.data, provider, browserToken);
  } catch (error) {
    if (isAppError(error) && error.code === ErrorCode.OAUTH_STATE_INVALID) {
      oauth.logOAuthCallbackFailure(provider, 'invalid_state');
      redirectOAuthFailure(res, provider, undefined, 'invalid_state');
      return;
    }
    throw error;
  }

  const callback = oauthCallbackQuerySchema.safeParse(req.query);
  if (!callback.success) {
    oauth.logOAuthCallbackFailure(provider, 'invalid_response');
    redirectOAuthFailure(res, provider, state.redirectTo, 'invalid_response');
    return;
  }
  const query = callback.data;

  if (!oauth.isExpectedCallbackIssuer(provider, query.iss)) {
    oauth.logOAuthCallbackFailure(provider, 'invalid_issuer');
    redirectOAuthFailure(res, provider, state.redirectTo, 'invalid_issuer');
    return;
  }

  if (query.kind === 'error') {
    oauth.logOAuthCallbackFailure(provider, 'provider_error', query.error);
    redirectOAuthFailure(res, provider, state.redirectTo, 'provider_error');
    return;
  }

  try {
    const identity = await oauth.exchangeCodeForIdentity(provider, query.code, state.codeVerifier);
    const resolution = await resolveOAuthUser(identity, metaFrom(req), {
      mode: state.mode,
      acceptedTerms: state.acceptedTerms,
    });

    const { createSession } = await import('./session.service.js');
    const requiresTwoFactor = await twoFactor.isTwoFactorEnabled(resolution.userId);
    const session = await createSession({
      userId: resolution.userId,
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip,
      mfaSatisfied: !requiresTwoFactor,
    });

    setSessionCookie(res, session.token);
    setCsrfCookie(res, session.csrfToken);

    const destination = state.redirectTo ?? loadConfig().appUrl;
    const redirect = new URL(destination);
    if (requiresTwoFactor) redirect.searchParams.set('step', 'two-factor');
    if (resolution.created) redirect.searchParams.set('created', 'true');
    res.redirect(303, redirect.toString());
  } catch (error) {
    if (isAppError(error) && error.status < 500) {
      const reason = error.code === ErrorCode.OAUTH_ACCOUNT_NOT_FOUND
        ? 'account_not_found'
        : 'authentication_failed';
      oauth.logOAuthCallbackFailure(provider, reason);
      redirectOAuthFailure(res, provider, state.redirectTo, reason);
      return;
    }
    throw error;
  }
}

function redirectOAuthFailure(
  res: Response,
  provider: oauth.OAuthProviderKey,
  destination: string | undefined,
  reason:
    | 'invalid_response'
    | 'invalid_state'
    | 'invalid_issuer'
    | 'provider_error'
    | 'account_not_found'
    | 'authentication_failed',
): void {
  const redirect = new URL(destination ?? loadConfig().appUrl);
  redirect.searchParams.set('oauth', 'failed');
  redirect.searchParams.set('oauthProvider', provider);
  redirect.searchParams.set('oauthReason', reason);
  res.redirect(303, redirect.toString());
}

export async function unlinkOAuthProvider(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const provider = parseProvider(req.params.provider);
  await unlinkIdentity(auth.userId, provider);
  sendNoContent(res);
}

function parseProvider(raw: unknown): oauth.OAuthProviderKey {
  const candidate = Array.isArray(raw) ? (raw as unknown[])[0] : raw;

  if (candidate !== 'google' && candidate !== 'linkedin') {
    // Unknown provider names are a client mistake, not a server misconfiguration.
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'That sign-in provider is not supported.');
  }

  if (!oauth.isProviderConfigured(candidate)) {
    throw new UnprocessableError(
      ErrorCode.OAUTH_PROVIDER_DISABLED,
      'This sign-in provider is not enabled for this deployment.',
    );
  }

  return candidate;
}
