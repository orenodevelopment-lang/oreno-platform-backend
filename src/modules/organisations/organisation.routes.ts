import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './organisation.controller.js';
import { createOrganisationHiringRouter } from '../jobs/index.js';
import { createOrganisationWorkforceRouter } from '../workforce/index.js';
import { createOrganisationPipelineRouter } from '../pipeline/index.js';
import { createOrganisationWorkRouter } from '../work/index.js';
import { createOrganisationPerformanceRouter } from '../performance/index.js';
import { createOrganisationMatchingRouter } from '../matching/index.js';
import { createOrganisationPlacementRouter } from '../placements/index.js';
import { createOrganisationCompensationRouter } from '../compensation/index.js';
import { createOrganisationExportRouter } from '../exports/index.js';
import { createOrganisationReportingRouter } from '../reporting/index.js';

export function createOrganisationRouter(): Router {
  const router = Router();

  router.get('/invitations/:token', asyncHandler(controller.previewInvitation));
  router.post('/invitations/:token/accept', authenticate(), asyncHandler(controller.acceptInvitation));

  router.use('/:organisationId', createOrganisationHiringRouter());
  router.use('/:organisationId', createOrganisationWorkforceRouter());
  router.use('/:organisationId', createOrganisationPipelineRouter());
  router.use('/:organisationId', createOrganisationWorkRouter());
  router.use('/:organisationId', createOrganisationPerformanceRouter());
  router.use('/:organisationId', createOrganisationMatchingRouter());
  router.use('/:organisationId', createOrganisationPlacementRouter());
  router.use('/:organisationId', createOrganisationCompensationRouter());
  router.use('/:organisationId', createOrganisationExportRouter());
  router.use('/:organisationId', createOrganisationReportingRouter());

  router.get('/', authenticate(), asyncHandler(controller.listMine));
  router.get('/:organisationId', authenticate(), asyncHandler(controller.getOrganisation));
  router.patch('/:organisationId', authenticate(), asyncHandler(controller.updateOrganisation));

  router.get('/:organisationId/onboarding', authenticate(), asyncHandler(controller.getOnboarding));
  router.patch('/:organisationId/onboarding', authenticate(), asyncHandler(controller.updateOnboarding));
  router.post('/:organisationId/onboarding/complete', authenticate(), asyncHandler(controller.completeOnboarding));

  router.get('/:organisationId/addresses', authenticate(), asyncHandler(controller.listAddresses));
  router.post('/:organisationId/addresses', authenticate(), asyncHandler(controller.createAddress));
  router.patch('/:organisationId/addresses/:addressId', authenticate(), asyncHandler(controller.updateAddress));
  router.delete('/:organisationId/addresses/:addressId', authenticate(), asyncHandler(controller.deleteAddress));

  router.get('/:organisationId/settings', authenticate(), asyncHandler(controller.getSettings));
  router.patch('/:organisationId/settings', authenticate(), asyncHandler(controller.updateSettings));

  router.get('/:organisationId/members', authenticate(), asyncHandler(controller.listMembers));
  router.get('/:organisationId/roles', authenticate(), asyncHandler(controller.listRoles));
  router.patch('/:organisationId/members/:membershipId/role', authenticate(), asyncHandler(controller.changeMemberRole));
  router.post('/:organisationId/members/:membershipId/suspend', authenticate(), asyncHandler(controller.suspendMember));
  router.post('/:organisationId/members/:membershipId/reactivate', authenticate(), asyncHandler(controller.reactivateMember));
  router.delete('/:organisationId/members/:membershipId', authenticate(), asyncHandler(controller.revokeMember));

  router.get('/:organisationId/invitations', authenticate(), asyncHandler(controller.listInvitations));
  router.post('/:organisationId/invitations', authenticate(), asyncHandler(controller.createInvitation));
  router.post('/:organisationId/invitations/:invitationId/revoke', authenticate(), asyncHandler(controller.revokeInvitation));
  router.post('/:organisationId/invitations/:invitationId/resend', authenticate(), asyncHandler(controller.resendInvitation));

  return router;
}
