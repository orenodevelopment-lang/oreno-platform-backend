import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const placementParamsSchema = strictObject({
  organisationId: uuidSchema,
  placementId: uuidSchema,
});
export const myPlacementParamsSchema = strictObject({ placementId: uuidSchema });
export const replacementParamsSchema = strictObject({
  organisationId: uuidSchema,
  replacementId: uuidSchema,
});
export const adminReplacementParamsSchema = strictObject({ replacementId: uuidSchema });
export const replacementCandidateParamsSchema = strictObject({
  organisationId: uuidSchema,
  replacementId: uuidSchema,
  candidateId: uuidSchema,
});
export const placementListQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED', 'REPLACED', 'CANCELLED']).optional(),
});
export const replacementListQuerySchema = pagePaginationSchema.extend({
  status: z
    .enum([
      'REQUESTED',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANDIDATES_PROPOSED',
      'RESOLVED',
      'CANCELLED',
    ])
    .optional(),
});
export const updatePlacementSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  title: z.string().trim().min(2).max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
});
export const placementStatusSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ENDED']),
  reason: z.string().trim().max(1000).optional(),
});
export const requestReplacementSchema = strictObject({
  placementId: uuidSchema,
  reason: z.string().trim().min(10).max(2000),
  reasonCategory: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
});
export const cancelReplacementSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  reason: z.string().trim().min(1).max(2000),
});
export const replacementDecisionSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_INFO']),
  reason: z.string().trim().min(1).max(2000),
});
export const proposeCandidatesSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  candidates: z
    .array(
      strictObject({
        talentProfileId: uuidSchema,
        notes: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});
export const candidateResponseSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  accepted: z.boolean(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
