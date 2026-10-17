import { Router } from 'express';
import { createAuthRouter } from '../modules/auth/index.js';
import { createUserRouter } from '../modules/users/index.js';
import { createOrganisationRouter } from '../modules/organisations/index.js';
import { createPublicTalentRouter, createTalentRouter } from '../modules/talents/index.js';
import { createPublicJobRouter } from '../modules/jobs/index.js';
import { createFileRouter, createLocalStorageRouter } from '../modules/files/index.js';
import { createNotificationRouter } from '../modules/notifications/index.js';
import { createAdminVettingRouter } from '../modules/vetting/index.js';
import { createAdminReplacementRouter } from '../modules/placements/index.js';
import { createMessagingRouter } from '../modules/messaging/index.js';
import { createAdminExportRouter } from '../modules/exports/index.js';
import { createAdminReportingRouter } from '../modules/reporting/index.js';
import { createPublicRouter } from '../modules/public/index.js';
import { createAdminSupportRouter, createSupportRouter } from '../modules/support/index.js';
import { createAdminRouter } from '../modules/admin/index.js';
import { createSearchRouter } from '../modules/search/index.js';

/**
 * The versioned API surface.
 *
 * Every module router is mounted here and nowhere else, so `app.ts` stays a
 * description of cross-cutting middleware and the list of reachable modules is
 * one screen long. Adding a module is a two-line change: import it, mount it.
 */
export function createApiRouter(): Router {
  const router = Router();

  router.use('/auth', createAuthRouter());
  router.use('/users', createUserRouter());
  router.use('/organisations', createOrganisationRouter());
  router.use('/talents', createTalentRouter());
  router.use('/jobs', createPublicJobRouter());
  router.use('/public', createPublicRouter());
  router.use('/public/jobs', createPublicJobRouter());
  router.use('/public/talents', createPublicTalentRouter());
  router.use('/files', createFileRouter());
  router.use('/storage/local', createLocalStorageRouter());
  router.use('/notifications', createNotificationRouter());
  router.use('/admin/vetting', createAdminVettingRouter());
  router.use('/admin/replacements', createAdminReplacementRouter());
  router.use('/admin/exports', createAdminExportRouter());
  router.use('/admin', createAdminReportingRouter());
  router.use('/admin', createAdminRouter());
  router.use('/conversations', createMessagingRouter());
  router.use('/support', createSupportRouter());
  router.use('/search', createSearchRouter());
  router.use('/admin/support', createAdminSupportRouter());

  return router;
}
