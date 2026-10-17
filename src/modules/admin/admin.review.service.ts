import type { ApplicationStatus, PaymentRecordStatus, PayrollPeriodStatus, PlacementStatus, Prisma } from '@prisma/client';
import { NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import type { AuthContext } from '../auth/index.js';

const page = (query: { page: number; pageSize: number }) => ({ skip: (query.page - 1) * query.pageSize, take: query.pageSize });
function requireAny(auth: AuthContext, permissions: string[]): void {
  if (!permissions.some((permission) => auth.platformPermissions.has(permission))) throw new NotFoundError(ErrorCode.NOT_FOUND, 'That resource was not found.');
}

export async function getUser(auth: AuthContext, id: string) {
  requireAny(auth, ['admin:read', 'admin:manage_user']);
  const user = await getPrisma().user.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, lastName: true, displayName: true, phone: true, locale: true, timeZone: true, countryCode: true, jobTitle: true, status: true, registrationIntent: true, emailVerifiedAt: true, lastLoginAt: true, suspendedAt: true, suspendedReason: true, deactivatedAt: true, createdAt: true, updatedAt: true, memberships: { select: { id: true, organisationId: true, status: true, role: { select: { key: true, name: true } } } }, platformRoleAssignments: { where: { revokedAt: null }, select: { role: { select: { key: true, name: true } }, grantedAt: true } } } });
  if (!user) throw new NotFoundError(ErrorCode.ADMIN_TARGET_NOT_FOUND, 'That user was not found.');
  return user;
}

export async function getOrganisation(auth: AuthContext, id: string) {
  requireAny(auth, ['admin:read', 'admin:manage_organisation']);
  const organisation = await getPrisma().organisation.findUnique({ where: { id }, include: { addresses: true, settings: true, onboarding: true, _count: { select: { memberships: true, jobs: true, applications: true, placements: true, staffAssignments: true } } } });
  if (!organisation) throw new NotFoundError(ErrorCode.ADMIN_TARGET_NOT_FOUND, 'That organisation was not found.');
  return organisation;
}

export async function applications(auth: AuthContext, query: { page: number; pageSize: number; organisationId?: string; status?: ApplicationStatus }) {
  requireAny(auth, ['application:read', 'admin:manage_organisation']);
  const where: Prisma.ApplicationWhereInput = { ...(query.organisationId ? { organisationId: query.organisationId } : {}), ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    getPrisma().application.findMany({ where, select: { id: true, organisationId: true, jobId: true, talentProfileId: true, status: true, source: true, submittedAt: true, reviewedAt: true, decidedAt: true, job: { select: { title: true, reference: true } }, organisation: { select: { name: true, slug: true } }, talentProfile: { select: { headline: true, user: { select: { firstName: true, lastName: true, displayName: true, email: true } } } } }, orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }], ...page(query) }),
    getPrisma().application.count({ where }),
  ]);
  return { items, total };
}

export async function placements(auth: AuthContext, query: { page: number; pageSize: number; organisationId?: string; status?: PlacementStatus }) {
  requireAny(auth, ['placement:read', 'admin:manage_organisation']);
  const where: Prisma.PlacementWhereInput = { ...(query.organisationId ? { organisationId: query.organisationId } : {}), ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    getPrisma().placement.findMany({ where, select: { id: true, organisationId: true, jobId: true, talentProfileId: true, status: true, reference: true, title: true, startDate: true, endDate: true, replacementEligibleUntil: true, endedAt: true, endReason: true, organisation: { select: { name: true, slug: true } }, talentProfile: { select: { user: { select: { firstName: true, lastName: true, displayName: true, email: true } } } }, staffAssignment: { select: { id: true, employeeCode: true, status: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...page(query) }),
    getPrisma().placement.count({ where }),
  ]);
  return { items, total };
}

export async function payroll(auth: AuthContext, query: { page: number; pageSize: number; organisationId?: string; status?: PayrollPeriodStatus }) {
  requireAny(auth, ['payroll:read', 'compensation:read_organisation_total']);
  const where: Prisma.PayrollPeriodWhereInput = { ...(query.organisationId ? { organisationId: query.organisationId } : {}), ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    getPrisma().payrollPeriod.findMany({ where, include: { organisation: { select: { name: true, slug: true } }, _count: { select: { lineItems: true, paymentRecords: true } } }, orderBy: [{ startDate: 'desc' }, { id: 'asc' }], ...page(query) }),
    getPrisma().payrollPeriod.count({ where }),
  ]);
  return { items, total };
}

export async function payments(auth: AuthContext, query: { page: number; pageSize: number; organisationId?: string; status?: PaymentRecordStatus }) {
  requireAny(auth, ['payment:read', 'compensation:read_organisation_total']);
  const where: Prisma.PaymentRecordWhereInput = { ...(query.organisationId ? { organisationId: query.organisationId } : {}), ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    getPrisma().paymentRecord.findMany({ where, include: { organisation: { select: { name: true, slug: true } }, talentProfile: { select: { user: { select: { firstName: true, lastName: true, displayName: true, email: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...page(query) }),
    getPrisma().paymentRecord.count({ where }),
  ]);
  return { items, total };
}
