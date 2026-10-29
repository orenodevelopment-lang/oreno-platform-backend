import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthenticatedError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

const mocks = vi.hoisted(() => ({
  isProviderConfigured: vi.fn(),
  readSignedState: vi.fn(),
  isExpectedCallbackIssuer: vi.fn(),
  exchangeCodeForIdentity: vi.fn(),
  logOAuthCallbackFailure: vi.fn(),
  resolveOAuthUser: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
  setCsrfCookie: vi.fn(),
}));

vi.mock('../../config/index.js', () => ({
  loadConfig: () => ({
    appUrl: 'https://orenoglobal.com',
    isProduction: true,
  }),
}));

vi.mock('../../common/security/cookies.js', () => ({
  clearSessionCookie: vi.fn(),
  setSessionCookie: mocks.setSessionCookie,
}));

vi.mock('../../common/security/csrf.js', () => ({
  clearCsrfCookie: vi.fn(),
  setCsrfCookie: mocks.setCsrfCookie,
}));

vi.mock('./auth.oauth.js', () => ({
  OAUTH_STATE_COOKIE: 'oreno_oauth_state',
  buildAuthorizationUrl: vi.fn(),
  buildSignedState: vi.fn(),
  exchangeCodeForIdentity: mocks.exchangeCodeForIdentity,
  isExpectedCallbackIssuer: mocks.isExpectedCallbackIssuer,
  isProviderConfigured: mocks.isProviderConfigured,
  logOAuthCallbackFailure: mocks.logOAuthCallbackFailure,
  readSignedState: mocks.readSignedState,
}));

vi.mock('./auth.oauth-linking.js', () => ({
  resolveOAuthUser: mocks.resolveOAuthUser,
  unlinkIdentity: vi.fn(),
}));

vi.mock('./auth.two-factor.js', () => ({
  isTwoFactorEnabled: mocks.isTwoFactorEnabled,
}));

vi.mock('./session.service.js', () => ({
  createSession: mocks.createSession,
  satisfyMfa: vi.fn(),
}));

import { handleOAuthCallback } from './auth.controller.js';

const redirectTo = 'https://orenoglobal.com/auth/talent-login';
const redirectMocks = new WeakMap<Response, ReturnType<typeof vi.fn>>();

function callbackRequest(
  query: Record<string, unknown>,
  provider: 'google' | 'linkedin' = 'google',
  browserToken = 'browser-token',
): Request {
  return {
    params: { provider },
    query,
    cookies: browserToken ? { oreno_oauth_state: browserToken } : {},
    get: vi.fn().mockReturnValue(undefined),
    ip: '127.0.0.1',
  } as unknown as Request;
}

function callbackResponse(): Response {
  const redirect = vi.fn();
  const response = {
    clearCookie: vi.fn(),
    redirect,
  } as unknown as Response;
  redirectMocks.set(response, redirect);
  return response;
}

function redirectedUrl(response: Response): URL {
  const redirect = redirectMocks.get(response);
  if (!redirect) throw new Error('Response redirect mock was not registered.');
  expect(redirect).toHaveBeenCalledOnce();
  return new URL(redirect.mock.calls[0]?.[1] as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isProviderConfigured.mockReturnValue(true);
  mocks.readSignedState.mockResolvedValue({
    redirectTo,
    mode: 'login',
    acceptedTerms: false,
    codeVerifier: 'pkce-verifier',
  });
  mocks.isExpectedCallbackIssuer.mockImplementation(
    (provider: string, issuer: string | undefined) =>
      provider !== 'google' || issuer === undefined || issuer === 'https://accounts.google.com',
  );
  mocks.exchangeCodeForIdentity.mockResolvedValue({
    provider: 'google',
    providerUserId: 'provider-user',
    email: 'oauth@example.test',
    emailVerified: true,
    displayName: 'OAuth User',
    avatarUrl: undefined,
  });
  mocks.resolveOAuthUser.mockResolvedValue({ userId: 'user-id', created: false });
  mocks.isTwoFactorEnabled.mockResolvedValue(false);
  mocks.createSession.mockResolvedValue({
    token: 'session-token',
    csrfToken: 'csrf-token',
  });
});

describe('OAuth callback controller', () => {
  it.each([
    [
      'google',
      {
        code: 'google-code',
        state: 'signed-state',
        iss: 'https://accounts.google.com',
        scope: 'openid email profile',
        authuser: '0',
        prompt: 'consent',
        harmless_provider_value: 'ignored',
      },
    ],
    ['linkedin', { code: 'linkedin-code', state: 'signed-state' }],
  ] as const)('exchanges a valid %s callback and creates a session', async (provider, query) => {
    const request = callbackRequest({ ...query }, provider);
    const response = callbackResponse();

    await handleOAuthCallback(request, response);

    expect(mocks.readSignedState).toHaveBeenCalledWith('signed-state', provider, 'browser-token');
    expect(mocks.exchangeCodeForIdentity).toHaveBeenCalledWith(
      provider,
      query.code,
      'pkce-verifier',
    );
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(response, 'session-token');
    expect(mocks.setCsrfCookie).toHaveBeenCalledWith(response, 'csrf-token');
    expect(redirectedUrl(response).origin).toBe('https://orenoglobal.com');
  });

  it('handles a LinkedIn provider error without exchanging a code or reflecting raw details', async () => {
    const response = callbackResponse();
    await handleOAuthCallback(
      callbackRequest(
        {
          error: 'user_cancelled_login',
          error_description: 'Raw provider detail must not be reflected.',
          state: 'signed-state',
        },
        'linkedin',
      ),
      response,
    );

    expect(mocks.logOAuthCallbackFailure).toHaveBeenCalledWith(
      'linkedin',
      'provider_error',
      'user_cancelled_login',
    );
    expect(mocks.exchangeCodeForIdentity).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    const redirect = redirectedUrl(response);
    expect(redirect.searchParams.get('oauthReason')).toBe('provider_error');
    expect(redirect.toString()).not.toContain('Raw+provider+detail');
  });

  it('consumes valid state before rejecting a callback with no authorization code', async () => {
    const response = callbackResponse();
    await handleOAuthCallback(
      callbackRequest({ state: 'signed-state', iss: 'https://accounts.google.com' }),
      response,
    );

    expect(mocks.readSignedState).toHaveBeenCalledOnce();
    expect(mocks.exchangeCodeForIdentity).not.toHaveBeenCalled();
    expect(redirectedUrl(response).searchParams.get('oauthReason')).toBe('invalid_response');
  });

  it('rejects missing, invalid, expired and replayed state without creating a session', async () => {
    const missingResponse = callbackResponse();
    await handleOAuthCallback(
      callbackRequest({ code: 'code', iss: 'https://accounts.google.com' }),
      missingResponse,
    );
    expect(mocks.readSignedState).not.toHaveBeenCalled();
    expect(redirectedUrl(missingResponse).searchParams.get('oauthReason')).toBe('invalid_state');

    for (const message of ['invalid state', 'expired state', 'replayed state']) {
      vi.clearAllMocks();
      mocks.isProviderConfigured.mockReturnValue(true);
      mocks.readSignedState.mockRejectedValueOnce(
        new ForbiddenError(ErrorCode.OAUTH_STATE_INVALID, message),
      );
      const response = callbackResponse();
      await handleOAuthCallback(
        callbackRequest({
          code: 'code',
          state: 'signed-state',
          iss: 'https://accounts.google.com',
        }),
        response,
      );
      expect(mocks.exchangeCodeForIdentity).not.toHaveBeenCalled();
      expect(mocks.createSession).not.toHaveBeenCalled();
      expect(redirectedUrl(response).searchParams.get('oauthReason')).toBe('invalid_state');
    }
  });

  it('consumes state and rejects an invalid Google issuer before code exchange', async () => {
    mocks.isExpectedCallbackIssuer.mockReturnValue(false);
    const response = callbackResponse();
    await handleOAuthCallback(
      callbackRequest({ code: 'code', state: 'signed-state', iss: 'https://attacker.example' }),
      response,
    );

    expect(mocks.readSignedState).toHaveBeenCalledOnce();
    expect(mocks.exchangeCodeForIdentity).not.toHaveBeenCalled();
    expect(redirectedUrl(response).searchParams.get('oauthReason')).toBe('invalid_issuer');
  });

  it.each([
    { code: 'code', error: 'access_denied', state: 'signed-state' },
    { code: ['first', 'second'], state: 'signed-state' },
    { code: 'code', state: 'signed-state', id_token: 'unexpected-token' },
  ])('rejects conflicting, duplicated or sensitive callback parameters', async (query) => {
    const response = callbackResponse();
    await handleOAuthCallback(callbackRequest(query), response);

    expect(mocks.readSignedState).toHaveBeenCalledOnce();
    expect(mocks.exchangeCodeForIdentity).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(redirectedUrl(response).searchParams.get('oauthReason')).toBe('invalid_response');
  });

  it('redirects an unknown provider identity to a controlled account-not-found state', async () => {
    mocks.resolveOAuthUser.mockRejectedValueOnce(
      new UnauthenticatedError(
        ErrorCode.OAUTH_ACCOUNT_NOT_FOUND,
        'No Oreno account uses that provider identity.',
      ),
    );
    const response = callbackResponse();

    await handleOAuthCallback(
      callbackRequest({
        code: 'google-code',
        state: 'signed-state',
        iss: 'https://accounts.google.com',
      }),
      response,
    );

    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    expect(redirectedUrl(response).searchParams.get('oauthReason')).toBe('account_not_found');
    expect(mocks.logOAuthCallbackFailure).toHaveBeenCalledWith(
      'google',
      'account_not_found',
    );
  });
});
