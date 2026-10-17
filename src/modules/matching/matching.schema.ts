import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const jobParamsSchema = strictObject({ organisationId: uuidSchema, jobId: uuidSchema });
export const shortlistParamsSchema = strictObject({
  organisationId: uuidSchema,
  shortlistId: uuidSchema,
});
export const shortlistCandidateParamsSchema = strictObject({
  organisationId: uuidSchema,
  shortlistId: uuidSchema,
  candidateId: uuidSchema,
});
export const matchQuerySchema = pagePaginationSchema.extend({
  minimumScore: z.coerce.number().min(0).max(100).default(0),
  sort: z.enum(['score_desc', 'score_asc', 'newest']).default('score_desc'),
});
export const recomputeSchema = strictObject({
  talentProfileIds: z.array(uuidSchema).max(500).optional(),
});
export const shortlistListQuerySchema = pagePaginationSchema.extend({
  jobId: uuidSchema.optional(),
  archived: z.coerce.boolean().default(false),
});
export const createShortlistSchema = strictObject({
  jobId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
});
export const updateShortlistSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});
export const addCandidateSchema = strictObject({
  talentProfileId: uuidSchema,
  applicationId: uuidSchema.nullable().optional(),
  position: z.number().int().min(0).max(100_000).default(0),
});
export const addNoteSchema = strictObject({ body: z.string().trim().min(1).max(4000) });
export const archiveShortlistSchema = strictObject({ expectedUpdatedAt: z.coerce.date() });
