import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { currencySchema, moneyAmountSchema, timeZoneSchema, urlSchema, uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const interviewParamsSchema = strictObject({ organisationId: uuidSchema, interviewId: uuidSchema });
export const offerParamsSchema = strictObject({ organisationId: uuidSchema, offerId: uuidSchema });
export const talentOfferParamsSchema = strictObject({ offerId: uuidSchema });

const participantSchema = strictObject({
  userId: uuidSchema.nullable().optional(),
  role: z.string().trim().min(1).max(40).default('INTERVIEWER'),
  isRequired: z.boolean().default(true),
});
export const createInterviewSchema = strictObject({
  applicationId: uuidSchema,
  stage: z.string().trim().min(1).max(120),
  stageOrder: z.number().int().min(1).max(100).default(1),
  mode: z.enum(['VIDEO', 'PHONE', 'ONSITE']).default('VIDEO'),
  scheduledStartAt: z.coerce.date(),
  scheduledEndAt: z.coerce.date(),
  timeZone: timeZoneSchema,
  meetingUrl: urlSchema.nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  participants: z.array(participantSchema).max(30).default([]),
});
export const updateInterviewSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  stage: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(['VIDEO', 'PHONE', 'ONSITE']).optional(),
  scheduledStartAt: z.coerce.date().optional(),
  scheduledEndAt: z.coerce.date().optional(),
  timeZone: timeZoneSchema.optional(),
  meetingUrl: urlSchema.nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
});
export const cancelInterviewSchema = strictObject({ expectedUpdatedAt: z.coerce.date(), reason: z.string().trim().min(5).max(1000) });
export const interviewOutcomeSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  result: z.enum(['PASSED', 'FAILED', 'ON_HOLD', 'WITHDRAWN']),
  summary: z.string().trim().max(4000).nullable().optional(),
});
export const interviewListQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED']).optional(),
  applicationId: uuidSchema.optional(),
});

const offerTermSchema = strictObject({
  key: z.string().trim().regex(/^[a-z0-9_]{2,80}$/),
  label: z.string().trim().min(1).max(200),
  valueText: z.string().trim().max(1000).nullable().optional(),
  valueAmount: moneyAmountSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  rateUnit: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).nullable().optional(),
  position: z.number().int().min(0).max(1000).default(0),
});
export const createOfferSchema = strictObject({
  applicationId: uuidSchema,
  title: z.string().trim().min(2).max(200),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']),
  workArrangement: z.enum(['ONSITE', 'REMOTE', 'HYBRID']),
  startDate: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  terms: z.array(offerTermSchema).min(1).max(50),
});
export const updateOfferSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  title: z.string().trim().min(2).max(200).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']).optional(),
  workArrangement: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).optional(),
  startDate: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  terms: z.array(offerTermSchema).min(1).max(50).optional(),
});
export const offerCommandSchema = strictObject({ expectedUpdatedAt: z.coerce.date(), reason: z.string().trim().max(1000).optional() });
export const offerResponseSchema = strictObject({ response: z.enum(['ACCEPT', 'DECLINE']), declineReason: z.string().trim().max(2000).optional() });
export const offerListQuerySchema = pagePaginationSchema.extend({ status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN']).optional() });

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
