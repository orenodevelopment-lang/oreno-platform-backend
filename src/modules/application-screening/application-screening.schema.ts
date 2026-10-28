import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { timeZoneSchema, uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const screeningApplicationParamsSchema = strictObject({ applicationId: uuidSchema });
export const screeningInterviewParamsSchema = strictObject({ interviewId: uuidSchema });

export const screeningQueueQuerySchema = pagePaginationSchema.extend({
  status: z.enum([
    'PENDING_CV_REVIEW', 'CV_REVIEW_IN_PROGRESS', 'ADDITIONAL_INFO_REQUIRED', 'CV_APPROVED',
    'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'FINAL_REVIEW_PENDING',
    'APPROVED_FOR_SUBMISSION', 'RELEASED_TO_COMPANY', 'NOT_SELECTED', 'WITHDRAWN', 'CANCELLED',
  ]).optional(),
  assignedReviewerId: uuidSchema.optional(),
  organisationId: uuidSchema.optional(),
  jobId: uuidSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  submittedFrom: z.coerce.date().optional(),
  submittedTo: z.coerce.date().optional(),
});

const optimisticFields = {
  expectedUpdatedAt: z.coerce.date(),
  reason: z.string().trim().min(3).max(2000),
};

export const assignScreeningSchema = strictObject({
  ...optimisticFields,
  reviewerId: uuidSchema,
  dueAt: z.coerce.date().nullable().optional(),
});

export const cvReviewSchema = strictObject({
  ...optimisticFields,
  decision: z.enum(['APPROVED', 'NOT_SELECTED', 'REQUEST_INFORMATION']),
  rubric: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  privateNotes: z.string().trim().max(8000).nullable().optional(),
  candidateVisibleFeedback: z.string().trim().max(2000).nullable().optional(),
  employerSafeSummary: z.string().trim().max(4000).nullable().optional(),
});

export const requestInformationSchema = strictObject({
  ...optimisticFields,
  message: z.string().trim().min(3).max(2000),
});

export const submitInformationSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  responseText: z.string().trim().max(4000).nullable().optional(),
  responseFileId: uuidSchema.nullable().optional(),
});

export const scheduleScreeningInterviewSchema = strictObject({
  ...optimisticFields,
  interviewerId: uuidSchema,
  mode: z.enum(['VIDEO', 'PHONE', 'ONSITE']),
  scheduledStartAt: z.coerce.date(),
  scheduledEndAt: z.coerce.date(),
  timeZone: timeZoneSchema,
  meetingUrl: z.string().url().max(2048).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
});

export const updateScreeningInterviewSchema = strictObject({
  ...optimisticFields,
  scheduledStartAt: z.coerce.date().optional(),
  scheduledEndAt: z.coerce.date().optional(),
  timeZone: timeZoneSchema.optional(),
  meetingUrl: z.string().url().max(2048).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
});

export const screeningInterviewOutcomeSchema = strictObject({
  ...optimisticFields,
  outcome: z.enum(['PASSED', 'FAILED', 'ON_HOLD', 'NEEDS_FOLLOWUP']),
  rubric: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  privateNotes: z.string().trim().max(8000).nullable().optional(),
  candidateVisibleFeedback: z.string().trim().max(2000).nullable().optional(),
});

export const finalScreeningDecisionSchema = strictObject({
  ...optimisticFields,
  decision: z.enum(['APPROVED', 'NOT_SELECTED', 'ON_HOLD']),
  candidateMessage: z.string().trim().max(2000).nullable().optional(),
  employerSummary: z.string().trim().max(4000).nullable().optional(),
});

export const releaseScreeningSchema = strictObject({
  ...optimisticFields,
  organisationId: uuidSchema,
  confirmation: z.literal(true),
});

export type ScreeningQueueQuery = z.infer<typeof screeningQueueQuerySchema>;
export type AssignScreeningInput = z.infer<typeof assignScreeningSchema>;
export type CvReviewInput = z.infer<typeof cvReviewSchema>;
export type ScheduleScreeningInterviewInput = z.infer<typeof scheduleScreeningInterviewSchema>;
export type UpdateScreeningInterviewInput = z.infer<typeof updateScreeningInterviewSchema>;
export type ScreeningInterviewOutcomeInput = z.infer<typeof screeningInterviewOutcomeSchema>;
export type FinalScreeningDecisionInput = z.infer<typeof finalScreeningDecisionSchema>;
export type ReleaseScreeningInput = z.infer<typeof releaseScreeningSchema>;
