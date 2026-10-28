import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate, requirePlatformPermission } from '../auth/index.js';
import * as controller from './application-screening.controller.js';

export function createAdminScreeningRouter(): Router {
  const router = Router();
  router.use(authenticate());
  router.get('/applications', requirePlatformPermission('screening:read'), asyncHandler(controller.list));
  router.get('/applications/:applicationId', requirePlatformPermission('screening:read'), asyncHandler(controller.detail));
  router.post('/applications/:applicationId/cv/download', requirePlatformPermission('screening:read'), asyncHandler(controller.cvDownload));
  router.get('/applications/:applicationId/history', requirePlatformPermission('screening:audit_read'), asyncHandler(controller.history));
  router.post('/applications/:applicationId/assign', requirePlatformPermission('screening:assign'), asyncHandler(controller.assign));
  router.post('/applications/:applicationId/cv-review', requirePlatformPermission('screening:cv_review'), asyncHandler(controller.cvReview));
  router.post('/applications/:applicationId/request-info', requirePlatformPermission('screening:cv_review'), asyncHandler(controller.requestInfo));
  router.post('/applications/:applicationId/interviews', requirePlatformPermission('screening:interview_manage'), asyncHandler(controller.scheduleInterview));
  router.patch('/interviews/:interviewId', requirePlatformPermission('screening:interview_manage'), asyncHandler(controller.updateInterview));
  router.post('/interviews/:interviewId/cancel', requirePlatformPermission('screening:interview_manage'), asyncHandler(controller.cancelInterview));
  router.post('/interviews/:interviewId/outcome', requirePlatformPermission('screening:interview_decide'), asyncHandler(controller.interviewOutcome));
  router.post('/applications/:applicationId/final-decision', requirePlatformPermission('screening:final_decide'), asyncHandler(controller.finalDecision));
  router.post('/applications/:applicationId/release', requirePlatformPermission('screening:release'), asyncHandler(controller.release));
  return router;
}

export function createTalentScreeningRouter(): Router {
  const router = Router();
  router.use(authenticate());
  router.get('/applications/:applicationId/screening', asyncHandler(controller.myScreening));
  router.post('/applications/:applicationId/screening/information', asyncHandler(controller.submitInfo));
  router.get('/screening-interviews', asyncHandler(controller.myInterviews));
  return router;
}
