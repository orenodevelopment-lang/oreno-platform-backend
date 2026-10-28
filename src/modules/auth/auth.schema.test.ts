import { describe, expect, it } from 'vitest';
import { isExpectedCallbackIssuer } from './auth.oauth.js';
import { oauthCallbackQuerySchema, oauthCallbackStateSchema } from './auth.schema.js';

describe('OAuth callback validation', () => {
  it('accepts a Google success response and strips harmless provider extras', () => {
    const parsed = oauthCallbackQuerySchema.parse({
      code: 'google-code',
      state: 'signed-state',
      iss: 'https://accounts.google.com',
      scope: 'openid email profile',
      authuser: '0',
      prompt: 'consent',
      hd: 'orenoglobal.com',
      session_state: 'ignored-provider-value',
    });

    expect(parsed).toMatchObject({
      kind: 'success',
      code: 'google-code',
      state: 'signed-state',
      iss: 'https://accounts.google.com',
      scope: 'openid email profile',
      authuser: '0',
      prompt: 'consent',
      hd: 'orenoglobal.com',
    });
    expect(parsed).not.toHaveProperty('session_state');
  });

  it('accepts LinkedIn success and provider-error responses', () => {
    expect(
      oauthCallbackQuerySchema.parse({ code: 'linkedin-code', state: 'signed-state' }),
    ).toMatchObject({ kind: 'success', code: 'linkedin-code', state: 'signed-state' });

    expect(
      oauthCallbackQuerySchema.parse({
        error: 'user_cancelled_login',
        error_description: 'The resource owner denied the request.',
        state: 'signed-state',
      }),
    ).toMatchObject({
      kind: 'error',
      error: 'user_cancelled_login',
      state: 'signed-state',
    });
  });

  it('requires exactly one success or error result with a scalar state', () => {
    expect(oauthCallbackQuerySchema.safeParse({ state: 'signed-state' }).success).toBe(false);
    expect(oauthCallbackQuerySchema.safeParse({ code: 'code-only' }).success).toBe(false);
    expect(
      oauthCallbackQuerySchema.safeParse({
        code: 'code',
        error: 'access_denied',
        state: 'signed-state',
      }).success,
    ).toBe(false);
    expect(
      oauthCallbackQuerySchema.safeParse({
        code: ['first', 'second'],
        state: 'signed-state',
      }).success,
    ).toBe(false);
    expect(oauthCallbackStateSchema.safeParse({ state: ['first', 'second'] }).success).toBe(false);
  });

  it('rejects unexpected security-sensitive callback parameters', () => {
    expect(
      oauthCallbackQuerySchema.safeParse({
        code: 'code',
        state: 'signed-state',
        id_token: 'must-not-be-accepted',
      }).success,
    ).toBe(false);
    expect(
      oauthCallbackQuerySchema.safeParse({
        error: 'access_denied',
        state: 'signed-state',
        client_secret: 'must-not-be-accepted',
      }).success,
    ).toBe(false);
  });

  it('validates the Google authorization-server issuer when supplied', () => {
    expect(isExpectedCallbackIssuer('google', undefined)).toBe(true);
    expect(isExpectedCallbackIssuer('google', 'https://accounts.google.com')).toBe(true);
    expect(isExpectedCallbackIssuer('google', 'https://attacker.example')).toBe(false);
    expect(isExpectedCallbackIssuer('linkedin', 'https://www.linkedin.com')).toBe(true);
  });
});
