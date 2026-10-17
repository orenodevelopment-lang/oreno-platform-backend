import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const caseParamsSchema = strictObject({ caseId: uuidSchema });
export const vettingListQuerySchema = pagePaginationSchema.extend({
  status: z
    .enum([
      'OPEN',
      'ASSIGNED',
      'IN_REVIEW',
      'ADDITIONAL_INFO_REQUIRED',
      'APPROVED',
      'REJECTED',
      'WITHDRAWN',
    ])
    .optional(),
  assignedToId: uuidSchema.optional(),
});
export const submitVettingSchema = strictObject({
  organisationId: uuidSchema.nullable().optional(),
});
export const withdrawVettingSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  reason: z.string().trim().min(1).max(2000),
});
export const assignVettingSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  reviewerId: uuidSchema,
  slaDueAt: z.coerce.date().nullable().optional(),
});
export const reviewVettingSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_INFO', 'ESCALATE']),
  internalNotes: z.string().trim().max(4000).nullable().optional(),
  candidateVisibleNotes: z.string().trim().max(2000).nullable().optional(),
});
export const assessmentSchema = strictObject({
  assessmentKey: z.string().trim().regex(/^[a-z][a-z0-9_.-]{1,119}$/),
  label: z.string().trim().min(2).max(200),
  score: z.string().regex(/^-?\d{1,8}(?:\.\d{1,4})?$/).nullable().optional(),
  maxScore: z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/).nullable().optional(),
  passed: z.boolean().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  evidenceUrl: z.string().url().max(2048).nullable().optional(),
});
