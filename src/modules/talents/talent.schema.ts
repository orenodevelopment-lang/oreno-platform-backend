import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import {
  countryCodeSchema,
  currencySchema,
  isoDateSchema,
  moneyAmountSchema,
  timeZoneSchema,
  urlSchema,
  uuidSchema,
} from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const itemParamsSchema = strictObject({ itemId: uuidSchema });
export const profileParamsSchema = strictObject({ profileId: uuidSchema });

export const updateProfileSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  headline: z.string().trim().max(200).nullable().optional(),
  bio: z.string().trim().max(4000).nullable().optional(),
  countryCode: countryCodeSchema.nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  timeZone: timeZoneSchema.optional(),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  seniority: z.string().trim().max(40).nullable().optional(),
  currentTitle: z.string().trim().max(160).nullable().optional(),
  currentCompany: z.string().trim().max(200).nullable().optional(),
  portfolioUrl: urlSchema.nullable().optional(),
  linkedinUrl: urlSchema.nullable().optional(),
  githubUrl: urlSchema.nullable().optional(),
  websiteUrl: urlSchema.nullable().optional(),
});

export const updateAvailabilitySchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  availabilityStatus: z.enum(['AVAILABLE_NOW', 'AVAILABLE_FROM_DATE', 'UNAVAILABLE']),
  availableFrom: z.coerce.date().nullable(),
  preferredEmploymentTypes: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT'])).min(1).max(3),
  preferredWorkArrangement: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).nullable(),
  hoursPerWeek: z.number().int().min(1).max(168).nullable(),
  expectedRateAmount: moneyAmountSchema.nullable(),
  expectedRateCurrency: currencySchema.nullable(),
  expectedRateUnit: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).nullable(),
}).superRefine((value, context) => {
  if (value.availabilityStatus === 'AVAILABLE_FROM_DATE' && !value.availableFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['availableFrom'], message: 'A date is required when availability starts later.' });
  }
  if (value.availabilityStatus !== 'AVAILABLE_FROM_DATE' && value.availableFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['availableFrom'], message: 'A date is valid only for AVAILABLE_FROM_DATE.' });
  }
  const rateParts = [value.expectedRateAmount, value.expectedRateCurrency, value.expectedRateUnit];
  const supplied = rateParts.filter((part) => part !== null).length;
  if (supplied !== 0 && supplied !== 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedRateAmount'], message: 'Rate amount, currency, and unit must be supplied together.' });
  }
});

export const updateVisibilitySchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  visibility: z.enum(['PUBLIC', 'ORENO_COMPANIES_ONLY', 'PRIVATE']),
});

export const updateAccountPreferencesSchema = strictObject({
  jobAlerts: z.boolean().optional(),
  applicationUpdates: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
});

const experienceFields = {
  title: z.string().trim().min(1).max(160),
  company: z.string().trim().min(1).max(200),
  location: z.string().trim().max(160).nullable().optional(),
  employmentType: z.string().trim().max(40).nullable().optional(),
  startDate: isoDateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)),
  endDate: isoDateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
  isCurrent: z.boolean().default(false),
  description: z.string().trim().max(4000).nullable().optional(),
};
export const createExperienceSchema = strictObject(experienceFields);
export const updateExperienceSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  title: experienceFields.title.optional(),
  company: experienceFields.company.optional(),
  location: experienceFields.location,
  employmentType: experienceFields.employmentType,
  startDate: experienceFields.startDate.optional(),
  endDate: experienceFields.endDate,
  isCurrent: z.boolean().optional(),
  description: experienceFields.description,
});

const educationFields = {
  institution: z.string().trim().min(1).max(200),
  degree: z.string().trim().max(160).nullable().optional(),
  fieldOfStudy: z.string().trim().max(160).nullable().optional(),
  startDate: isoDateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
  endDate: isoDateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
  grade: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
};
export const createEducationSchema = strictObject(educationFields);
export const updateEducationSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  institution: educationFields.institution.optional(),
  degree: educationFields.degree,
  fieldOfStudy: educationFields.fieldOfStudy,
  startDate: educationFields.startDate,
  endDate: educationFields.endDate,
  grade: educationFields.grade,
  description: educationFields.description,
});

const certificationFields = {
  name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().min(1).max(200),
  credentialId: z.string().trim().max(160).nullable().optional(),
  credentialUrl: urlSchema.nullable().optional(),
  issuedAt: isoDateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
  expiresAt: isoDateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
  documentFileId: uuidSchema.nullable().optional(),
};
export const createCertificationSchema = strictObject(certificationFields);
export const updateCertificationSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  name: certificationFields.name.optional(),
  issuer: certificationFields.issuer.optional(),
  credentialId: certificationFields.credentialId,
  credentialUrl: certificationFields.credentialUrl,
  issuedAt: certificationFields.issuedAt,
  expiresAt: certificationFields.expiresAt,
  documentFileId: certificationFields.documentFileId,
});

const portfolioFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/).nullable().optional(),
  url: urlSchema.nullable().optional(),
  fileId: uuidSchema.nullable().optional(),
  position: z.number().int().min(0).max(10000).default(0),
};
export const createPortfolioSchema = strictObject(portfolioFields);
export const updatePortfolioSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  title: portfolioFields.title.optional(),
  description: portfolioFields.description,
  category: portfolioFields.category,
  url: portfolioFields.url,
  fileId: portfolioFields.fileId,
  position: z.number().int().min(0).max(10000).optional(),
});

export const createTalentSkillSchema = strictObject({
  skillId: uuidSchema,
  proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  isPrimary: z.boolean().default(false),
});
export const updateTalentSkillSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).optional(),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export const linkProfileFileSchema = strictObject({
  fileId: uuidSchema,
  field: z.enum(['PROFILE_PHOTO', 'CV']),
});

export const discoveryQuerySchema = pagePaginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  skillIds: z.union([uuidSchema, z.array(uuidSchema).max(20)]).optional(),
  seniority: z.string().trim().max(40).optional(),
  countryCode: countryCodeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  availabilityStatus: z.enum(['AVAILABLE_NOW', 'AVAILABLE_FROM_DATE', 'UNAVAILABLE']).optional(),
  workArrangement: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).optional(),
  minRate: moneyAmountSchema.optional(),
  maxRate: moneyAmountSchema.optional(),
  currency: currencySchema.optional(),
  sort: z.enum(['newest', 'experience_desc', 'rate_asc', 'rate_desc']).default('newest'),
});

export const skillSearchQuerySchema = pagePaginationSchema.extend({
  q: z.string().trim().max(160).optional(),
  category: z.string().trim().max(80).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
