import { Router } from 'express'; import { asyncHandler } from '../../common/http/async-handler.js'; import { authenticate } from '../auth/index.js'; import * as controller from './reporting.controller.js';
export function createOrganisationReportingRouter(): Router { const router = Router({ mergeParams: true }); router.get('/dashboard', authenticate(), asyncHandler(controller.organisationDashboard)); return router; }
export function createAdminReportingRouter(): Router { const router = Router(); router.get('/dashboard', authenticate(), asyncHandler(controller.platformDashboard)); return router; }

