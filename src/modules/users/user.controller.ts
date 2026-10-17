import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http/response.js';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './user.service.js';
import { setAvatarSchema, userIdParamsSchema, userSearchQuerySchema } from './user.schema.js';

export async function getProfile(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { params } = validate(req, { params: userIdParamsSchema });
  sendSuccess(res, { user: await service.getProfile(auth, params.userId) });
}

export async function searchUsers(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { query } = validate(req, { query: userSearchQuerySchema });
  const { items, total } = await service.search(auth, query);

  sendSuccess(res, { users: items }, { meta: { ...buildPageMeta(query, total) } });
}

export async function setAvatar(req: Request, res: Response): Promise<void> {
  const auth = requireAuthContext(req);
  const { body } = validate(req, { body: setAvatarSchema });
  sendSuccess(res, { user: await service.setAvatar(auth, body.fileId) });
}
