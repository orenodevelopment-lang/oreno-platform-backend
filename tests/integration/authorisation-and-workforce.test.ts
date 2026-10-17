import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import { listTeamMembers, getTeamMember, offboard } from '../../src/modules/workforce/workforce.service.js';
import { reviewCase } from '../../src/modules/vetting/vetting.service.js';
import { listOrganisationTime, listTasks } from '../../src/modules/work/work.service.js';
import { listPeriods } from '../../src/modules/performance/performance.service.js';
import {
  listAgreements,
  listPayments,
  listPayroll,
} from '../../src/modules/compensation/compensation.service.js';
import {
  authContext,
  createStaffFixture,
  createTestOrganisation,
  createTestUser,
  ensureOrganisationRole,
  suffix,
} from '../helpers/factories.js';

describe('tenant and workforce acceptance boundaries', () => {
  it('limits a manager to assigned staff and rejects a foreign-tenant id', async () => {
    const prisma = getPrisma();
    const owner = await createTestUser('owner');
    const manager = await createTestUser('manager');
    const organisation = await createTestOrganisation('manager-scope');
    const otherOrganisation = await createTestOrganisation('foreign-scope');
    const managerRole = await ensureOrganisationRole('MANAGER');
    const membership = await prisma.organisationMembership.create({
      data: {
        organisationId: organisation.id,
        userId: manager.id,
        roleId: managerRole.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    const assigned = await createStaffFixture({ organisationId: organisation.id, creatorId: owner.id });
    const unassigned = await createStaffFixture({ organisationId: organisation.id, creatorId: owner.id });
    const foreign = await createStaffFixture({ organisationId: otherOrganisation.id, creatorId: owner.id });

    await prisma.managerAssignment.create({
      data: {
        staffAssignmentId: assigned.staffAssignment.id,
        managerMembershipId: membership.id,
        effectiveFrom: new Date(),
      },
    });
    const managerAuth = authContext(manager.id, {
      organisationId: organisation.id,
      membershipId: membership.id,
      membershipStatus: 'ACTIVE',
      organisationRole: 'MANAGER',
      organisationPermissions: new Set(['workforce:read']),
    });

    const result = await listTeamMembers(managerAuth, organisation.id, { page: 1, pageSize: 20 });
    expect(result.items.map((item) => item.id)).toEqual([assigned.staffAssignment.id]);
    expect(result.items.map((item) => item.id)).not.toContain(unassigned.staffAssignment.id);

    await expect(
      getTeamMember(managerAuth, otherOrganisation.id, foreign.staffAssignment.id),
    ).rejects.toMatchObject({
      code: ErrorCode.ORGANISATION_NOT_FOUND,
      status: 404,
    });
  });

  it('enforces employee-code uniqueness per organisation while allowing reuse elsewhere', async () => {
    const creator = await createTestUser('code-owner');
    const organisation = await createTestOrganisation('code-a');
    const otherOrganisation = await createTestOrganisation('code-b');
    const employeeCode = `SHARED-${suffix()}`;

    await createStaffFixture({ organisationId: organisation.id, creatorId: creator.id, employeeCode });
    await createStaffFixture({ organisationId: otherOrganisation.id, creatorId: creator.id, employeeCode });
    await expect(
      createStaffFixture({ organisationId: organisation.id, creatorId: creator.id, employeeCode }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects cross-tenant task, time, performance, compensation, payroll, and payment reads', async () => {
    const user = await createTestUser('tenant-reader');
    const ownOrganisation = await createTestOrganisation('tenant-own');
    const foreignOrganisation = await createTestOrganisation('tenant-foreign');
    const auth = authContext(user.id, {
      organisationId: ownOrganisation.id,
      membershipStatus: 'ACTIVE',
      organisationPermissions: new Set([
        'task:read',
        'time:read',
        'performance:read',
        'compensation:read',
        'payroll:read',
        'payment:read',
      ]),
    });

    const attempts = await Promise.allSettled([
      listTasks(auth, foreignOrganisation.id, { page: 1, pageSize: 10 }),
      listOrganisationTime(auth, foreignOrganisation.id, { page: 1, pageSize: 10 }),
      listPeriods(auth, foreignOrganisation.id, { page: 1, pageSize: 10 }),
      listAgreements(auth, foreignOrganisation.id, { page: 1, pageSize: 10 }),
      listPayroll(auth, foreignOrganisation.id, { page: 1, pageSize: 10 }),
      listPayments(auth, foreignOrganisation.id, { page: 1, pageSize: 10 }),
    ]);
    expect(attempts).toHaveLength(6);
    for (const attempt of attempts) {
      expect(attempt.status).toBe('rejected');
      if (attempt.status === 'rejected') {
        expect(attempt.reason).toMatchObject({
          code: ErrorCode.ORGANISATION_NOT_FOUND,
          status: 404,
        });
      }
    }
  });

  it('offboards through an effective-dated transition and preserves operational history', async () => {
    const prisma = getPrisma();
    const owner = await createTestUser('offboard-owner');
    const organisation = await createTestOrganisation('offboard');
    const staff = await createStaffFixture({ organisationId: organisation.id, creatorId: owner.id });
    const task = await prisma.task.create({
      data: {
        organisationId: organisation.id,
        title: 'Historical task',
        createdById: owner.id,
        assignees: { create: { talentProfileId: staff.profile.id, assignedById: owner.id } },
      },
    });
    const timeEntry = await prisma.timeEntry.create({
      data: {
        organisationId: organisation.id,
        staffAssignmentId: staff.staffAssignment.id,
        talentProfileId: staff.profile.id,
        workDate: new Date(),
        ordinaryMinutes: 480,
        description: 'Work retained after offboarding.',
      },
    });
    const payAgreement = await prisma.payAgreement.create({
      data: {
        organisationId: organisation.id,
        staffAssignmentId: staff.staffAssignment.id,
        talentProfileId: staff.profile.id,
        status: 'ACTIVE',
        basis: 'MONTHLY',
        rateAmount: '5000',
        currency: 'USD',
        ordinaryHoursPerPeriod: '160',
        effectiveFrom: new Date(Date.now() - 86_400_000),
        createdById: owner.id,
      },
    });
    const payrollPeriod = await prisma.payrollPeriod.create({
      data: {
        organisationId: organisation.id,
        name: 'Historical payroll',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        status: 'LOCKED',
        currency: 'USD',
        totalGross: '5000',
        totalNet: '5000',
        calculationVersion: 'integration-v1',
        calculatedAt: new Date(),
        lockedAt: new Date(),
        lockedById: owner.id,
      },
    });
    const payrollLine = await prisma.payrollLineItem.create({
      data: {
        payrollPeriodId: payrollPeriod.id,
        staffAssignmentId: staff.staffAssignment.id,
        timeEntryId: timeEntry.id,
        kind: 'ORDINARY_PAY',
        description: 'Historical base pay',
        amount: '5000',
        currency: 'USD',
        calculationInputs: { basis: 'MONTHLY', rateAmount: '5000' },
      },
    });
    const payment = await prisma.paymentRecord.create({
      data: {
        organisationId: organisation.id,
        payrollPeriodId: payrollPeriod.id,
        staffAssignmentId: staff.staffAssignment.id,
        talentProfileId: staff.profile.id,
        status: 'PAID',
        methodDescription: 'External bank transfer',
        externalReference: `EXT-${suffix()}`,
        amount: '5000',
        currency: 'USD',
        paidAt: new Date(),
        recordedById: owner.id,
      },
    });
    const effectiveTo = new Date();
    const ownerAuth = authContext(owner.id, {
      organisationId: organisation.id,
      membershipStatus: 'ACTIVE',
      organisationPermissions: new Set(['workforce:manage_assignment', 'workforce:read']),
    });

    await offboard(ownerAuth, organisation.id, staff.staffAssignment.id, {
      expectedUpdatedAt: staff.staffAssignment.updatedAt,
      effectiveTo,
      reason: 'CONTRACT_ENDED',
      notes: 'Integration-test completion.',
    });

    const [assignment, placement, retainedTask, retainedTime, retainedAgreement, retainedPayroll, retainedLine, retainedPayment, history, event, audit] =
      await Promise.all([
        prisma.staffAssignment.findUniqueOrThrow({ where: { id: staff.staffAssignment.id } }),
        prisma.placement.findUniqueOrThrow({ where: { id: staff.placement.id } }),
        prisma.task.findUnique({ where: { id: task.id } }),
        prisma.timeEntry.findUnique({ where: { id: timeEntry.id } }),
        prisma.payAgreement.findUnique({ where: { id: payAgreement.id } }),
        prisma.payrollPeriod.findUnique({ where: { id: payrollPeriod.id } }),
        prisma.payrollLineItem.findUnique({ where: { id: payrollLine.id } }),
        prisma.paymentRecord.findUnique({ where: { id: payment.id } }),
        prisma.placementStatusHistory.findFirst({
          where: { placementId: staff.placement.id, toStatus: 'ENDED' },
        }),
        prisma.outboxEvent.findFirst({
          where: {
            aggregateId: staff.staffAssignment.id,
            eventKey: 'workforce.assignment_ended',
          },
        }),
        prisma.auditEvent.findFirst({
          where: { resourceId: staff.staffAssignment.id, action: 'STATUS_CHANGE' },
        }),
      ]);
    expect(assignment).toMatchObject({ status: 'ENDED', endReason: 'CONTRACT_ENDED' });
    expect(placement.status).toBe('ENDED');
    expect(retainedTask).not.toBeNull();
    expect(retainedTime).not.toBeNull();
    expect(retainedAgreement).not.toBeNull();
    expect(retainedPayroll).not.toBeNull();
    expect(retainedLine).not.toBeNull();
    expect(retainedPayment).not.toBeNull();
    expect(history).not.toBeNull();
    expect(event).not.toBeNull();
    expect(audit).not.toBeNull();
  });

  it('lets a platform reviewer change vetting state without changing identity fields', async () => {
    const prisma = getPrisma();
    const reviewer = await createTestUser('reviewer');
    const candidate = await createTestUser('candidate');
    const profile = await prisma.talentProfile.create({
      data: {
        userId: candidate.id,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        vettingStatus: 'IN_REVIEW',
      },
    });
    const vettingCase = await prisma.vettingCase.create({
      data: {
        talentProfileId: profile.id,
        status: 'ASSIGNED',
        assignedToId: reviewer.id,
        assignedAt: new Date(),
      },
    });
    const reviewerAuth = authContext(reviewer.id, {
      platformRoles: ['TALENT_REVIEWER'],
      platformPermissions: new Set(['vetting:read', 'vetting:review']),
    });

    await reviewCase(reviewerAuth, vettingCase.id, {
      expectedUpdatedAt: vettingCase.updatedAt,
      decision: 'REQUEST_INFO',
      internalNotes: 'Internal detail.',
      candidateVisibleNotes: 'Please add one document.',
    });

    const [updatedCase, updatedProfile, unchangedUser] = await Promise.all([
      prisma.vettingCase.findUniqueOrThrow({ where: { id: vettingCase.id } }),
      prisma.talentProfile.findUniqueOrThrow({ where: { id: profile.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: candidate.id } }),
    ]);
    expect(updatedCase.status).toBe('ADDITIONAL_INFO_REQUIRED');
    expect(updatedProfile.vettingStatus).toBe('ADDITIONAL_INFO_REQUIRED');
    expect(unchangedUser).toMatchObject({
      email: candidate.email,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      phone: candidate.phone,
    });

    const companyAuth = authContext(reviewer.id, {
      organisationPermissions: new Set(['talent:read']),
    });
    await expect(
      reviewCase(companyAuth, vettingCase.id, {
        expectedUpdatedAt: updatedCase.updatedAt,
        decision: 'REQUEST_INFO',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_ACCESS_DENIED, status: 403 });
  });
});
