import { z } from 'zod';
import {
  changePasswordSchema,
  disableTwoFactorSchema,
  forgotPasswordSchema,
  loginSchema,
  oauthCallbackQuerySchema,
  oauthStartQuerySchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdParamsSchema,
  twoFactorCodeSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '../modules/auth/auth.schema.js';
import { pagePaginationSchema } from '../common/pagination/pagination.js';
import type { OperationDoc } from './openapi.types.js';

/**
 * Every endpoint mounted by `createAuthRouter`.
 *
 * Schemas are imported from the module rather than restated, so a change to a
 * request contract shows up in the generated specification at the same moment
 * it shows up in the validator. A unit test asserts this list and the router
 * describe the same set of routes.
 */

const BASE = '/api/v1/auth';
const TAG = 'auth';

/** Public endpoints opt out of the document-wide session security requirement. */
const PUBLIC: Record<string, string[]>[] = [];

const providerParams = z.object({
  provider: z.enum(['google', 'linkedin']).describe('The federated identity provider.'),
});

const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  emailVerifiedAt: z.string().datetime().nullable(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  avatarFileId: z.string().nullable(),
  locale: z.string(),
  timeZone: z.string(),
  countryCode: z.string().nullable(),
  jobTitle: z.string().nullable(),
  isPlatformAdmin: z.boolean(),
  twoFactorEnabled: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  current: z.boolean(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  deviceLabel: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const preferencesSchema = z.object({
  emailNotifications: z.boolean(),
  inAppNotifications: z.boolean(),
  marketingEmails: z.boolean(),
  weeklyDigest: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  reducedMotion: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const authContextSchema = z.object({
  organisationId: z.string().uuid().nullable(),
  organisationRole: z.string().nullable(),
  membershipId: z.string().uuid().nullable(),
  isPlatformAdmin: z.boolean(),
  platformRoles: z.array(z.string()),
  permissions: z.array(z.string()).describe('Effective platform and organisation permissions, sorted.'),
  mfaSatisfied: z.boolean(),
  sessionExpiresAt: z.string().datetime().nullable(),
  impersonation: z
    .object({
      adminUserId: z.string().uuid(),
      reason: z.string(),
      expiresAt: z.string().datetime(),
    })
    .nullable(),
});

const activitySchema = z.object({
  id: z.string().uuid(),
  type: z.string().describe('A `SecurityEventType` value.'),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  detail: z.unknown().nullable(),
  createdAt: z.string().datetime(),
});

export const authOperations: OperationDoc[] = [
  {
    method: 'post',
    path: `${BASE}/register`,
    operationId: 'authRegister',
    summary: 'Create an account',
    description:
      'Registers an account and sends a verification email. The account cannot sign in until the address is verified, so registration deliberately does not return a session.',
    tags: [TAG],
    security: PUBLIC,
    request: {
      body: registerSchema,
      headers: z.object({
        'Idempotency-Key': z.string().min(8).max(255),
      }),
    },
    responses: [
      {
        status: 201,
        description: 'Account created. The response carries no session by design.',
        envelope: true,
        schema: z.object({
          userId: z.string().uuid(),
          nextStep: z.literal('VERIFY_EMAIL'),
        }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      {
        status: 409,
        description: 'The email address is already registered (`EMAIL_ALREADY_REGISTERED`).',
        ref: '#/components/responses/Conflict',
      },
      {
        status: 422,
        description: 'The password does not meet the policy or appears in a breach list.',
        ref: '#/components/responses/Unprocessable',
      },
      { status: 429, description: 'Rate limited.', ref: '#/components/responses/TooManyRequests' },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/login`,
    operationId: 'authLogin',
    summary: 'Sign in with email and password',
    description:
      'On success, sets the session and CSRF cookies. When the account has two-factor authentication enabled and no code was supplied, responds `401` with code `TWO_FACTOR_REQUIRED` rather than a session.',
    tags: [TAG],
    security: PUBLIC,
    request: { body: loginSchema },
    responses: [
      {
        status: 200,
        description: 'Signed in. Session and CSRF cookies are set on this response.',
        envelope: true,
        schema: z.object({
          user: userSchema,
          session: z.object({
            expiresAt: z.string().datetime(),
            cookieName: z.string(),
            csrfHeaderName: z.string(),
          }),
        }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      {
        status: 401,
        description:
          '`INVALID_CREDENTIALS`, or `TWO_FACTOR_REQUIRED` when a second factor is outstanding.',
        ref: '#/components/responses/Unauthorised',
      },
      {
        status: 403,
        description: 'The account is suspended, deactivated, or its email is unverified.',
        ref: '#/components/responses/Forbidden',
      },
      { status: 429, description: 'Rate limited.', ref: '#/components/responses/TooManyRequests' },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/email/verify`,
    operationId: 'authVerifyEmail',
    summary: 'Verify an email address',
    description: 'Consumes a single-use verification token from the registration email.',
    tags: [TAG],
    security: PUBLIC,
    request: { body: verifyEmailSchema },
    responses: [
      {
        status: 200,
        description: 'The address is verified. The token is now spent.',
        envelope: true,
        schema: z.object({ verified: z.literal(true) }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      {
        status: 422,
        description: '`TOKEN_INVALID`, `TOKEN_EXPIRED` or `TOKEN_ALREADY_USED`.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/email/resend`,
    operationId: 'authResendVerification',
    summary: 'Resend the verification email',
    description:
      'Always answers `202`, whether or not the address exists, so the endpoint cannot be used to enumerate accounts.',
    tags: [TAG],
    security: PUBLIC,
    request: { body: resendVerificationSchema },
    responses: [
      {
        status: 202,
        description: 'Accepted for processing.',
        envelope: true,
        schema: z.object({ accepted: z.literal(true) }),
      },
      { status: 429, description: 'Rate limited.', ref: '#/components/responses/TooManyRequests' },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/password/forgot`,
    operationId: 'authForgotPassword',
    summary: 'Request a password reset',
    description:
      'Always answers `202` so the endpoint cannot be used to enumerate accounts. The email is sent asynchronously.',
    tags: [TAG],
    security: PUBLIC,
    request: { body: forgotPasswordSchema },
    responses: [
      {
        status: 202,
        description: 'Accepted for processing.',
        envelope: true,
        schema: z.object({ accepted: z.literal(true) }),
      },
      { status: 429, description: 'Rate limited.', ref: '#/components/responses/TooManyRequests' },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/password/reset`,
    operationId: 'authResetPassword',
    summary: 'Complete a password reset',
    description:
      'Consumes a single-use reset token, sets the new password and revokes every existing session. The session cookie is cleared.',
    tags: [TAG],
    security: PUBLIC,
    request: { body: resetPasswordSchema },
    responses: [
      {
        status: 200,
        description: 'Password reset. All prior sessions are revoked.',
        envelope: true,
        schema: z.object({ reset: z.literal(true) }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      {
        status: 422,
        description: 'The token is invalid or expired, or the password fails policy.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },

  {
    method: 'get',
    path: `${BASE}/oauth/{provider}/start`,
    operationId: 'authStartOAuth',
    summary: 'Begin a federated sign-in',
    description:
      'Returns the provider authorization URL and the signed `state` to expect on the callback. The browser is sent to the URL; the API never handles the provider redirect itself.',
    tags: [TAG],
    security: PUBLIC,
    request: { params: providerParams, query: oauthStartQuerySchema },
    responses: [
      {
        status: 200,
        description: 'Authorization URL built.',
        envelope: true,
        schema: z.object({ authorizationUrl: z.string().url(), state: z.string() }),
      },
      {
        status: 404,
        description: 'The provider name is not supported.',
        ref: '#/components/responses/NotFound',
      },
      {
        status: 422,
        description: 'The provider is recognised but not configured on this deployment.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },

  {
    method: 'get',
    path: `${BASE}/oauth/{provider}/callback`,
    operationId: 'authOAuthCallback',
    summary: 'Complete a federated sign-in',
    description:
      'Exchanges the authorization code, resolves or creates the local account, and sets the session cookies. `redirectTo` echoes the validated post-login destination.',
    tags: [TAG],
    security: PUBLIC,
    request: { params: providerParams, query: oauthCallbackQuerySchema },
    responses: [
      {
        status: 200,
        description: 'Signed in. Session and CSRF cookies are set on this response.',
        envelope: true,
        schema: z.object({
          userId: z.string().uuid(),
          created: z.boolean().describe('True when this callback created the local account.'),
          linked: z.boolean().describe('True when the identity was linked to an existing account.'),
          redirectTo: z.string().nullable(),
        }),
      },
      {
        status: 422,
        description: '`OAUTH_STATE_INVALID`, `OAUTH_EXCHANGE_FAILED` or `OAUTH_EMAIL_UNAVAILABLE`.',
        ref: '#/components/responses/Unprocessable',
      },
      {
        status: 409,
        description: 'The identity is already linked to a different account.',
        ref: '#/components/responses/Conflict',
      },
    ],
  },

  /* -------- Session lifecycle -------- */

  {
    method: 'post',
    path: `${BASE}/logout`,
    operationId: 'authLogout',
    summary: 'Sign out of the current session',
    description: 'Revokes the current session and clears the session and CSRF cookies.',
    tags: [TAG],
    responses: [
      { status: 204, description: 'Signed out. No response body.' },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/logout-all`,
    operationId: 'authLogoutAll',
    summary: 'Sign out of every session',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'Every session for the account was revoked.',
        envelope: true,
        schema: z.object({ revokedSessions: z.number().int().min(0) }),
      },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'get',
    path: `${BASE}/sessions`,
    operationId: 'authListSessions',
    summary: 'List active sessions',
    description: 'Returns every live session for the account, flagging the one making the call.',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'Active sessions, newest first.',
        envelope: true,
        schema: z.object({ sessions: z.array(sessionSummarySchema) }),
      },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'delete',
    path: `${BASE}/sessions/{sessionId}`,
    operationId: 'authRevokeSession',
    summary: 'Revoke a session',
    description: 'Revokes one of the account\'s own sessions by id.',
    tags: [TAG],
    request: { params: sessionIdParamsSchema },
    responses: [
      { status: 204, description: 'Session revoked. No response body.' },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
      {
        status: 404,
        description: 'No such session belongs to this account.',
        ref: '#/components/responses/NotFound',
      },
    ],
  },

  /* -------- Current account -------- */

  {
    method: 'get',
    path: `${BASE}/me`,
    operationId: 'authCurrentUser',
    summary: 'Get the current account and authorisation context',
    description:
      'The frontend calls this on every page load to resolve the active organisation, roles and effective permissions. It is exempt from the tighter credential rate limit for that reason.',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'The account plus the resolved authorisation context.',
        envelope: true,
        schema: z.object({ user: userSchema, context: authContextSchema }),
      },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'patch',
    path: `${BASE}/me`,
    operationId: 'authUpdateProfile',
    summary: 'Update the current account profile',
    tags: [TAG],
    request: { body: updateProfileSchema },
    responses: [
      {
        status: 200,
        description: 'The updated account.',
        envelope: true,
        schema: z.object({ user: userSchema }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'get',
    path: `${BASE}/me/preferences`,
    operationId: 'authGetPreferences',
    summary: 'Get notification and display preferences',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'The account preferences, created with defaults on first read.',
        envelope: true,
        schema: z.object({ preferences: preferencesSchema }),
      },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'patch',
    path: `${BASE}/me/preferences`,
    operationId: 'authUpdatePreferences',
    summary: 'Update notification and display preferences',
    tags: [TAG],
    request: { body: updatePreferencesSchema },
    responses: [
      {
        status: 200,
        description: 'The updated preferences.',
        envelope: true,
        schema: z.object({ preferences: preferencesSchema }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'get',
    path: `${BASE}/me/activity`,
    operationId: 'authListActivity',
    summary: 'List account security activity',
    description: 'A paginated, newest-first view of security events recorded against the account.',
    tags: [TAG],
    request: { query: pagePaginationSchema },
    responses: [
      {
        status: 200,
        description: 'One page of activity. Pagination fields are in `meta`.',
        envelope: true,
        schema: z.object({ activity: z.array(activitySchema) }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
    ],
  },

  {
    method: 'delete',
    path: `${BASE}/me/oauth/{provider}`,
    operationId: 'authUnlinkOAuthProvider',
    summary: 'Unlink a federated identity',
    description:
      'Removes the link between this account and a provider. Refused when it would leave the account with no way to sign in.',
    tags: [TAG],
    request: { params: providerParams },
    responses: [
      { status: 204, description: 'Identity unlinked. No response body.' },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
      {
        status: 422,
        description: 'The provider is not configured, or the unlink would lock the account out.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/password/change`,
    operationId: 'authChangePassword',
    summary: 'Change the account password',
    description:
      'Requires the current password. Every other session is revoked; the calling session is preserved.',
    tags: [TAG],
    request: { body: changePasswordSchema },
    responses: [
      {
        status: 200,
        description: 'Password changed and other sessions revoked.',
        envelope: true,
        schema: z.object({ changed: z.literal(true) }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      {
        status: 401,
        description: 'Not authenticated, or the current password is wrong.',
        ref: '#/components/responses/Unauthorised',
      },
      {
        status: 422,
        description: 'The new password does not meet the policy.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },

  /* -------- Two-factor authentication -------- */

  {
    method: 'post',
    path: `${BASE}/2fa/setup`,
    operationId: 'authTwoFactorSetup',
    summary: 'Begin two-factor enrolment',
    description:
      'Generates a pending TOTP secret and its `otpauth://` URL. Enrolment is not active until `POST /2fa/confirm` succeeds. Requires a session that has already satisfied the second factor, so a stolen password alone cannot re-enrol the account.',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'Pending secret. Shown once.',
        envelope: true,
        schema: z.object({
          secret: z.string().describe('Base32 TOTP secret, for manual entry.'),
          otpauthUrl: z.string().describe('`otpauth://` URL to render as a QR code.'),
        }),
      },
      { status: 401, description: 'Not authenticated.', ref: '#/components/responses/Unauthorised' },
      {
        status: 403,
        description: 'The session has not satisfied the second factor.',
        ref: '#/components/responses/Forbidden',
      },
      {
        status: 409,
        description: 'Two-factor authentication is already enabled.',
        ref: '#/components/responses/Conflict',
      },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/2fa/confirm`,
    operationId: 'authTwoFactorConfirm',
    summary: 'Confirm two-factor enrolment',
    description:
      'Verifies a code against the pending secret and activates two-factor authentication, returning recovery codes once.',
    tags: [TAG],
    request: { body: twoFactorCodeSchema },
    responses: [
      {
        status: 200,
        description: 'Two-factor authentication enabled. Recovery codes are returned only here.',
        envelope: true,
        schema: z.object({ enabled: z.literal(true), recoveryCodes: z.array(z.string()) }),
      },
      { status: 400, description: 'Validation failed.', ref: '#/components/responses/BadRequest' },
      {
        status: 422,
        description: 'The code did not verify against the pending secret.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/2fa/disable`,
    operationId: 'authTwoFactorDisable',
    summary: 'Disable two-factor authentication',
    description: 'Requires the account password plus a current TOTP or recovery code.',
    tags: [TAG],
    request: { body: disableTwoFactorSchema },
    responses: [
      {
        status: 200,
        description: 'Two-factor authentication disabled.',
        envelope: true,
        schema: z.object({ enabled: z.literal(false) }),
      },
      {
        status: 422,
        description: 'The password or the code was rejected, or 2FA was not enabled.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },

  {
    method: 'post',
    path: `${BASE}/2fa/recovery-codes`,
    operationId: 'authTwoFactorRecoveryCodes',
    summary: 'Regenerate recovery codes',
    description:
      'Invalidates all existing recovery codes and issues a fresh set. Requires a session that has satisfied the second factor.',
    tags: [TAG],
    request: { body: twoFactorCodeSchema },
    responses: [
      {
        status: 200,
        description: 'New recovery codes. Returned once.',
        envelope: true,
        schema: z.object({ recoveryCodes: z.array(z.string()) }),
      },
      {
        status: 403,
        description: 'The session has not satisfied the second factor.',
        ref: '#/components/responses/Forbidden',
      },
      {
        status: 422,
        description: 'The code did not verify.',
        ref: '#/components/responses/Unprocessable',
      },
    ],
  },
];
