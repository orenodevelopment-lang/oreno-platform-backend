import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './placement.controller.js';

export function createOrganisationPlacementRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/placements', authenticate(), asyncHandler(controller.listPlacements));
  router.get('/placements/:placementId', authenticate(), asyncHandler(controller.getPlacement));
  router.patch(
    '/placements/:placementId',
    authenticate(),
    asyncHandler(controller.updatePlacement),
  );
  router.post(
    '/placements/:placementId/status',
    authenticate(),
    asyncHandler(controller.transitionPlacement),
  );
  router.get(
    '/placements/:placementId/replacement-eligibility',
    authenticate(),
    asyncHandler(controller.getReplacementEligibility),
  );
  router.get('/replacements', authenticate(), asyncHandler(controller.listReplacements));
  router.post('/replacements', authenticate(), asyncHandler(controller.requestReplacement));
  router.get(
    '/replacements/:replacementId',
    authenticate(),
    asyncHandler(controller.getReplacement),
  );
  router.post(
    '/replacements/:replacementId/cancel',
    authenticate(),
    asyncHandler(controller.cancelReplacement),
  );
  router.post(
    '/replacements/:replacementId/candidates/:candidateId/respond',
    authenticate(),
    asyncHandler(controller.respondToCandidate),
  );
  return router;
}

export function createTalentPlacementRouter(): Router {
  const router = Router();
  router.get('/placements', authenticate(), asyncHandler(controller.listMyPlacements));
  router.get('/placements/:placementId', authenticate(), asyncHandler(controller.getMyPlacement));
  return router;
}

export function createAdminReplacementRouter(): Router {
  const router = Router();
  router.get('/', authenticate(), asyncHandler(controller.listAdminReplacements));
  router.post(
    '/:replacementId/decision',
    authenticate(),
    asyncHandler(controller.decideReplacement),
  );
  router.post(
    '/:replacementId/candidates',
    authenticate(),
    asyncHandler(controller.proposeCandidates),
  );
  return router;
}
