import type { Request, Response } from 'express';
import { sendNoContent, sendSuccess } from '../../common/http/response.js';
import { buildCursorMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import {
  requestFingerprint,
  requireIdempotencyKey,
  withIdempotency,
} from '../../platform/idempotency/idempotency.service.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './messaging.service.js';
import {
  archiveConversationSchema,
  conversationListQuerySchema,
  conversationParamsSchema,
  createConversationSchema,
  editMessageSchema,
  messageListQuerySchema,
  messageParamsSchema,
  messageRevisionSchema,
  sendMessageSchema,
} from './messaging.schema.js';

export async function createConversation(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: createConversationSchema });
  const result = await withIdempotency(
    {
      scope: 'POST:/api/v1/conversations',
      key: requireIdempotencyKey(req),
      requestHash: requestFingerprint(req),
      userId: auth.userId,
      organisationId: body.organisationId ?? undefined,
    },
    async () => {
      const conversation = await service.createConversation(auth, body);
      return { data: { conversation }, statusCode: 201, resourceId: conversation.id };
    },
  );
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: conversationListQuerySchema });
  const result = await service.listConversations(requireAuthContext(req), query);
  sendSuccess(
    res,
    { conversations: result.items },
    { meta: { ...buildCursorMeta(query.limit, result.nextCursor) } },
  );
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: conversationParamsSchema });
  sendSuccess(res, {
    conversation: await service.getConversation(requireAuthContext(req), params.conversationId),
  });
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: conversationParamsSchema,
    query: messageListQuerySchema,
  });
  const result = await service.listMessages(
    requireAuthContext(req),
    params.conversationId,
    query,
  );
  sendSuccess(
    res,
    { messages: result.items },
    { meta: { ...buildCursorMeta(query.limit, result.nextCursor) } },
  );
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { params, body } = validate(req, {
    params: conversationParamsSchema,
    body: sendMessageSchema,
  });
  const result = await withIdempotency(
    {
      scope: `POST:/api/v1/conversations/${params.conversationId}/messages`,
      key: requireIdempotencyKey(req),
      requestHash: requestFingerprint(req),
      userId: auth.userId,
    },
    async () => {
      const message = await service.sendMessage(auth, params.conversationId, body);
      return { data: { message }, statusCode: 201, resourceId: message.id };
    },
  );
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}

export async function editMessage(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: messageParamsSchema, body: editMessageSchema });
  sendSuccess(res, {
    message: await service.editMessage(
      requireAuthContext(req),
      params.conversationId,
      params.messageId,
      body,
    ),
  });
}

export async function deleteMessage(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: messageParamsSchema,
    body: messageRevisionSchema,
  });
  await service.deleteMessage(
    requireAuthContext(req),
    params.conversationId,
    params.messageId,
    body.expectedUpdatedAt,
  );
  sendNoContent(res);
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: conversationParamsSchema });
  sendSuccess(res, {
    receipt: await service.markRead(requireAuthContext(req), params.conversationId),
  });
}

export async function archiveConversation(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: conversationParamsSchema,
    body: archiveConversationSchema,
  });
  sendSuccess(res, {
    conversation: await service.archiveConversation(
      requireAuthContext(req),
      params.conversationId,
      body.reason,
    ),
  });
}

export async function leaveConversation(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: conversationParamsSchema });
  await service.leaveConversation(requireAuthContext(req), params.conversationId);
  sendNoContent(res);
}
