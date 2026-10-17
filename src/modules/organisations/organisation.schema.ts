import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import {
  countryCodeSchema,
  emailSchema,
  personNameSchema,
  phoneSchema,
  timeZoneSchema,
  urlSchema,
  uuidSchema,
} from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const addressParamsSchema = strictObject({
  organisationId: uuidSchema,
  addressId: uuidSchema,
});
export const memberParamsSchema = strictObject({
  organisationId: uuidSchema,
  membershipId: uuidSchema,
});
export const invitationParamsSchema = strictObject({
  organisationId: uuidSchema,
  invitationId: uuidSchema,
});
export const invitationTokenParamsSchema = strictObject({ token: z.string().min(20).max(512) });

export const organisationUpdateSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  name: z.string().trim().min(2).max(200).optional(),
  legalName: z.string().trim().min(2).max(200).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  companySize: z.string().trim().max(40).nullable().optional(),
  websiteUrl: urlSchema.nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  primaryContactName: z.string().trim().max(200).nullable().optional(),
  primaryContactEmail: emailSchema.nullable().optional(),
  primaryContactPhone: phoneSchema.nullable().optional(),
  timeZone: timeZoneSchema.optional(),
  countryCode: countryCodeSchema.nullable().optional(),
});

export const onboardingUpdateSchema = z.discriminatedUnion('step', [
  strictObject({
    step: z.literal('PERSONAL'),
    expectedUpdatedAt: z.coerce.date(),
    firstName: personNameSchema,
    lastName: personNameSchema,
    phone: phoneSchema.nullable().optional(),
    timeZone: timeZoneSchema.optional(),
    countryCode: countryCodeSchema.nullable().optional(),
    jobTitle: z.string().trim().max(160).nullable().optional(),
  }),
  strictObject({
    step: z.literal('COMPANY'),
    expectedUpdatedAt: z.coerce.date(),
    name: z.string().trim().min(2).max(200),
    legalName: z.string().trim().max(200).nullable().optional(),
    primaryContactEmail: emailSchema,
    companySize: z.string().trim().max(40).nullable().optional(),
    industry: z.string().trim().max(120).nullable().optional(),
    websiteUrl: urlSchema.nullable().optional(),
    timeZone: timeZoneSchema.optional(),
    countryCode: countryCodeSchema.nullable().optional(),
  }),
  strictObject({
    step: z.literal('MANAGERS'),
    expectedUpdatedAt: z.coerce.date(),
    skipped: z.boolean().default(false),
  }),
  strictObject({
    step: z.literal('ACCOUNTS'),
    expectedUpdatedAt: z.coerce.date(),
    acknowledged: z.literal(true),
  }),
]);

const addressFields = {
  label: z.string().trim().min(1).max(40).default('primary'),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  countryCode: countryCodeSchema,
  timeZone: timeZoneSchema.nullable().optional(),
  isPrimary: z.boolean().default(false),
};
export const createAddressSchema = strictObject(addressFields);
export const updateAddressSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  label: addressFields.label.optional(),
  line1: addressFields.line1.optional(),
  line2: addressFields.line2,
  city: addressFields.city.optional(),
  state: addressFields.state,
  postalCode: addressFields.postalCode,
  countryCode: addressFields.countryCode.optional(),
  timeZone: addressFields.timeZone,
  isPrimary: z.boolean().optional(),
});

export const settingsUpdateSchema = strictObject({
  settings: z.record(z.string().min(1).max(120), z.unknown()),
});

export const memberListQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED']).optional(),
  role: z.enum(['COMPANY_OWNER', 'HR_USER', 'MANAGER', 'TALENT']).optional(),
  q: z.string().trim().max(200).optional(),
});

export const changeMemberRoleSchema = strictObject({
  role: z.enum(['COMPANY_OWNER', 'HR_USER', 'MANAGER', 'TALENT']),
  expectedUpdatedAt: z.coerce.date(),
});
export const memberReasonSchema = strictObject({
  reason: z.string().trim().min(5).max(500),
  expectedUpdatedAt: z.coerce.date(),
});
export const reactivateMemberSchema = strictObject({ expectedUpdatedAt: z.coerce.date() });

export const createInvitationSchema = strictObject({
  email: emailSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  role: z.enum(['COMPANY_OWNER', 'HR_USER', 'MANAGER']),
  message: z.string().trim().max(1000).nullable().optional(),
});
export const invitationListQuerySchema = pagePaginationSchema.extend({
  state: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']).optional(),
});
export const revokeInvitationSchema = strictObject({ reason: z.string().trim().min(5).max(500) });
export const resendInvitationSchema = strictObject({ reason: z.string().trim().min(5).max(500) });

export type OrganisationUpdateInput = z.infer<typeof organisationUpdateSchema>;
export type OnboardingUpdateInput = z.infer<typeof onboardingUpdateSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type InvitationListQuery = z.infer<typeof invitationListQuerySchema>;
