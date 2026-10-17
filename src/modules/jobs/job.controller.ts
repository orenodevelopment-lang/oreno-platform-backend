import type { Request, Response } from 'express';
import type { JobStatus } from '@prisma/client';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { sendSuccess } from '../../common/http/response.js';
import { validate } from '../../common/validation/validate.js';
import {
  requestFingerprint,
  requireIdempotencyKey,
  withIdempotency,
} from '../../platform/idempotency/idempotency.service.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './job.service.js';
import {
  applicationListQuerySchema,
  applicationParamsSchema,
  createApplicationSchema,
  createJobSchema,
  jobCommandSchema,
  jobParamsSchema,
  myApplicationsQuerySchema,
  organisationApplicationParamsSchema,
  organisationJobParamsSchema,
  organisationJobQuerySchema,
  organisationParamsSchema,
  publicJobQuerySchema,
  updateApplicationStatusSchema,
  updateJobSchema,
  withdrawApplicationSchema,
} from './job.schema.js';

export async function listPublicJobs(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: publicJobQuerySchema }); const result = await service.listPublicJobs(query); sendSuccess(res, { jobs: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function getPublicJob(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: jobParamsSchema }); sendSuccess(res, { job: await service.getPublicJob(params.jobId) });
}
export async function createJob(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req); const { params, body } = validate(req, { params: organisationParamsSchema, body: createJobSchema });
  const result = await withIdempotency({ scope: `POST:/api/v1/organisations/${params.organisationId}/jobs`, key: requireIdempotencyKey(req), requestHash: requestFingerprint(req), userId: auth.userId, organisationId: params.organisationId }, async () => { const job = await service.createJob(auth, params.organisationId, body); return { data: { job }, statusCode: 201, resourceId: job.id }; });
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}
export async function listOrganisationJobs(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, { params: organisationParamsSchema, query: organisationJobQuerySchema }); const result = await service.listOrganisationJobs(requireAuthContext(req), params.organisationId, query); sendSuccess(res, { jobs: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function getOrganisationJob(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationJobParamsSchema }); sendSuccess(res, { job: await service.getOrganisationJob(requireAuthContext(req), params.organisationId, params.jobId) });
}
export async function updateJob(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationJobParamsSchema, body: updateJobSchema }); sendSuccess(res, { job: await service.updateJob(requireAuthContext(req), params.organisationId, params.jobId, body) });
}

async function commandJob(req: Request, res: Response, status: JobStatus): Promise<void> {
  const { params, body } = validate(req, { params: organisationJobParamsSchema, body: jobCommandSchema }); sendSuccess(res, { job: await service.transitionJob(requireAuthContext(req), params.organisationId, params.jobId, status, body.expectedUpdatedAt, body.reason) });
}
export const publishJob = (req: Request, res: Response) => commandJob(req, res, 'PUBLISHED');
export const pauseJob = (req: Request, res: Response) => commandJob(req, res, 'PAUSED');
export const closeJob = (req: Request, res: Response) => commandJob(req, res, 'CLOSED');
export const fillJob = (req: Request, res: Response) => commandJob(req, res, 'FILLED');
export const archiveJob = (req: Request, res: Response) => commandJob(req, res, 'ARCHIVED');

export async function submitApplication(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req); const { params, body } = validate(req, { params: jobParamsSchema, body: createApplicationSchema });
  const result = await withIdempotency({ scope: `POST:/api/v1/jobs/${params.jobId}/applications`, key: requireIdempotencyKey(req), requestHash: requestFingerprint(req), userId: auth.userId }, async () => { const application = await service.submitApplication(auth, params.jobId, body); return { data: { application }, statusCode: 201, resourceId: application.id }; });
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}
export async function listMyApplications(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: myApplicationsQuerySchema }); const result = await service.listMyApplications(requireAuthContext(req), query); sendSuccess(res, { applications: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function withdrawApplication(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: applicationParamsSchema, body: withdrawApplicationSchema }); sendSuccess(res, { application: await service.withdrawApplication(requireAuthContext(req), params.applicationId, body.expectedUpdatedAt, body.reason) });
}
export async function listOrganisationApplications(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, { params: organisationParamsSchema, query: applicationListQuerySchema }); const result = await service.listOrganisationApplications(requireAuthContext(req), params.organisationId, query); sendSuccess(res, { applications: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function getOrganisationApplication(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationApplicationParamsSchema }); sendSuccess(res, { application: await service.getOrganisationApplication(requireAuthContext(req), params.organisationId, params.applicationId) });
}
export async function updateApplicationStatus(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationApplicationParamsSchema, body: updateApplicationStatusSchema }); sendSuccess(res, { application: await service.updateApplicationStatus(requireAuthContext(req), params.organisationId, params.applicationId, body.status, body.expectedUpdatedAt, body.reason) });
}
