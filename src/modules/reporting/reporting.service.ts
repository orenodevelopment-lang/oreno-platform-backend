import { UnprocessableError, NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import type { AuthContext } from '../auth/index.js';
import { assertOrganisationAccess } from '../organisations/organisation.policy.js';

function range(from?: Date, to?: Date) {
  if (from && to && from > to) throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The start date must precede the end date.');
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

export async function organisationDashboard(auth: AuthContext, organisationId: string, query: { from?: Date; to?: Date }) {
  assertOrganisationAccess(auth, organisationId, 'organisation:read');
  const prisma = getPrisma(); const createdAt = range(query.from, query.to);
  const [staffTotal, staffActive, jobsOpen, applications, tasksOpen, submittedTime, approvedTime, payroll, payments] = await Promise.all([
    prisma.staffAssignment.count({ where: { organisationId } }),
    prisma.staffAssignment.count({ where: { organisationId, status: 'ACTIVE' } }),
    prisma.job.count({ where: { organisationId, status: 'PUBLISHED' } }),
    prisma.application.groupBy({ by: ['status'], where: { organisationId, screening: { is: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: { not: null } } }, ...(createdAt ? { submittedAt: createdAt } : {}) }, _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.task.count({ where: { organisationId, status: { in: ['TO_DO', 'IN_PROGRESS', 'IN_REVIEW'] } } }),
    prisma.timeEntry.aggregate({ where: { organisationId, status: 'SUBMITTED', ...(createdAt ? { workDate: createdAt } : {}) }, _sum: { ordinaryMinutes: true, overtimeMinutes: true }, _count: { _all: true } }),
    prisma.timeEntry.aggregate({ where: { organisationId, status: 'APPROVED', ...(createdAt ? { workDate: createdAt } : {}) }, _sum: { ordinaryMinutes: true, overtimeMinutes: true }, _count: { _all: true } }),
    auth.organisationPermissions.has('compensation:read_organisation_total') || auth.platformPermissions.has('compensation:read_organisation_total') ? prisma.payrollPeriod.groupBy({ by: ['currency'], where: { organisationId, status: { in: ['APPROVED', 'LOCKED', 'PAID'] }, ...(createdAt ? { endDate: createdAt } : {}) }, _sum: { totalGross: true, totalNet: true, totalDeductions: true }, orderBy: { currency: 'asc' } }) : Promise.resolve([]),
    auth.organisationPermissions.has('payment:read') || auth.platformPermissions.has('payment:read') ? prisma.paymentRecord.groupBy({ by: ['status', 'currency'], where: { organisationId, ...(createdAt ? { createdAt } : {}) }, _sum: { amount: true }, _count: { _all: true }, orderBy: [{ currency: 'asc' }, { status: 'asc' }] }) : Promise.resolve([]),
  ]);
  return {
    period: { from: query.from ?? null, to: query.to ?? null },
    workforce: { total: staffTotal, active: staffActive }, hiring: { openJobs: jobsOpen, applications: applications.map((row) => ({ status: row.status, count: row._count._all })) },
    work: { openTasks: tasksOpen, submittedTime: { entries: submittedTime._count._all, minutes: (submittedTime._sum.ordinaryMinutes ?? 0) + (submittedTime._sum.overtimeMinutes ?? 0) }, approvedTime: { entries: approvedTime._count._all, minutes: (approvedTime._sum.ordinaryMinutes ?? 0) + (approvedTime._sum.overtimeMinutes ?? 0) } },
    payroll: payroll.map((row) => ({ currency: row.currency, gross: row._sum.totalGross?.toString() ?? '0', deductions: row._sum.totalDeductions?.toString() ?? '0', net: row._sum.totalNet?.toString() ?? '0' })),
    payments: payments.map((row) => ({ currency: row.currency, status: row.status, count: row._count._all, amount: row._sum.amount?.toString() ?? '0' })),
  };
}

export async function platformDashboard(auth: AuthContext) {
  if (!auth.platformPermissions.has('admin:read')) throw new NotFoundError(ErrorCode.NOT_FOUND, 'That resource was not found.');
  const prisma = getPrisma(); const [users, organisations, profiles, openJobs, applications, activePlacements, support, failedJobs, failedOutbox] = await Promise.all([
    prisma.user.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.organisation.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.talentProfile.groupBy({ by: ['vettingStatus'], _count: { _all: true }, orderBy: { vettingStatus: 'asc' } }),
    prisma.job.count({ where: { status: 'PUBLISHED' } }), prisma.application.count(), prisma.placement.count({ where: { status: 'ACTIVE' } }),
    prisma.supportCase.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.backgroundJobOutcome.count({ where: { status: { in: ['FAILED', 'DEAD_LETTERED'] } } }), prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
  ]);
  return { users: users.map((row) => ({ status: row.status, count: row._count._all })), organisations: organisations.map((row) => ({ status: row.status, count: row._count._all })), talents: profiles.map((row) => ({ vettingStatus: row.vettingStatus, count: row._count._all })), hiring: { openJobs, applications, activePlacements }, support: support.map((row) => ({ status: row.status, count: row._count._all })), operations: { failedJobs, failedOutbox } };
}

