import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import {
  countryCodeSchema,
  currencySchema,
  emailSchema,
  moneyAmountSchema,
  phoneSchema,
  timeZoneSchema,
  uuidSchema,
} from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const jobParamsSchema = strictObject({ jobId: uuidSchema });
export const organisationJobParamsSchema = strictObject({ organisationId: uuidSchema, jobId: uuidSchema });
export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const applicationParamsSchema = strictObject({ applicationId: uuidSchema });
export const organisationApplicationParamsSchema = strictObject({ organisationId: uuidSchema, applicationId: uuidSchema });

const requirementSchema = strictObject({
  kind: z.enum(['REQUIRED_SKILL', 'PREFERRED_SKILL', 'QUALIFICATION', 'OTHER']),
  skillId: uuidSchema.nullable().optional(),
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  weight: z.number().int().min(1).max(100).default(1),
  isMandatory: z.boolean().default(false),
  minYears: z.number().int().min(0).max(80).nullable().optional(),
  position: z.number().int().min(0).max(1000).default(0),
});

const jobFields = {
  title: z.string().trim().min(3).max(200),
  category: z.string().trim().max(120).nullable().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']),
  workArrangement: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).default('REMOTE'),
  description: z.string().trim().min(20).max(20000),
  responsibilities: z.string().trim().max(10000).nullable().optional(),
  requirementsText: z.string().trim().max(10000).nullable().optional(),
  openings: z.number().int().min(1).max(1000).default(1),
  countryCode: countryCodeSchema.nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  timeZone: timeZoneSchema.nullable().optional(),
  isRemoteFriendly: z.boolean().default(true),
  rateMinAmount: moneyAmountSchema.nullable().optional(),
  rateMaxAmount: moneyAmountSchema.nullable().optional(),
  rateCurrency: currencySchema.nullable().optional(),
  rateUnit: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).nullable().optional(),
  minYearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  seniority: z.string().trim().max(40).nullable().optional(),
  hiringManagerId: uuidSchema.nullable().optional(),
  contactEmail: emailSchema.nullable().optional(),
  contactPhone: phoneSchema.nullable().optional(),
  businessLocation: z.string().trim().max(240).nullable().optional(),
  applicationDeadline: z.coerce.date().nullable().optional(),
  requirements: z.array(requirementSchema).max(100).default([]),
};
export const createJobSchema = strictObject(jobFields);
export const updateJobSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  title: jobFields.title.optional(),
  category: jobFields.category,
  employmentType: jobFields.employmentType.optional(),
  workArrangement: jobFields.workArrangement.optional(),
  description: jobFields.description.optional(),
  responsibilities: jobFields.responsibilities,
  requirementsText: jobFields.requirementsText,
  openings: jobFields.openings.optional(),
  countryCode: jobFields.countryCode,
  city: jobFields.city,
  timeZone: jobFields.timeZone,
  isRemoteFriendly: z.boolean().optional(),
  rateMinAmount: jobFields.rateMinAmount,
  rateMaxAmount: jobFields.rateMaxAmount,
  rateCurrency: jobFields.rateCurrency,
  rateUnit: jobFields.rateUnit,
  minYearsExperience: jobFields.minYearsExperience,
  seniority: jobFields.seniority,
  hiringManagerId: jobFields.hiringManagerId,
  contactEmail: jobFields.contactEmail,
  contactPhone: jobFields.contactPhone,
  businessLocation: jobFields.businessLocation,
  applicationDeadline: jobFields.applicationDeadline,
  requirements: z.array(requirementSchema).max(100).optional(),
});
export const jobCommandSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  reason: z.string().trim().max(1000).optional(),
});

export const publicJobQuerySchema = pagePaginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']).optional(),
  workArrangement: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).optional(),
  countryCode: countryCodeSchema.optional(),
  skillId: uuidSchema.optional(),
  sort: z.enum(['newest', 'deadline', 'rate_asc', 'rate_desc']).default('newest'),
});
export const organisationJobQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'FILLED', 'ARCHIVED']).optional(),
  q: z.string().trim().max(200).optional(),
});

const answerSchema = strictObject({
  questionKey: z.string().trim().min(1).max(120),
  question: z.string().trim().min(1).max(1000),
  answer: z.string().trim().min(1).max(8000),
});
const attachmentSchema = strictObject({
  fileId: uuidSchema,
  kind: z.enum(['CV', 'COVER_LETTER', 'PORTFOLIO', 'CERTIFICATION', 'OTHER']),
  label: z.string().trim().max(200).nullable().optional(),
});
export const createApplicationSchema = strictObject({
  coverLetter: z.string().trim().max(8000).nullable().optional(),
  expectedRateAmount: moneyAmountSchema.nullable().optional(),
  expectedRateCurrency: currencySchema.nullable().optional(),
  expectedRateUnit: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).nullable().optional(),
  availableFrom: z.coerce.date().nullable().optional(),
  answers: z.array(answerSchema).max(50).default([]),
  attachments: z.array(attachmentSchema).min(1).max(20),
}).superRefine((value, context) => {
  if (!value.attachments.some((attachment) => attachment.kind === 'CV')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: 'A ready CV is required.' });
  }
});
export const myApplicationsQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEWING', 'OFFER_PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']).optional(),
});
export const applicationListQuerySchema = myApplicationsQuerySchema.extend({ jobId: uuidSchema.optional() });
export const updateApplicationStatusSchema = strictObject({
  status: z.enum(['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEWING', 'OFFER_PENDING', 'ACCEPTED', 'REJECTED']),
  expectedUpdatedAt: z.coerce.date(),
  reason: z.string().trim().max(1000).optional(),
});
export const withdrawApplicationSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  reason: z.string().trim().max(1000).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type PublicJobQuery = z.infer<typeof publicJobQuerySchema>;
export type OrganisationJobQuery = z.infer<typeof organisationJobQuerySchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
