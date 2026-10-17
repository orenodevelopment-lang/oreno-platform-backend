import type { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './vetting.service.js';
import {
  assessmentSchema,
  assignVettingSchema,
  caseParamsSchema,
  reviewVettingSchema,
  submitVettingSchema,
  vettingListQuerySchema,
  withdrawVettingSchema,
} from './vetting.schema.js';

export async function submitOwn(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: submitVettingSchema });
  sendCreated(res, {
    vettingCase: await service.submitOwnVetting(requireAuthContext(req), body.organisationId),
  });
}

export async function getOwnSummary(req: Request, res: Response): Promise<void> {
  sendSuccess(res, { vetting: await service.getOwnVettingSummary(requireAuthContext(req)) });
}

export async function withdrawOwn(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: caseParamsSchema,
    body: withdrawVettingSchema,
  });
  sendSuccess(res, {
    vettingCase: await service.withdrawOwnVetting(
      requireAuthContext(req),
      params.caseId,
      body.expectedUpdatedAt,
      body.reason,
    ),
  });
}

export async function listCases(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: vettingListQuerySchema });
  const result = await service.listCases(requireAuthContext(req), query);
  sendSuccess(
    res,
    { vettingCases: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function getCase(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: caseParamsSchema });
  sendSuccess(res, {
    vettingCase: await service.getCase(requireAuthContext(req), params.caseId),
  });
}

export async function assignCase(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: caseParamsSchema, body: assignVettingSchema });
  sendSuccess(res, {
    vettingCase: await service.assignCase(requireAuthContext(req), params.caseId, body),
  });
}

export async function recordAssessment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: caseParamsSchema, body: assessmentSchema });
  sendCreated(res, {
    assessment: await service.recordAssessment(requireAuthContext(req), params.caseId, body),
  });
}

export async function reviewCase(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: caseParamsSchema, body: reviewVettingSchema });
  sendSuccess(res, {
    vettingCase: await service.reviewCase(requireAuthContext(req), params.caseId, body),
  });
}
