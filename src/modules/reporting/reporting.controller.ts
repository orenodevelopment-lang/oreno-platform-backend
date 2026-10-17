import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http/response.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import { dashboardQuerySchema, organisationParamsSchema } from './reporting.schema.js';
import * as service from './reporting.service.js';
export async function organisationDashboard(req: Request, res: Response): Promise<void> { const { params, query } = validate(req, { params: organisationParamsSchema, query: dashboardQuerySchema }); sendSuccess(res, { dashboard: await service.organisationDashboard(requireAuthContext(req), params.organisationId, query) }); }
export async function platformDashboard(req: Request, res: Response): Promise<void> { sendSuccess(res, { dashboard: await service.platformDashboard(requireAuthContext(req)) }); }

