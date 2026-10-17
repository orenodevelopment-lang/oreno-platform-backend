import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { recordAudit } from '../../platform/audit/audit.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import { assertOrganisationAccess, assertOrganisationMutation } from '../organisations/organisation.policy.js';

function slug(name: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 145) || 'item';
  return `${base}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function managerScope(auth: AuthContext, organisationId: string): Prisma.StaffAssignmentWhereInput {
  if (auth.organisationPermissions.has('workforce:manage_assignment')) return {};
  if (auth.organisationRole !== 'MANAGER') return {};
  const managerRelations: Prisma.StaffAssignmentWhereInput[] = [];
  if (auth.membershipId) managerRelations.push({ managerAssignments: { some: { effectiveTo: null, managerMembershipId: auth.membershipId } } });
  managerRelations.push({ managerAssignments: { some: { effectiveTo: null, managerStaffAssignment: { organisationId, talentProfile: { userId: auth.userId } } } } });
  if (auth.scopedDepartmentIds.length) managerRelations.push({ departmentId: { in: [...auth.scopedDepartmentIds] } });
  return { OR: managerRelations };
}

const STAFF_INCLUDE = {
  placement: { select: { id: true, reference: true, status: true, startDate: true, endDate: true } },
  talentProfile: { select: { id: true, headline: true, user: { select: { firstName: true, lastName: true, displayName: true, avatarFileId: true } } } },
  department: { select: { id: true, name: true } },
  managerAssignments: {
    where: { effectiveTo: null },
    take: 1,
    include: {
      managerStaffAssignment: { select: { id: true, talentProfile: { select: { user: { select: { firstName: true, lastName: true, displayName: true } } } } } },
      managerMembership: { select: { id: true, user: { select: { firstName: true, lastName: true, displayName: true } } } },
    },
  },
  teamAssignments: { where: { effectiveTo: null }, include: { team: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.StaffAssignmentInclude;

type StaffRecord = Prisma.StaffAssignmentGetPayload<{ include: typeof STAFF_INCLUDE }>;
function displayName(user: { firstName: string; lastName: string; displayName: string | null }): string {
  return user.displayName ?? `${user.firstName} ${user.lastName}`;
}
function toView(record: StaffRecord) {
  const manager = record.managerAssignments[0];
  const managerView = manager?.managerStaffAssignment
    ? { type: 'STAFF_ASSIGNMENT' as const, staffAssignmentId: manager.managerStaffAssignment.id, name: displayName(manager.managerStaffAssignment.talentProfile.user) }
    : manager?.managerMembership
      ? { type: 'ORGANISATION_MEMBER' as const, membershipId: manager.managerMembership.id, name: displayName(manager.managerMembership.user) }
      : null;
  return {
    id: record.id,
    placementId: record.placementId,
    talentProfileId: record.talentProfileId,
    organisationId: record.organisationId,
    employeeCode: record.employeeCode,
    displayName: displayName(record.talentProfile.user),
    avatarFileId: record.talentProfile.user.avatarFileId,
    professionalHeadline: record.talentProfile.headline,
    employmentTitle: record.jobTitle,
    department: record.department,
    manager: managerView,
    teams: record.teamAssignments.map((item) => ({ id: item.team.id, name: item.team.name, isLead: item.isLead })),
    startDate: record.effectiveFrom,
    endDate: record.effectiveTo,
    engagement: record.employmentType,
    workArrangement: record.workArrangement,
    status: record.status,
    updatedAt: record.updatedAt,
    placement: record.placement,
  };
}

export async function listTeamMembers(auth: AuthContext, organisationId: string, query: { page: number; pageSize: number; status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ENDED'; departmentId?: string; teamId?: string; managerStaffAssignmentId?: string; q?: string }) {
  assertOrganisationAccess(auth, organisationId, 'workforce:read');
  const where: Prisma.StaffAssignmentWhereInput = {
    organisationId,
    ...managerScope(auth, organisationId),
    ...(query.status ? { status: query.status } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.teamId ? { teamAssignments: { some: { teamId: query.teamId, effectiveTo: null } } } : {}),
    ...(query.managerStaffAssignmentId ? { managerAssignments: { some: { managerStaffAssignmentId: query.managerStaffAssignmentId, effectiveTo: null } } } : {}),
    ...(query.q ? { OR: [{ employeeCode: { contains: query.q, mode: 'insensitive' } }, { jobTitle: { contains: query.q, mode: 'insensitive' } }, { talentProfile: { user: { OR: [{ firstName: { contains: query.q, mode: 'insensitive' } }, { lastName: { contains: query.q, mode: 'insensitive' } }] } } }] } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.staffAssignment.findMany({ where, include: STAFF_INCLUDE, orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.staffAssignment.count({ where }),
  ]);
  return { items: items.map(toView), total };
}

export async function getTeamMember(auth: AuthContext, organisationId: string, staffAssignmentId: string) {
  assertOrganisationAccess(auth, organisationId, 'workforce:read');
  const record = await getPrisma().staffAssignment.findFirst({ where: { id: staffAssignmentId, organisationId, ...managerScope(auth, organisationId) }, include: STAFF_INCLUDE });
  if (!record) throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That team member was not found.');
  return toView(record);
}

export async function updateTeamMember(auth: AuthContext, organisationId: string, staffAssignmentId: string, input: { expectedUpdatedAt: Date } & Prisma.StaffAssignmentUpdateManyMutationInput) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_assignment');
  const { expectedUpdatedAt, employeeCode, ...data } = input;
  const code = typeof employeeCode === 'string' ? employeeCode.trim().toUpperCase() : employeeCode;
  try {
    const changed = await getPrisma().staffAssignment.updateMany({ where: { id: staffAssignmentId, organisationId, updatedAt: expectedUpdatedAt }, data: { ...data, ...(code !== undefined ? { employeeCode: code } : {}) } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The team member changed. Refresh and try again.');
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ConflictError(ErrorCode.CONFLICT, 'That employee code is already in use.');
    throw error;
  }
  return getTeamMember(auth, organisationId, staffAssignmentId);
}

export async function assignManager(auth: AuthContext, organisationId: string, staffAssignmentId: string, manager: { type: 'STAFF_ASSIGNMENT'; staffAssignmentId: string } | { type: 'ORGANISATION_MEMBER'; membershipId: string } | null, effectiveFrom: Date) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_assignment');
  const subject = await getPrisma().staffAssignment.findFirst({ where: { id: staffAssignmentId, organisationId }, select: { id: true } });
  if (!subject) throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That team member was not found.');
  if (manager?.type === 'STAFF_ASSIGNMENT') {
    if (manager.staffAssignmentId === staffAssignmentId) throw new UnprocessableError(ErrorCode.CONFLICT, 'A team member cannot manage themselves.');
    const exists = await getPrisma().staffAssignment.count({ where: { id: manager.staffAssignmentId, organisationId, status: 'ACTIVE' } });
    if (!exists) throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That manager was not found.');
  } else if (manager) {
    const exists = await getPrisma().organisationMembership.count({ where: { id: manager.membershipId, organisationId, status: 'ACTIVE', role: { key: { in: ['COMPANY_OWNER', 'HR_USER', 'MANAGER'] } } } });
    if (!exists) throw new NotFoundError(ErrorCode.MEMBERSHIP_NOT_FOUND, 'That manager was not found.');
  }
  await getPrisma().$transaction(async (tx) => {
    await tx.managerAssignment.updateMany({ where: { staffAssignmentId, effectiveTo: null }, data: { effectiveTo: effectiveFrom } });
    if (manager) await tx.managerAssignment.create({ data: { staffAssignmentId, effectiveFrom, ...(manager.type === 'STAFF_ASSIGNMENT' ? { managerStaffAssignmentId: manager.staffAssignmentId } : { managerMembershipId: manager.membershipId }) } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.STAFF_ASSIGNMENT_STARTED, aggregateType: 'StaffAssignment', aggregateId: staffAssignmentId, organisationId, payload: { staffAssignmentId, organisationId } });
  });
  return getTeamMember(auth, organisationId, staffAssignmentId);
}

export async function assignDepartment(auth: AuthContext, organisationId: string, staffAssignmentId: string, departmentId: string | null, effectiveFrom: Date) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_assignment');
  if (departmentId) {
    const exists = await getPrisma().department.count({ where: { id: departmentId, organisationId, archivedAt: null } });
    if (!exists) throw new NotFoundError(ErrorCode.DEPARTMENT_NOT_FOUND, 'That department was not found.');
  }
  await getPrisma().$transaction(async (tx) => {
    const staff = await tx.staffAssignment.findFirst({ where: { id: staffAssignmentId, organisationId }, select: { id: true } });
    if (!staff) throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That team member was not found.');
    await tx.departmentAssignment.updateMany({ where: { staffAssignmentId, effectiveTo: null }, data: { effectiveTo: effectiveFrom } });
    if (departmentId) await tx.departmentAssignment.create({ data: { staffAssignmentId, departmentId, effectiveFrom } });
    await tx.staffAssignment.update({ where: { id: staffAssignmentId }, data: { departmentId } });
  });
  return getTeamMember(auth, organisationId, staffAssignmentId);
}

export async function assignTeams(auth: AuthContext, organisationId: string, staffAssignmentId: string, teams: Array<{ teamId: string; isLead: boolean }>, effectiveFrom: Date) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_assignment');
  const teamIds = [...new Set(teams.map((team) => team.teamId))];
  const count = await getPrisma().team.count({ where: { id: { in: teamIds }, organisationId, archivedAt: null } });
  if (count !== teamIds.length) throw new NotFoundError(ErrorCode.TEAM_NOT_FOUND, 'One or more teams were not found.');
  await getPrisma().$transaction(async (tx) => {
    const staff = await tx.staffAssignment.count({ where: { id: staffAssignmentId, organisationId } });
    if (!staff) throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That team member was not found.');
    await tx.teamAssignment.updateMany({ where: { staffAssignmentId, effectiveTo: null }, data: { effectiveTo: effectiveFrom } });
    if (teams.length) await tx.teamAssignment.createMany({ data: teams.map((team) => ({ ...team, staffAssignmentId, effectiveFrom })) });
  });
  return getTeamMember(auth, organisationId, staffAssignmentId);
}

export async function offboard(auth: AuthContext, organisationId: string, staffAssignmentId: string, input: { expectedUpdatedAt: Date; effectiveTo: Date; reason: 'RESIGNED' | 'TERMINATED' | 'CONTRACT_ENDED' | 'REPLACED' | 'OTHER'; notes: string }) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_assignment');
  await getPrisma().$transaction(async (tx) => {
    const current = await tx.staffAssignment.findFirst({ where: { id: staffAssignmentId, organisationId }, include: { placement: true } });
    if (!current) throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That team member was not found.');
    if (current.status === 'ENDED') throw new UnprocessableError(ErrorCode.STAFF_ASSIGNMENT_ENDED, 'That assignment has already ended.');
    const changed = await tx.staffAssignment.updateMany({ where: { id: staffAssignmentId, organisationId, updatedAt: input.expectedUpdatedAt }, data: { status: 'ENDED', effectiveTo: input.effectiveTo, endReason: input.reason, endNotes: input.notes } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The team member changed. Refresh and try again.');
    await Promise.all([
      tx.managerAssignment.updateMany({ where: { staffAssignmentId, effectiveTo: null }, data: { effectiveTo: input.effectiveTo } }),
      tx.departmentAssignment.updateMany({ where: { staffAssignmentId, effectiveTo: null }, data: { effectiveTo: input.effectiveTo } }),
      tx.teamAssignment.updateMany({ where: { staffAssignmentId, effectiveTo: null }, data: { effectiveTo: input.effectiveTo } }),
    ]);
    await tx.placement.update({ where: { id: current.placementId }, data: { status: 'ENDED', endDate: input.effectiveTo, endedAt: new Date(), endReason: input.notes } });
    await tx.placementStatusHistory.create({ data: { placementId: current.placementId, fromStatus: current.placement.status, toStatus: 'ENDED', changedById: auth.userId, reason: input.notes } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.STAFF_ASSIGNMENT_ENDED, aggregateType: 'StaffAssignment', aggregateId: staffAssignmentId, organisationId, payload: { staffAssignmentId, placementId: current.placementId, organisationId } });
    await recordAudit({ action: 'STATUS_CHANGE', resourceType: 'StaffAssignment', resourceId: staffAssignmentId, organisationId, actorId: auth.userId, summary: 'Staff assignment ended', reason: input.notes }, tx);
  });
  return getTeamMember(auth, organisationId, staffAssignmentId);
}

export async function listDepartments(auth: AuthContext, organisationId: string) {
  assertOrganisationAccess(auth, organisationId, 'workforce:read');
  return getPrisma().department.findMany({ where: { organisationId, archivedAt: null }, include: { _count: { select: { staffAssignments: true, teams: true, children: true } } }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
}
export async function createDepartment(auth: AuthContext, organisationId: string, input: { parentId?: string | null; name: string; description?: string | null; position: number }) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_department');
  if (input.parentId) { const parent = await getPrisma().department.count({ where: { id: input.parentId, organisationId, archivedAt: null } }); if (!parent) throw new NotFoundError(ErrorCode.DEPARTMENT_NOT_FOUND, 'The parent department was not found.'); }
  return getPrisma().department.create({ data: { ...input, organisationId, slug: slug(input.name) } });
}
export async function updateDepartment(auth: AuthContext, organisationId: string, departmentId: string, input: { expectedUpdatedAt: Date; parentId?: string | null; name?: string; description?: string | null; position?: number }) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_department'); const { expectedUpdatedAt, parentId, ...data } = input;
  if (parentId === departmentId) throw new UnprocessableError(ErrorCode.DEPARTMENT_CYCLE_DETECTED, 'A department cannot be its own parent.');
  if (parentId) { const descendants = await getPrisma().department.findMany({ where: { organisationId, parentId: departmentId }, select: { id: true } }); if (descendants.some((item) => item.id === parentId)) throw new UnprocessableError(ErrorCode.DEPARTMENT_CYCLE_DETECTED, 'That parent would create a cycle.'); }
  const changed = await getPrisma().department.updateMany({ where: { id: departmentId, organisationId, updatedAt: expectedUpdatedAt }, data: { ...data, ...(parentId !== undefined ? { parentId } : {}) } }); if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The department changed. Refresh and try again.'); return getPrisma().department.findUniqueOrThrow({ where: { id: departmentId } });
}
export async function archiveDepartment(auth: AuthContext, organisationId: string, departmentId: string) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_department'); const active = await getPrisma().staffAssignment.count({ where: { organisationId, departmentId, status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] } } }); if (active) throw new ConflictError(ErrorCode.DEPARTMENT_NOT_EMPTY, 'Move active team members before archiving this department.'); return getPrisma().department.updateMany({ where: { id: departmentId, organisationId, archivedAt: null }, data: { archivedAt: new Date() } });
}

export async function listTeams(auth: AuthContext, organisationId: string) {
  assertOrganisationAccess(auth, organisationId, 'workforce:read'); return getPrisma().team.findMany({ where: { organisationId, archivedAt: null }, include: { department: { select: { id: true, name: true } }, _count: { select: { members: true } } }, orderBy: { name: 'asc' } });
}
export async function createTeam(auth: AuthContext, organisationId: string, input: { departmentId?: string | null; name: string; description?: string | null }) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_team'); if (input.departmentId) { const department = await getPrisma().department.count({ where: { id: input.departmentId, organisationId, archivedAt: null } }); if (!department) throw new NotFoundError(ErrorCode.DEPARTMENT_NOT_FOUND, 'That department was not found.'); } return getPrisma().team.create({ data: { ...input, organisationId, slug: slug(input.name) } });
}
export async function updateTeam(auth: AuthContext, organisationId: string, teamId: string, input: { expectedUpdatedAt: Date; departmentId?: string | null; name?: string; description?: string | null }) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_team'); const { expectedUpdatedAt, ...data } = input; if (data.departmentId) { const department = await getPrisma().department.count({ where: { id: data.departmentId, organisationId, archivedAt: null } }); if (!department) throw new NotFoundError(ErrorCode.DEPARTMENT_NOT_FOUND, 'That department was not found.'); } const changed = await getPrisma().team.updateMany({ where: { id: teamId, organisationId, updatedAt: expectedUpdatedAt }, data }); if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The team changed. Refresh and try again.'); return getPrisma().team.findUniqueOrThrow({ where: { id: teamId } });
}
export async function archiveTeam(auth: AuthContext, organisationId: string, teamId: string) {
  assertOrganisationMutation(auth, organisationId, 'workforce:manage_team'); const result = await getPrisma().team.updateMany({ where: { id: teamId, organisationId, archivedAt: null }, data: { archivedAt: new Date() } }); if (!result.count) throw new NotFoundError(ErrorCode.TEAM_NOT_FOUND, 'That team was not found.'); return result;
}

export async function getMyAssignment(auth: AuthContext) {
  const records = await getPrisma().staffAssignment.findMany({ where: { talentProfile: { userId: auth.userId }, status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] } }, include: STAFF_INCLUDE, orderBy: { effectiveFrom: 'desc' } }); return records.map(toView);
}
