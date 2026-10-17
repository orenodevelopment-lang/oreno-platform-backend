import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './performance.controller.js';

export function createOrganisationPerformanceRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/performance/periods', authenticate(), asyncHandler(controller.listPeriods));
  router.post('/performance/periods', authenticate(), asyncHandler(controller.createPeriod));
  router.get('/performance/periods/:periodId', authenticate(), asyncHandler(controller.getPeriod));
  router.patch(
    '/performance/periods/:periodId',
    authenticate(),
    asyncHandler(controller.updatePeriod),
  );
  router.post(
    '/performance/periods/:periodId/status',
    authenticate(),
    asyncHandler(controller.transitionPeriod),
  );
  router.post(
    '/performance/periods/:periodId/metrics',
    authenticate(),
    asyncHandler(controller.createMetric),
  );
  router.patch(
    '/performance/periods/:periodId/metrics/:metricId',
    authenticate(),
    asyncHandler(controller.updateMetric),
  );
  router.get('/performance/reviews', authenticate(), asyncHandler(controller.listReviews));
  router.post('/performance/reviews', authenticate(), asyncHandler(controller.createReview));
  router.get(
    '/performance/reviews/:reviewId',
    authenticate(),
    asyncHandler(controller.getReview),
  );
  router.patch(
    '/performance/reviews/:reviewId',
    authenticate(),
    asyncHandler(controller.updateReview),
  );
  router.post(
    '/performance/reviews/:reviewId/feedback',
    authenticate(),
    asyncHandler(controller.addFeedback),
  );
  router.put(
    '/performance/reviews/:reviewId/results',
    authenticate(),
    asyncHandler(controller.recordMetricResult),
  );
  router.post(
    '/performance/reviews/:reviewId/status',
    authenticate(),
    asyncHandler(controller.transitionReview),
  );
  return router;
}

export function createTalentPerformanceRouter(): Router {
  const router = Router();
  router.get('/performance-reviews', authenticate(), asyncHandler(controller.listMyReviews));
  router.get(
    '/performance-reviews/:reviewId',
    authenticate(),
    asyncHandler(controller.getMyReview),
  );
  router.post(
    '/performance-reviews/:reviewId/self-assessment',
    authenticate(),
    asyncHandler(controller.submitSelfAssessment),
  );
  router.post(
    '/performance-reviews/:reviewId/respond',
    authenticate(),
    asyncHandler(controller.acknowledgeReview),
  );
  return router;
}
