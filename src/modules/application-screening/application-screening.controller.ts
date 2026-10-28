import type { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import { createDownload } from '../files/file.service.js';
import * as service from './application-screening.service.js';
import {
  assignScreeningSchema, cvReviewSchema, finalScreeningDecisionSchema, releaseScreeningSchema,
  requestInformationSchema, scheduleScreeningInterviewSchema, screeningApplicationParamsSchema,
  screeningInterviewOutcomeSchema, screeningInterviewParamsSchema, screeningQueueQuerySchema,
  submitInformationSchema, updateScreeningInterviewSchema,
} from './application-screening.schema.js';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { requestFingerprint, requireIdempotencyKey, withIdempotency } from '../../platform/idempotency/idempotency.service.js';

export async function list(req: Request, res: Response) { const { query } = validate(req, { query: screeningQueueQuerySchema }); const result = await service.listScreenings(requireAuthContext(req), query); sendSuccess(res, { items: result.items, counts: result.counts }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function detail(req: Request, res: Response) { const { params } = validate(req, { params: screeningApplicationParamsSchema }); sendSuccess(res, { screening: await service.getScreening(requireAuthContext(req), params.applicationId) }); }
export async function assign(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningApplicationParamsSchema, body: assignScreeningSchema }); sendSuccess(res, { screening: await service.assignScreening(requireAuthContext(req), params.applicationId, body) }); }
export async function cvReview(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningApplicationParamsSchema, body: cvReviewSchema }); sendSuccess(res, { screening: await service.recordCvReview(requireAuthContext(req), params.applicationId, body) }); }
export async function requestInfo(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningApplicationParamsSchema, body: requestInformationSchema }); sendSuccess(res, { screening: await service.requestInformation(requireAuthContext(req), params.applicationId, body) }); }
export async function scheduleInterview(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningApplicationParamsSchema, body: scheduleScreeningInterviewSchema }); sendCreated(res, { screening: await service.scheduleInterview(requireAuthContext(req), params.applicationId, body) }); }
export async function updateInterview(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningInterviewParamsSchema, body: updateScreeningInterviewSchema }); sendSuccess(res, { interview: await service.updateInterview(requireAuthContext(req), params.interviewId, body) }); }
export async function cancelInterview(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningInterviewParamsSchema, body: requestInformationSchema.pick({ expectedUpdatedAt: true, reason: true }) }); sendSuccess(res, { interview: await service.cancelInterview(requireAuthContext(req), params.interviewId, body) }); }
export async function interviewOutcome(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningInterviewParamsSchema, body: screeningInterviewOutcomeSchema }); sendSuccess(res, { screening: await service.recordInterviewOutcome(requireAuthContext(req), params.interviewId, body) }); }
export async function finalDecision(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningApplicationParamsSchema, body: finalScreeningDecisionSchema }); sendSuccess(res, { screening: await service.finalDecision(requireAuthContext(req), params.applicationId, body) }); }
export async function release(req: Request, res: Response) {
  const auth = requireAuthContext(req); const { params, body } = validate(req, { params: screeningApplicationParamsSchema, body: releaseScreeningSchema });
  const result = await withIdempotency({ scope: `POST:/api/v1/admin/screening/applications/${params.applicationId}/release`, key: requireIdempotencyKey(req), requestHash: requestFingerprint(req), userId: auth.userId, organisationId: body.organisationId }, async () => {
    const screening = await service.releaseToCompany(auth, params.applicationId, body);
    return { data: { screening }, statusCode: 200, resourceId: screening.id };
  });
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}
export async function history(req: Request, res: Response) { const { params } = validate(req, { params: screeningApplicationParamsSchema }); sendSuccess(res, { history: await service.getHistory(requireAuthContext(req), params.applicationId) }); }
export async function myScreening(req: Request, res: Response) { const { params } = validate(req, { params: screeningApplicationParamsSchema }); sendSuccess(res, { screening: await service.getMyScreening(requireAuthContext(req), params.applicationId) }); }
export async function myInterviews(req: Request, res: Response) { const { query } = validate(req, { query: pagePaginationSchema }); const result = await service.listMyScreeningInterviews(requireAuthContext(req), query); sendSuccess(res, result.items, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function submitInfo(req: Request, res: Response) { const { params, body } = validate(req, { params: screeningApplicationParamsSchema, body: submitInformationSchema }); sendSuccess(res, { screening: await service.submitRequestedInformation(requireAuthContext(req), params.applicationId, body) }); }
export async function cvDownload(req: Request, res: Response) { const auth = requireAuthContext(req); const { params } = validate(req, { params: screeningApplicationParamsSchema }); const screening = await service.getScreening(auth, params.applicationId); await service.recordSensitiveCvAccess(auth, params.applicationId); sendSuccess(res, await createDownload(auth, screening.currentCvFileId)); }
