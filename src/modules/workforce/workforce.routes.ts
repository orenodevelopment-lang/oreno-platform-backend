import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './workforce.controller.js';

export function createOrganisationWorkforceRouter(): Router {
  const router = Router({ mergeParams: true });
  router.get('/team-members', authenticate(), asyncHandler(controller.listTeamMembers));
  router.get('/team-members/:staffAssignmentId', authenticate(), asyncHandler(controller.getTeamMember));
  router.patch('/team-members/:staffAssignmentId', authenticate(), asyncHandler(controller.updateTeamMember));
  router.post('/team-members/:staffAssignmentId/manager', authenticate(), asyncHandler(controller.assignManager));
  router.post('/team-members/:staffAssignmentId/department', authenticate(), asyncHandler(controller.assignDepartment));
  router.post('/team-members/:staffAssignmentId/teams', authenticate(), asyncHandler(controller.assignTeams));
  router.post('/team-members/:staffAssignmentId/offboard', authenticate(), asyncHandler(controller.offboard));
  router.get('/departments', authenticate(), asyncHandler(controller.listDepartments));
  router.post('/departments', authenticate(), asyncHandler(controller.createDepartment));
  router.patch('/departments/:departmentId', authenticate(), asyncHandler(controller.updateDepartment));
  router.delete('/departments/:departmentId', authenticate(), asyncHandler(controller.archiveDepartment));
  router.get('/teams', authenticate(), asyncHandler(controller.listTeams));
  router.post('/teams', authenticate(), asyncHandler(controller.createTeam));
  router.patch('/teams/:teamId', authenticate(), asyncHandler(controller.updateTeam));
  router.delete('/teams/:teamId', authenticate(), asyncHandler(controller.archiveTeam));
  return router;
}

export function createMyWorkforceRouter(): Router {
  const router = Router();
  router.get('/assignments', authenticate(), asyncHandler(controller.getMyAssignment));
  return router;
}
