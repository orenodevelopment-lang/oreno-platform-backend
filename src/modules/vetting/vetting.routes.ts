import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './vetting.controller.js';

export function createTalentVettingRouter(): Router {
  const router = Router();
  router.get('/vetting', authenticate(), asyncHandler(controller.getOwnSummary));
  router.post('/vetting', authenticate(), asyncHandler(controller.submitOwn));
  router.post(
    '/vetting/:caseId/withdraw',
    authenticate(),
    asyncHandler(controller.withdrawOwn),
  );
  return router;
}

export function createAdminVettingRouter(): Router {
  const router = Router();
  router.get('/', authenticate(), asyncHandler(controller.listCases));
  router.get('/:caseId', authenticate(), asyncHandler(controller.getCase));
  router.post('/:caseId/assign', authenticate(), asyncHandler(controller.assignCase));
  router.post(
    '/:caseId/assessments',
    authenticate(),
    asyncHandler(controller.recordAssessment),
  );
  router.post('/:caseId/review', authenticate(), asyncHandler(controller.reviewCase));
  return router;
}
