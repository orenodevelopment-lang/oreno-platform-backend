import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './export.controller.js';
export function createOrganisationExportRouter(): Router { const router = Router({ mergeParams: true }); router.get('/exports', authenticate(), asyncHandler(controller.listOrganisationExports)); router.post('/exports', authenticate(), asyncHandler(controller.createOrganisationExport)); router.get('/exports/:exportId', authenticate(), asyncHandler(controller.getOrganisationExport)); router.get('/exports/:exportId/download', authenticate(), asyncHandler(controller.downloadOrganisationExport)); return router; }
export function createAdminExportRouter(): Router { const router = Router(); router.get('/', authenticate(), asyncHandler(controller.listAdminExports)); router.post('/', authenticate(), asyncHandler(controller.createAdminExport)); router.get('/:exportId', authenticate(), asyncHandler(controller.getAdminExport)); router.get('/:exportId/download', authenticate(), asyncHandler(controller.downloadAdminExport)); return router; }

