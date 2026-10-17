import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requestFingerprint, requireIdempotencyKey, withIdempotency } from '../../platform/idempotency/idempotency.service.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './export.service.js';
import { adminExportParamsSchema, createExportSchema, exportListQuerySchema, exportParamsSchema, organisationParamsSchema } from './export.schema.js';

export async function createOrganisationExport(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req); const { params, body } = validate(req, { params: organisationParamsSchema, body: createExportSchema });
  const result = await withIdempotency({ scope: `POST:/api/v1/organisations/${params.organisationId}/exports`, key: requireIdempotencyKey(req), requestHash: requestFingerprint(req), userId: auth.userId, organisationId: params.organisationId }, async () => { const request = await service.createExport(auth, params.organisationId, body); return { data: { export: request }, statusCode: 202, resourceId: request.id }; });
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}
export async function listOrganisationExports(req: Request, res: Response): Promise<void> { const { params, query } = validate(req, { params: organisationParamsSchema, query: exportListQuerySchema }); const result = await service.listExports(requireAuthContext(req), params.organisationId, query); sendSuccess(res, { exports: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function getOrganisationExport(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: exportParamsSchema }); sendSuccess(res, { export: await service.getExport(requireAuthContext(req), params.organisationId, params.exportId) }); }
export async function downloadOrganisationExport(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: exportParamsSchema }); sendSuccess(res, await service.downloadExport(requireAuthContext(req), params.organisationId, params.exportId)); }
export async function createAdminExport(req: Request, res: Response): Promise<void> { const auth = requireAuthContext(req); const { body } = validate(req, { body: createExportSchema }); const result = await withIdempotency({ scope: 'POST:/api/v1/admin/exports', key: requireIdempotencyKey(req), requestHash: requestFingerprint(req), userId: auth.userId }, async () => { const request = await service.createExport(auth, undefined, body); return { data: { export: request }, statusCode: 202, resourceId: request.id }; }); res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } }); }
export async function listAdminExports(req: Request, res: Response): Promise<void> { const { query } = validate(req, { query: exportListQuerySchema }); const result = await service.listExports(requireAuthContext(req), undefined, query); sendSuccess(res, { exports: result.items }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function getAdminExport(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: adminExportParamsSchema }); sendSuccess(res, { export: await service.getExport(requireAuthContext(req), undefined, params.exportId) }); }
export async function downloadAdminExport(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: adminExportParamsSchema }); sendSuccess(res, await service.downloadExport(requireAuthContext(req), undefined, params.exportId)); }

