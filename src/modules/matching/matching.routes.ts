import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './matching.controller.js';

export function createOrganisationMatchingRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/jobs/:jobId/matches', authenticate(), asyncHandler(controller.listMatches));
  router.post(
    '/jobs/:jobId/matches/recompute',
    authenticate(),
    asyncHandler(controller.recomputeMatches),
  );
  router.get('/shortlists', authenticate(), asyncHandler(controller.listShortlists));
  router.post('/shortlists', authenticate(), asyncHandler(controller.createShortlist));
  router.get('/shortlists/:shortlistId', authenticate(), asyncHandler(controller.getShortlist));
  router.patch(
    '/shortlists/:shortlistId',
    authenticate(),
    asyncHandler(controller.updateShortlist),
  );
  router.post(
    '/shortlists/:shortlistId/archive',
    authenticate(),
    asyncHandler(controller.archiveShortlist),
  );
  router.post(
    '/shortlists/:shortlistId/candidates',
    authenticate(),
    asyncHandler(controller.addCandidate),
  );
  router.delete(
    '/shortlists/:shortlistId/candidates/:candidateId',
    authenticate(),
    asyncHandler(controller.removeCandidate),
  );
  router.post(
    '/shortlists/:shortlistId/notes',
    authenticate(),
    asyncHandler(controller.addNote),
  );
  return router;
}
