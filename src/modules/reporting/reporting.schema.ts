import { z } from 'zod';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';
export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const dashboardQuerySchema = strictObject({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

