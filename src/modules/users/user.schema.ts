import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { searchQuerySchema, uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const userIdParamsSchema = z.object({ userId: uuidSchema });

/**
 * Directory search. The pagination fields come from the shared schema so a
 * caller cannot smuggle in a larger page size than the platform caps at.
 */
export const userSearchQuerySchema = pagePaginationSchema.extend({
  q: searchQuerySchema.optional(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
});

export const setAvatarSchema = strictObject({
  /**
   * The id of a ready, owned `FileObject`, or `null` to remove the current
   * avatar. The service verifies ownership and readiness before linking it.
   */
  fileId: uuidSchema.nullable(),
});

export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;
export type SetAvatarInput = z.infer<typeof setAvatarSchema>;
