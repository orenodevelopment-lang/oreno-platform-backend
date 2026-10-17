import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import {
  requestFingerprint,
  requireIdempotencyKey,
  withIdempotency,
} from '../../platform/idempotency/idempotency.service.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './placement.service.js';
import {
  adminReplacementParamsSchema,
  cancelReplacementSchema,
  candidateResponseSchema,
  myPlacementParamsSchema,
  organisationParamsSchema,
  placementListQuerySchema,
  placementParamsSchema,
  placementStatusSchema,
  proposeCandidatesSchema,
  replacementCandidateParamsSchema,
  replacementDecisionSchema,
  replacementListQuerySchema,
  replacementParamsSchema,
  requestReplacementSchema,
  updatePlacementSchema,
} from './placement.schema.js';

export async function listPlacements(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: placementListQuerySchema,
  });
  const result = await service.listPlacements(requireAuthContext(req), params.organisationId, query);
  sendSuccess(
    res,
    { placements: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function getPlacement(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: placementParamsSchema });
  sendSuccess(res, {
    placement: await service.getPlacement(
      requireAuthContext(req),
      params.organisationId,
      params.placementId,
    ),
  });
}

export async function updatePlacement(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: placementParamsSchema,
    body: updatePlacementSchema,
  });
  sendSuccess(res, {
    placement: await service.updatePlacement(
      requireAuthContext(req),
      params.organisationId,
      params.placementId,
      body,
    ),
  });
}

export async function transitionPlacement(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: placementParamsSchema,
    body: placementStatusSchema,
  });
  sendSuccess(res, {
    placement: await service.transitionPlacement(
      requireAuthContext(req),
      params.organisationId,
      params.placementId,
      body.status,
      body.expectedUpdatedAt,
      body.reason,
    ),
  });
}

export async function listMyPlacements(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: placementListQuerySchema });
  const result = await service.listMyPlacements(requireAuthContext(req), query);
  sendSuccess(
    res,
    { placements: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function getMyPlacement(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: myPlacementParamsSchema });
  sendSuccess(res, {
    placement: await service.getMyPlacement(requireAuthContext(req), params.placementId),
  });
}

export async function getReplacementEligibility(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: placementParamsSchema });
  sendSuccess(res, {
    eligibility: await service.getReplacementEligibility(
      requireAuthContext(req),
      params.organisationId,
      params.placementId,
    ),
  });
}

export async function requestReplacement(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: requestReplacementSchema,
  });
  const result = await withIdempotency(
    {
      scope: `POST:/api/v1/organisations/${params.organisationId}/replacements`,
      key: requireIdempotencyKey(req),
      requestHash: requestFingerprint(req),
      userId: auth.userId,
      organisationId: params.organisationId,
    },
    async () => {
      const replacement = await service.requestReplacement(auth, params.organisationId, body);
      return { data: { replacement }, statusCode: 201, resourceId: replacement.id };
    },
  );
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}

export async function listReplacements(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: replacementListQuerySchema,
  });
  const result = await service.listReplacements(
    requireAuthContext(req),
    params.organisationId,
    query,
  );
  sendSuccess(
    res,
    { replacements: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function getReplacement(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: replacementParamsSchema });
  sendSuccess(res, {
    replacement: await service.getReplacement(
      requireAuthContext(req),
      params.organisationId,
      params.replacementId,
    ),
  });
}

export async function cancelReplacement(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: replacementParamsSchema,
    body: cancelReplacementSchema,
  });
  sendSuccess(res, {
    replacement: await service.cancelReplacement(
      requireAuthContext(req),
      params.organisationId,
      params.replacementId,
      body.expectedUpdatedAt,
      body.reason,
    ),
  });
}

export async function listAdminReplacements(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: replacementListQuerySchema });
  const result = await service.listAdminReplacements(requireAuthContext(req), query);
  sendSuccess(
    res,
    { replacements: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function decideReplacement(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { params, body } = validate(req, {
    params: adminReplacementParamsSchema,
    body: replacementDecisionSchema,
  });
  const result = await withIdempotency(
    {
      scope: `POST:/api/v1/admin/replacements/${params.replacementId}/decision`,
      key: requireIdempotencyKey(req),
      requestHash: requestFingerprint(req),
      userId: auth.userId,
    },
    async () => ({
      data: {
        replacement: await service.decideReplacement(auth, params.replacementId, body),
      },
      statusCode: 200,
      resourceId: params.replacementId,
    }),
  );
  res.status(result.statusCode).json({ data: result.data, meta: { replayed: result.replayed } });
}

export async function proposeCandidates(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: adminReplacementParamsSchema,
    body: proposeCandidatesSchema,
  });
  sendSuccess(res, {
    replacement: await service.proposeCandidates(
      requireAuthContext(req),
      params.replacementId,
      body,
    ),
  });
}

export async function respondToCandidate(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: replacementCandidateParamsSchema,
    body: candidateResponseSchema,
  });
  sendSuccess(res, {
    replacement: await service.respondToCandidate(
      requireAuthContext(req),
      params.organisationId,
      params.replacementId,
      params.candidateId,
      body,
    ),
  });
}
