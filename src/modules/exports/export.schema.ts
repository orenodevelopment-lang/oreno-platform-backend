import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const exportTypeSchema = z.enum([
  'PAYROLL_CSV',
  'STAFF_ROSTER_CSV',
  'APPLICATIONS_CSV',
  'TALENT_LIST_CSV',
  'TIME_ENTRIES_CSV',
  'AUDIT_CSV',
  'PLATFORM_ANALYTICS_CSV',
]);
export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const exportParamsSchema = strictObject({ organisationId: uuidSchema, exportId: uuidSchema });
export const adminExportParamsSchema = strictObject({ exportId: uuidSchema });
export const createExportSchema = strictObject({
  type: exportTypeSchema,
  parameters: strictObject({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    status: z.string().trim().max(80).optional(),
  }).default({}),
});
export const exportListQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['REQUESTED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED', 'DELETED']).optional(),
  type: exportTypeSchema.optional(),
});

