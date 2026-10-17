import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './pipeline.controller.js';

export function createOrganisationPipelineRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/interviews', authenticate(), asyncHandler(controller.listInterviews));
  router.post('/interviews', authenticate(), asyncHandler(controller.createInterview));
  router.patch('/interviews/:interviewId', authenticate(), asyncHandler(controller.updateInterview));
  router.post('/interviews/:interviewId/cancel', authenticate(), asyncHandler(controller.cancelInterview));
  router.post('/interviews/:interviewId/outcome', authenticate(), asyncHandler(controller.recordOutcome));
  router.get('/offers', authenticate(), asyncHandler(controller.listOffers));
  router.post('/offers', authenticate(), asyncHandler(controller.createOffer));
  router.patch('/offers/:offerId', authenticate(), asyncHandler(controller.updateOffer));
  router.post('/offers/:offerId/send', authenticate(), asyncHandler(controller.sendOffer));
  router.post('/offers/:offerId/withdraw', authenticate(), asyncHandler(controller.withdrawOffer));
  return router;
}

export function createTalentPipelineRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/interviews', authenticate(), asyncHandler(controller.listMyInterviews));
  router.get('/offers', authenticate(), asyncHandler(controller.listMyOffers));
  router.post('/offers/:offerId/respond', authenticate(), asyncHandler(controller.respondToOffer));
  return router;
}
