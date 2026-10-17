import type { Request, Response } from 'express';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/http/response.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './workforce.service.js';
import {
  assignDepartmentSchema,
  assignManagerSchema,
  assignTeamsSchema,
  createDepartmentSchema,
  createTeamSchema,
  departmentParamsSchema,
  offboardSchema,
  organisationParamsSchema,
  staffListQuerySchema,
  staffParamsSchema,
  teamParamsSchema,
  updateDepartmentSchema,
  updateStaffSchema,
  updateTeamSchema,
} from './workforce.schema.js';

export async function listTeamMembers(req: Request, res: Response): Promise<void> {
  const { params, query } = validate(req, { params: organisationParamsSchema, query: staffListQuerySchema }); const result = await service.listTeamMembers(requireAuthContext(req), params.organisationId, query); sendSuccess(res, { teamMembers: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function getTeamMember(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: staffParamsSchema }); sendSuccess(res, { teamMember: await service.getTeamMember(requireAuthContext(req), params.organisationId, params.staffAssignmentId) });
}
export async function updateTeamMember(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: staffParamsSchema, body: updateStaffSchema }); sendSuccess(res, { teamMember: await service.updateTeamMember(requireAuthContext(req), params.organisationId, params.staffAssignmentId, body) });
}
export async function assignManager(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: staffParamsSchema, body: assignManagerSchema }); sendSuccess(res, { teamMember: await service.assignManager(requireAuthContext(req), params.organisationId, params.staffAssignmentId, body.manager, body.effectiveFrom) });
}
export async function assignDepartment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: staffParamsSchema, body: assignDepartmentSchema }); sendSuccess(res, { teamMember: await service.assignDepartment(requireAuthContext(req), params.organisationId, params.staffAssignmentId, body.departmentId, body.effectiveFrom) });
}
export async function assignTeams(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: staffParamsSchema, body: assignTeamsSchema }); sendSuccess(res, { teamMember: await service.assignTeams(requireAuthContext(req), params.organisationId, params.staffAssignmentId, body.teams, body.effectiveFrom) });
}
export async function offboard(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: staffParamsSchema, body: offboardSchema }); sendSuccess(res, { teamMember: await service.offboard(requireAuthContext(req), params.organisationId, params.staffAssignmentId, body) });
}
export async function listDepartments(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema }); sendSuccess(res, { departments: await service.listDepartments(requireAuthContext(req), params.organisationId) });
}
export async function createDepartment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationParamsSchema, body: createDepartmentSchema }); sendCreated(res, { department: await service.createDepartment(requireAuthContext(req), params.organisationId, body) });
}
export async function updateDepartment(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: departmentParamsSchema, body: updateDepartmentSchema }); sendSuccess(res, { department: await service.updateDepartment(requireAuthContext(req), params.organisationId, params.departmentId, body) });
}
export async function archiveDepartment(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: departmentParamsSchema }); await service.archiveDepartment(requireAuthContext(req), params.organisationId, params.departmentId); sendNoContent(res);
}
export async function listTeams(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: organisationParamsSchema }); sendSuccess(res, { teams: await service.listTeams(requireAuthContext(req), params.organisationId) });
}
export async function createTeam(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: organisationParamsSchema, body: createTeamSchema }); sendCreated(res, { team: await service.createTeam(requireAuthContext(req), params.organisationId, body) });
}
export async function updateTeam(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: teamParamsSchema, body: updateTeamSchema }); sendSuccess(res, { team: await service.updateTeam(requireAuthContext(req), params.organisationId, params.teamId, body) });
}
export async function archiveTeam(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: teamParamsSchema }); await service.archiveTeam(requireAuthContext(req), params.organisationId, params.teamId); sendNoContent(res);
}
export async function getMyAssignment(req: Request, res: Response): Promise<void> {
  sendSuccess(res, { assignments: await service.getMyAssignment(requireAuthContext(req)) });
}
