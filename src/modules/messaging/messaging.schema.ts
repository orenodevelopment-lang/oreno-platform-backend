import { z } from 'zod';
import { cursorPaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const conversationParamsSchema = strictObject({ conversationId: uuidSchema });
export const messageParamsSchema = strictObject({
  conversationId: uuidSchema,
  messageId: uuidSchema,
});
export const conversationListQuerySchema = cursorPaginationSchema.extend({
  archived: z.coerce.boolean().default(false),
});
export const messageListQuerySchema = cursorPaginationSchema;
export const createConversationSchema = strictObject({
  organisationId: uuidSchema.nullable().optional(),
  type: z.enum(['DIRECT', 'GROUP']).default('DIRECT'),
  title: z.string().trim().min(2).max(200).nullable().optional(),
  memberUserIds: z.array(uuidSchema).min(1).max(100),
});
export const sendMessageSchema = strictObject({
  body: z.string().trim().min(1).max(20_000).nullable().optional(),
  fileIds: z.array(uuidSchema).max(10).default([]),
}).refine((value) => Boolean(value.body) || value.fileIds.length > 0, {
  message: 'A message needs text or at least one attachment.',
});
export const editMessageSchema = strictObject({
  body: z.string().trim().min(1).max(20_000),
  expectedUpdatedAt: z.coerce.date(),
});
export const messageRevisionSchema = strictObject({ expectedUpdatedAt: z.coerce.date() });
export const archiveConversationSchema = strictObject({
  reason: z.string().trim().min(1).max(500),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
