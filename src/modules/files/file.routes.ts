import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { uploadRateLimit } from '../../common/middleware/rate-limit.js';
import { authenticate } from '../auth/index.js';
import * as controller from './file.controller.js';

export function createFileRouter(): Router {
  const router = Router();
  router.post('/uploads', authenticate(), uploadRateLimit(), asyncHandler(controller.initiateUpload));
  router.post('/:fileId/complete', authenticate(), uploadRateLimit(), asyncHandler(controller.completeUpload));
  router.get('/:fileId', authenticate(), asyncHandler(controller.getFile));
  router.post('/:fileId/download', authenticate(), asyncHandler(controller.downloadFile));
  router.delete('/:fileId', authenticate(), asyncHandler(controller.archiveFile));
  return router;
}

export function createLocalStorageRouter(): Router {
  const router = Router();
  router.put('/upload', asyncHandler(controller.localUpload));
  router.get('/download', asyncHandler(controller.localDownload));
  return router;
}
