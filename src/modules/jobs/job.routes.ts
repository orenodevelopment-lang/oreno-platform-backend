import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './job.controller.js';

export function createPublicJobRouter(): Router {
  const router = Router();
  router.get('/', asyncHandler(controller.listPublicJobs));
  router.get('/:jobId', asyncHandler(controller.getPublicJob));
  router.post('/:jobId/applications', authenticate(), asyncHandler(controller.submitApplication));
  return router;
}

export function createOrganisationHiringRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/jobs', authenticate(), asyncHandler(controller.listOrganisationJobs));
  router.post('/jobs', authenticate(), asyncHandler(controller.createJob));
  router.get('/jobs/:jobId', authenticate(), asyncHandler(controller.getOrganisationJob));
  router.patch('/jobs/:jobId', authenticate(), asyncHandler(controller.updateJob));
  router.post('/jobs/:jobId/publish', authenticate(), asyncHandler(controller.publishJob));
  router.post('/jobs/:jobId/pause', authenticate(), asyncHandler(controller.pauseJob));
  router.post('/jobs/:jobId/close', authenticate(), asyncHandler(controller.closeJob));
  router.post('/jobs/:jobId/fill', authenticate(), asyncHandler(controller.fillJob));
  router.post('/jobs/:jobId/archive', authenticate(), asyncHandler(controller.archiveJob));
  router.get('/applications', authenticate(), asyncHandler(controller.listOrganisationApplications));
  router.get('/applications/:applicationId', authenticate(), asyncHandler(controller.getOrganisationApplication));
  router.post('/applications/:applicationId/status', authenticate(), asyncHandler(controller.updateApplicationStatus));
  return router;
}

export function createTalentApplicationRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/', authenticate(), asyncHandler(controller.listMyApplications));
  router.post('/:applicationId/withdraw', authenticate(), asyncHandler(controller.withdrawApplication));
  return router;
}
