import { z } from 'zod';
import { strictObject } from '../../common/validation/validate.js';
import {
  emailSchema,
  personNameSchema,
  phoneSchema,
  timeZoneSchema,
} from '../../common/validation/common-schemas.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../common/security/password.js';

/**
 * Authentication request schemas.
 *
 * Every body is a strict object so an unexpected field — `isPlatformAdmin`,
 * `emailVerifiedAt`, `status` — is rejected instead of silently ignored or
 * persisted. Passwords are length-bounded here and policy-checked in the
 * service, because the policy needs the breach-list lookup.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

export const registerSchema = strictObject({
  accountType: z.enum(['TALENT', 'COMPANY_OWNER']),
  email: emailSchema,
  password: passwordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms to create an account.' }),
  }),
  organisationName: z.string().trim().min(2).max(200).optional(),
});

export const loginSchema = strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  /** Optional TOTP or recovery code supplied with the same request. */
  twoFactorCode: z.string().trim().min(6).max(32).optional(),
  deviceLabel: z.string().trim().max(160).optional(),
});

export const verifyEmailSchema = strictObject({
  token: z.string().min(20).max(512),
});

export const resendVerificationSchema = strictObject({
  email: emailSchema,
});

export const forgotPasswordSchema = strictObject({
  email: emailSchema,
});

export const resetPasswordSchema = strictObject({
  token: z.string().min(20).max(512),
  password: passwordSchema,
});

export const changePasswordSchema = strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const twoFactorCodeSchema = strictObject({
  code: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .describe('A six-digit TOTP code or an unused recovery code.'),
});

export const twoFactorSetupConfirmSchema = strictObject({
  code: z.string().trim().length(6),
  setupToken: z.string().min(20).max(512),
});

export const disableTwoFactorSchema = strictObject({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  code: z.string().trim().min(6).max(32),
});

export const sessionIdParamsSchema = z.object({ sessionId: z.string().uuid() });

export const oauthStartQuerySchema = strictObject({
  /** Where to send the browser after the callback completes. */
  redirectTo: z.string().trim().max(2048).optional(),
  /** Unknown identities are only allowed to create an account in talent-signup mode. */
  mode: z.enum(['login', 'talent_signup']).default('login'),
  /** Required when mode is talent_signup so consent is recorded at account creation. */
  acceptTerms: z.enum(['true', 'false']).default('false'),
});

const oauthCallbackScalarSchema = z.string().trim().min(1).max(2048);

const oauthProviderCallbackFields = {
  iss: z.string().trim().min(1).max(512).optional(),
  scope: z.string().trim().max(2048).optional(),
  authuser: z.string().trim().max(64).optional(),
  prompt: z.string().trim().max(128).optional(),
  hd: z.string().trim().max(253).optional(),
};

const forbiddenOAuthCallbackKeys = new Set([
  'access_token',
  'id_token',
  'token',
  'session_token',
  'client_id',
  'client_secret',
  'code_verifier',
  'code_challenge',
  'redirect_uri',
]);

function rejectSensitiveOAuthCallbackKeys(
  query: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  for (const key of Object.keys(query)) {
    if (!forbiddenOAuthCallbackKeys.has(key)) continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message: 'This parameter is not accepted on an OAuth callback.',
    });
  }
}

const oauthSuccessCallbackSchema = z
  .object({
    code: oauthCallbackScalarSchema,
    state: oauthCallbackScalarSchema,
    error: z.never().optional(),
    error_description: z.never().optional(),
    error_uri: z.never().optional(),
    ...oauthProviderCallbackFields,
  })
  .passthrough()
  .superRefine(rejectSensitiveOAuthCallbackKeys)
  .transform(({ code, state, iss, scope, authuser, prompt, hd }) => ({
    kind: 'success' as const,
    code,
    state,
    iss,
    scope,
    authuser,
    prompt,
    hd,
  }));

const oauthErrorCallbackSchema = z
  .object({
    code: z.never().optional(),
    state: oauthCallbackScalarSchema,
    error: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._-]+$/),
    error_description: z.string().trim().max(2048).optional(),
    error_uri: z.string().trim().url().max(2048).optional(),
    ...oauthProviderCallbackFields,
  })
  .passthrough()
  .superRefine(rejectSensitiveOAuthCallbackKeys)
  .transform(({ state, error, iss, scope, authuser, prompt, hd }) => ({
    kind: 'error' as const,
    state,
    error,
    iss,
    scope,
    authuser,
    prompt,
    hd,
  }));

/**
 * Provider callbacks may include documented or harmless provider-specific
 * parameters. They are accepted for interoperability, then stripped so only
 * the fields used by the callback flow reach the controller.
 */
export const oauthCallbackQuerySchema = z.union([
  oauthSuccessCallbackSchema,
  oauthErrorCallbackSchema,
]);

/** Flat representation used to document the success-or-error query union. */
export const oauthCallbackOpenApiQuerySchema = z.object({
  code: oauthCallbackScalarSchema.optional(),
  state: oauthCallbackScalarSchema,
  error: z.string().trim().min(1).max(128).optional(),
  error_description: z.string().trim().max(2048).optional(),
  error_uri: z.string().trim().url().max(2048).optional(),
  ...oauthProviderCallbackFields,
});

/** Parse only the state before classifying the rest of the callback. */
export const oauthCallbackStateSchema = z
  .object({ state: oauthCallbackScalarSchema })
  .passthrough()
  .transform(({ state }) => state);

export const updateProfileSchema = strictObject({
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  displayName: z.string().trim().max(200).optional(),
  phone: phoneSchema.nullable().optional(),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Locale must look like "en" or "en-GB".')
    .optional(),
  timeZone: timeZoneSchema.optional(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  jobTitle: z.string().trim().max(160).nullable().optional(),
});

export const updatePreferencesSchema = strictObject({
  emailNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  reducedMotion: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
