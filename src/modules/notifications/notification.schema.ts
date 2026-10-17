import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const notificationParamsSchema = strictObject({ notificationId: uuidSchema });
export const notificationQuerySchema = pagePaginationSchema.extend({ unreadOnly: z.coerce.boolean().default(false) });
export const preferenceSchema = strictObject({ eventKey: z.string().trim().min(2).max(120), enabled: z.boolean() });
