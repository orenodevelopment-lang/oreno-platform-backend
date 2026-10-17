import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './user.controller.js';

/**
 * `/api/v1/users`
 *
 * The directory and per-user profile reads. Platform-wide user administration
 * (suspension, locking, session revocation) lives under `/api/v1/admin` and is
 * deliberately not reachable from here.
 */
export function createUserRouter(): Router {
  const router = Router();

  router.get('/', authenticate(), asyncHandler(controller.searchUsers));
  // Registered before `/:userId` so the literal path is never read as an id.
  router.put('/me/avatar', authenticate(), asyncHandler(controller.setAvatar));
  router.get('/:userId', authenticate(), asyncHandler(controller.getProfile));

  return router;
}
