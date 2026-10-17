import type { Request, Response } from 'express';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { sendCreated, sendSuccess } from '../../common/http/response.js';
import { validate } from '../../common/validation/validate.js';
import { requestFingerprint, requireIdempotencyKey, withIdempotency } from '../../platform/idempotency/idempotency.service.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './pipeline.service.js';
import {
  cancelInterviewSchema,
  createInterviewSchema,
  createOfferSchema,
  interviewListQuerySchema,
  interviewOutcomeSchema,
  interviewParamsSchema,
  offerCommandSchema,
  offerListQuerySchema,
  offerParamsSchema,
  offerResponseSchema,
  organisationParamsSchema,
  talentOfferParamsSchema,
  updateInterviewSchema,
  updateOfferSchema,
} from './pipeline.schema.js';

export async function createInterview(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: organisationParamsSchema, body: createInterviewSchema }); sendCreated(res, { interview: await service.createInterview(requireAuthContext(req), params.organisationId, body) }); }
export async function listInterviews(req: Request, res: Response): Promise<void> { const { params, query } = validate(req, { params: organisationParamsSchema, query: interviewListQuerySchema }); const result = await service.listInterviews(requireAuthContext(req), params.organisationId, query); sendSuccess(res, { interviews: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function updateInterview(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: interviewParamsSchema, body: updateInterviewSchema }); sendSuccess(res, { interview: await service.updateInterview(requireAuthContext(req), params.organisationId, params.interviewId, body) }); }
export async function cancelInterview(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: interviewParamsSchema, body: cancelInterviewSchema }); sendSuccess(res, { interview: await service.cancelInterview(requireAuthContext(req), params.organisationId, params.interviewId, body.expectedUpdatedAt, body.reason) }); }
export async function recordOutcome(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: interviewParamsSchema, body: interviewOutcomeSchema }); sendSuccess(res, { interview: await service.recordOutcome(requireAuthContext(req), params.organisationId, params.interviewId, body) }); }
export async function listMyInterviews(req: Request, res: Response): Promise<void> { const { query } = validate(req, { query: interviewListQuerySchema.pick({ page: true, pageSize: true }) }); const result = await service.listMyInterviews(requireAuthContext(req), query); sendSuccess(res, { interviews: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }

export async function createOffer(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: organisationParamsSchema, body: createOfferSchema }); sendCreated(res, { offer: await service.createOffer(requireAuthContext(req), params.organisationId, body) }); }
export async function updateOffer(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: offerParamsSchema, body: updateOfferSchema }); sendSuccess(res, { offer: await service.updateOffer(requireAuthContext(req), params.organisationId, params.offerId, body) }); }
export async function listOffers(req: Request, res: Response): Promise<void> { const { params, query } = validate(req, { params: organisationParamsSchema, query: offerListQuerySchema }); const result = await service.listOffers(requireAuthContext(req), params.organisationId, query); sendSuccess(res, { offers: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function sendOffer(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: offerParamsSchema, body: offerCommandSchema }); sendSuccess(res, { offer: await service.sendOffer(requireAuthContext(req), params.organisationId, params.offerId, body.expectedUpdatedAt) }); }
export async function withdrawOffer(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: offerParamsSchema, body: offerCommandSchema }); sendSuccess(res, { offer: await service.withdrawOffer(requireAuthContext(req), params.organisationId, params.offerId, body.expectedUpdatedAt, body.reason) }); }
export async function listMyOffers(req: Request, res: Response): Promise<void> { const { query } = validate(req, { query: offerListQuerySchema }); const result = await service.listMyOffers(requireAuthContext(req), query); sendSuccess(res, { offers: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function respondToOffer(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req); const { params, body } = validate(req, { params: talentOfferParamsSchema, body: offerResponseSchema });
  const result = await withIdempotency({ scope: `POST:/api/v1/talents/me/offers/${params.offerId}/respond`, key: requireIdempotencyKey(req), requestHash: requestFingerprint(req), userId: auth.userId }, async () => { const response = await service.respondToOffer(auth, params.offerId, body.response, body.declineReason); return { data: response, statusCode: 200, resourceId: response.placement?.id }; });
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}
