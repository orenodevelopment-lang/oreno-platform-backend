import { z } from 'zod';
import { pagePaginationSchema } from '../../common/pagination/pagination.js';
import { uuidSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';

export const organisationParamsSchema = strictObject({ organisationId: uuidSchema });
export const departmentParamsSchema = strictObject({ organisationId: uuidSchema, departmentId: uuidSchema });
export const teamParamsSchema = strictObject({ organisationId: uuidSchema, teamId: uuidSchema });
export const staffParamsSchema = strictObject({ organisationId: uuidSchema, staffAssignmentId: uuidSchema });

export const staffListQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED']).optional(),
  departmentId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  managerStaffAssignmentId: uuidSchema.optional(),
  q: z.string().trim().max(200).optional(),
});
export const updateStaffSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  employeeCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,79}$/).optional(),
  jobTitle: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']).optional(),
  workArrangement: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).optional(),
});
export const assignManagerSchema = strictObject({
  manager: z.discriminatedUnion('type', [
    strictObject({ type: z.literal('STAFF_ASSIGNMENT'), staffAssignmentId: uuidSchema }),
    strictObject({ type: z.literal('ORGANISATION_MEMBER'), membershipId: uuidSchema }),
  ]).nullable(),
  effectiveFrom: z.coerce.date(),
});
export const assignDepartmentSchema = strictObject({ departmentId: uuidSchema.nullable(), effectiveFrom: z.coerce.date() });
export const assignTeamsSchema = strictObject({ teams: z.array(strictObject({ teamId: uuidSchema, isLead: z.boolean().default(false) })).max(30), effectiveFrom: z.coerce.date() });
export const offboardSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  effectiveTo: z.coerce.date(),
  reason: z.enum(['RESIGNED', 'TERMINATED', 'CONTRACT_ENDED', 'REPLACED', 'OTHER']),
  notes: z.string().trim().min(5).max(1000),
});

const departmentFields = {
  parentId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(10000).default(0),
};
export const createDepartmentSchema = strictObject(departmentFields);
export const updateDepartmentSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  parentId: departmentFields.parentId,
  name: departmentFields.name.optional(),
  description: departmentFields.description,
  position: z.number().int().min(0).max(10000).optional(),
});

const teamFields = {
  departmentId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
};
export const createTeamSchema = strictObject(teamFields);
export const updateTeamSchema = strictObject({
  expectedUpdatedAt: z.coerce.date(),
  departmentId: teamFields.departmentId,
  name: teamFields.name.optional(),
  description: teamFields.description,
});
