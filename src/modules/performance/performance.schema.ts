import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

const decimalSchema = z.string().regex(/^-?\d{1,8}(?:\.\d{1,4})?$/);
const jsonRecordSchema = z.record(z.string(), z.unknown());

export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const periodParamsSchema = strictObject({
  organisationId: uuidSchema,
  periodId: uuidSchema,
});
export const metricParamsSchema = strictObject({
  organisationId: uuidSchema,
  periodId: uuidSchema,
  metricId: uuidSchema,
});
export const reviewParamsSchema = strictObject({
  organisationId: uuidSchema,
  reviewId: uuidSchema,
});
export const myReviewParamsSchema = strictObject({ reviewId: uuidSchema });

export const performanceListQuerySchema = pagePaginationSchema.extend({
  status: z
    .enum(['DRAFT', 'OPEN', 'IN_REVIEW', 'CLOSED', 'ARCHIVED'])
    .optional(),
});
export const reviewListQuerySchema = pagePaginationSchema.extend({
  status: z
    .enum([
      'DRAFT',
      'SELF_ASSESSMENT',
      'MANAGER_REVIEW',
      'CALIBRATION',
      'FINALISED',
      'ACKNOWLEDGED',
      'DISPUTED',
      'CORRECTED',
    ])
    .optional(),
  performancePeriodId: uuidSchema.optional(),
  staffAssignmentId: uuidSchema.optional(),
});
export const createPeriodSchema = strictObject({
  name: z.string().trim().min(2).max(160),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export const updatePeriodSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  name: z.string().trim().min(2).max(160).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export const periodTransitionSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  status: z.enum(['OPEN', 'IN_REVIEW', 'CLOSED', 'ARCHIVED']),
});
export const createMetricSchema = strictObject({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,79}$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  kind: z.enum(['NUMERIC', 'PERCENTAGE', 'RATING', 'BOOLEAN']),
  formula: jsonRecordSchema.refine((value) => typeof value.type === 'string', {
    message: 'A metric formula must declare a string type.',
  }),
  minValue: decimalSchema.nullable().optional(),
  maxValue: decimalSchema.nullable().optional(),
  weight: z.string().regex(/^\d{1,2}(?:\.\d{1,4})?$/).default('1'),
  position: z.number().int().min(0).max(10_000).default(0),
});
export const updateMetricSchema = createMetricSchema.partial().extend({
  expectedUpdatedAt: z.coerce.date(),
});
export const createReviewSchema = strictObject({
  performancePeriodId: uuidSchema,
  staffAssignmentId: uuidSchema,
});
export const updateReviewSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  summary: z.string().trim().max(8000).nullable().optional(),
});
export const reviewTransitionSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  status: z.enum(['MANAGER_REVIEW', 'CALIBRATION', 'FINALISED']),
});
export const feedbackSchema = strictObject({
  body: z.string().trim().min(1).max(8000),
  kind: z.enum(['MANAGER', 'PEER']).default('MANAGER'),
  isVisibleToTalent: z.boolean().default(true),
});
export const selfAssessmentSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  body: z.string().trim().min(1).max(8000),
});
export const metricResultSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  metricDefinitionId: uuidSchema,
  value: decimalSchema,
  evidence: jsonRecordSchema,
});
export const acknowledgementSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  action: z.enum(['ACKNOWLEDGE', 'DISPUTE']),
  reason: z.string().trim().min(1).max(2000).optional(),
});
