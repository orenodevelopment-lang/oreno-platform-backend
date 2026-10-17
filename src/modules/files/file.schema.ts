import { z } from 'zod';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const fileParamsSchema = strictObject({ fileId: uuidSchema });
export const localTokenQuerySchema = strictObject({ token: z.string().min(20).max(5000) });
export const initiateUploadSchema = strictObject({
  category: z.enum(['PUBLIC_ASSET', 'PROFILE_PHOTO', 'CV', 'CERTIFICATION', 'PORTFOLIO', 'MESSAGE_ATTACHMENT', 'PAYROLL_REPORT', 'EXPORT', 'ORGANISATION_LOGO', 'OTHER']),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(160),
  sizeBytes: z.number().int().min(1),
  organisationId: uuidSchema.optional(),
});
export const completeUploadSchema = strictObject({ checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional() });
