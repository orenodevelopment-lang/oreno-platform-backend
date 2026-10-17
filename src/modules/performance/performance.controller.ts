import type { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './performance.service.js';
import {
  acknowledgementSchema,
  createMetricSchema,
  createPeriodSchema,
  createReviewSchema,
  feedbackSchema,
  metricParamsSchema,
  metricResultSchema,
  myReviewParamsSchema,
  organisationParamsSchema,
  performanceListQuerySchema,
  periodParamsSchema,
  periodTransitionSchema,
  reviewListQuerySchema,
  reviewParamsSchema,
  reviewTransitionSchema,
  selfAssessmentSchema,
  updateMetricSchema,
  updatePeriodSchema,
  updateReviewSchema,
} from './performance.schema.js';

export async function listPeriods(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: performanceListQuerySchema,
  });
  const result = await service.listPeriods(requireAuthContext(req), params.organisationId, query);
  sendSuccess(res, { periods: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function getPeriod(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: periodParamsSchema });
  sendSuccess(res, {
    period: await service.getPeriod(
      requireAuthContext(req),
      params.organisationId,
      params.periodId,
    ),
  });
}

export async function createPeriod(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createPeriodSchema,
  });
  sendCreated(res, {
    period: await service.createPeriod(requireAuthContext(req), params.organisationId, body),
  });
}

export async function updatePeriod(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: periodParamsSchema,
    body: updatePeriodSchema,
  });
  sendSuccess(res, {
    period: await service.updatePeriod(
      requireAuthContext(req),
      params.organisationId,
      params.periodId,
      body,
    ),
  });
}

export async function transitionPeriod(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: periodParamsSchema,
    body: periodTransitionSchema,
  });
  sendSuccess(res, {
    period: await service.transitionPeriod(
      requireAuthContext(req),
      params.organisationId,
      params.periodId,
      body.status,
      body.expectedUpdatedAt,
    ),
  });
}

export async function createMetric(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: periodParamsSchema,
    body: createMetricSchema,
  });
  sendCreated(res, {
    metric: await service.createMetric(
      requireAuthContext(req),
      params.organisationId,
      params.periodId,
      body,
    ),
  });
}

export async function updateMetric(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: metricParamsSchema,
    body: updateMetricSchema,
  });
  sendSuccess(res, {
    metric: await service.updateMetric(
      requireAuthContext(req),
      params.organisationId,
      params.periodId,
      params.metricId,
      body,
    ),
  });
}

export async function createReview(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createReviewSchema,
  });
  sendCreated(res, {
    review: await service.createReview(requireAuthContext(req), params.organisationId, body),
  });
}

export async function listReviews(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: reviewListQuerySchema,
  });
  const result = await service.listReviews(requireAuthContext(req), params.organisationId, query);
  sendSuccess(res, { reviews: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function getReview(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: reviewParamsSchema });
  sendSuccess(res, {
    review: await service.getReview(
      requireAuthContext(req),
      params.organisationId,
      params.reviewId,
    ),
  });
}

export async function updateReview(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: reviewParamsSchema,
    body: updateReviewSchema,
  });
  sendSuccess(res, {
    review: await service.updateReview(
      requireAuthContext(req),
      params.organisationId,
      params.reviewId,
      body,
    ),
  });
}

export async function addFeedback(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: reviewParamsSchema, body: feedbackSchema });
  sendCreated(res, {
    feedback: await service.addFeedback(
      requireAuthContext(req),
      params.organisationId,
      params.reviewId,
      body,
    ),
  });
}

export async function recordMetricResult(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: reviewParamsSchema,
    body: metricResultSchema,
  });
  sendSuccess(res, {
    result: await service.recordMetricResult(
      requireAuthContext(req),
      params.organisationId,
      params.reviewId,
      body,
    ),
  });
}

export async function transitionReview(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: reviewParamsSchema,
    body: reviewTransitionSchema,
  });
  sendSuccess(res, {
    review: await service.transitionReview(
      requireAuthContext(req),
      params.organisationId,
      params.reviewId,
      body.status,
      body.expectedUpdatedAt,
    ),
  });
}

export async function listMyReviews(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: reviewListQuerySchema });
  const result = await service.listMyReviews(requireAuthContext(req), query);
  sendSuccess(res, { reviews: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function getMyReview(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: myReviewParamsSchema });
  sendSuccess(res, {
    review: await service.getMyReview(requireAuthContext(req), params.reviewId),
  });
}

export async function submitSelfAssessment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: myReviewParamsSchema,
    body: selfAssessmentSchema,
  });
  sendSuccess(res, {
    review: await service.submitSelfAssessment(requireAuthContext(req), params.reviewId, body),
  });
}

export async function acknowledgeReview(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: myReviewParamsSchema,
    body: acknowledgementSchema,
  });
  sendSuccess(res, {
    review: await service.acknowledgeReview(requireAuthContext(req), params.reviewId, body),
  });
}
