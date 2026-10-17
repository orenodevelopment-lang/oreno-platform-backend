import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './messaging.controller.js';

export function createMessagingRouter(): Router {
  const router = Router();
  router.get('/', authenticate(), asyncHandler(controller.listConversations));
  router.post('/', authenticate(), asyncHandler(controller.createConversation));
  router.get('/:conversationId', authenticate(), asyncHandler(controller.getConversation));
  router.post(
    '/:conversationId/archive',
    authenticate(),
    asyncHandler(controller.archiveConversation),
  );
  router.post('/:conversationId/leave', authenticate(), asyncHandler(controller.leaveConversation));
  router.get('/:conversationId/messages', authenticate(), asyncHandler(controller.listMessages));
  router.post('/:conversationId/messages', authenticate(), asyncHandler(controller.sendMessage));
  router.patch(
    '/:conversationId/messages/:messageId',
    authenticate(),
    asyncHandler(controller.editMessage),
  );
  router.delete(
    '/:conversationId/messages/:messageId',
    authenticate(),
    asyncHandler(controller.deleteMessage),
  );
  router.post('/:conversationId/read', authenticate(), asyncHandler(controller.markRead));
  return router;
}
