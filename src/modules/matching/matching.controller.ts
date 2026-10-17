import type { Request, Response } from 'express';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './matching.service.js';
import {
  addCandidateSchema,
  addNoteSchema,
  archiveShortlistSchema,
  createShortlistSchema,
  jobParamsSchema,
  matchQuerySchema,
  organisationParamsSchema,
  recomputeSchema,
  shortlistCandidateParamsSchema,
  shortlistListQuerySchema,
  shortlistParamsSchema,
  updateShortlistSchema,
} from './matching.schema.js';

export async function recomputeMatches(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: jobParamsSchema, body: recomputeSchema });
  sendSuccess(res, {
    matching: await service.recomputeMatches(
      requireAuthContext(req),
      params.organisationId,
      params.jobId,
      body.talentProfileIds,
    ),
  });
}

export async function listMatches(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, { params: jobParamsSchema, query: matchQuerySchema });
  const result = await service.listMatches(
    requireAuthContext(req),
    params.organisationId,
    params.jobId,
    query,
  );
  sendSuccess(res, { matches: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function listShortlists(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, {
    params: organisationParamsSchema,
    query: shortlistListQuerySchema,
  });
  const result = await service.listShortlists(
    requireAuthContext(req),
    params.organisationId,
    query,
  );
  sendSuccess(
    res,
    { shortlists: result.items },
    { meta: { ...buildPageMeta(query, result.total) } },
  );
}

export async function getShortlist(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: shortlistParamsSchema });
  sendSuccess(res, {
    shortlist: await service.getShortlist(
      requireAuthContext(req),
      params.organisationId,
      params.shortlistId,
    ),
  });
}

export async function createShortlist(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: organisationParamsSchema,
    body: createShortlistSchema,
  });
  sendCreated(res, {
    shortlist: await service.createShortlist(
      requireAuthContext(req),
      params.organisationId,
      body,
    ),
  });
}

export async function updateShortlist(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: shortlistParamsSchema,
    body: updateShortlistSchema,
  });
  sendSuccess(res, {
    shortlist: await service.updateShortlist(
      requireAuthContext(req),
      params.organisationId,
      params.shortlistId,
      body,
    ),
  });
}

export async function archiveShortlist(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: shortlistParamsSchema,
    body: archiveShortlistSchema,
  });
  await service.archiveShortlist(
    requireAuthContext(req),
    params.organisationId,
    params.shortlistId,
    body.expectedUpdatedAt,
  );
  sendNoContent(res);
}

export async function addCandidate(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, {
    params: shortlistParamsSchema,
    body: addCandidateSchema,
  });
  sendCreated(res, {
    candidate: await service.addCandidate(
      requireAuthContext(req),
      params.organisationId,
      params.shortlistId,
      body,
    ),
  });
}

export async function removeCandidate(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: shortlistCandidateParamsSchema });
  await service.removeCandidate(
    requireAuthContext(req),
    params.organisationId,
    params.shortlistId,
    params.candidateId,
  );
  sendNoContent(res);
}

export async function addNote(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: shortlistParamsSchema, body: addNoteSchema });
  sendCreated(res, {
    note: await service.addNote(
      requireAuthContext(req),
      params.organisationId,
      params.shortlistId,
      body.body,
    ),
  });
}
