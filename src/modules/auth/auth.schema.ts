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
});

export const oauthCallbackQuerySchema = strictObject({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(2048),
});

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
