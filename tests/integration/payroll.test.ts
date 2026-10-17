import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import {
  calculatePayroll,
  transitionPayroll,
} from '../../src/modules/compensation/compensation.service.js';
import {
  authContext,
  createStaffFixture,
  createTestOrganisation,
  createTestUser,
} from '../helpers/factories.js';

describe('traceable payroll calculations', () => {
  it('uses approved time only, preserves calculation inputs, and refuses locked recalculation', async () => {
    const prisma = getPrisma();
    const owner = await createTestUser('payroll-owner');
    const organisation = await createTestOrganisation('payroll');
    const staff = await createStaffFixture({ organisationId: organisation.id, creatorId: owner.id });
    await prisma.payAgreement.create({
      data: {
        organisationId: organisation.id,
        staffAssignmentId: staff.staffAssignment.id,
        talentProfileId: staff.profile.id,
        status: 'ACTIVE',
        basis: 'HOURLY',
        rateAmount: '25',
        currency: 'USD',
        overtimeMultiplier: '1.5',
        effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
        createdById: owner.id,
      },
    });
    const approved = await prisma.timeEntry.create({
      data: {
        organisationId: organisation.id,
        staffAssignmentId: staff.staffAssignment.id,
        talentProfileId: staff.profile.id,
        status: 'APPROVED',
        workDate: new Date('2026-10-10T00:00:00.000Z'),
        ordinaryMinutes: 480,
        overtimeMinutes: 120,
        approvedAt: new Date(),
      },
    });
    const draft = await prisma.timeEntry.create({
      data: {
        organisationId: organisation.id,
        staffAssignmentId: staff.staffAssignment.id,
        talentProfileId: staff.profile.id,
        status: 'DRAFT',
        workDate: new Date('2026-10-11T00:00:00.000Z'),
        ordinaryMinutes: 480,
      },
    });
    const period = await prisma.payrollPeriod.create({
      data: {
        organisationId: organisation.id,
        name: 'October 2026',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-31T00:00:00.000Z'),
        currency: 'USD',
        calculationVersion: 'approved-time-v1',
      },
    });
    const auth = authContext(owner.id, {
      organisationId: organisation.id,
      membershipStatus: 'ACTIVE',
      organisationPermissions: new Set([
        'payroll:calculate',
        'payroll:manage_period',
        'payroll:approve',
        'payroll:lock',
      ]),
    });

    let calculated = await calculatePayroll(auth, organisation.id, period.id, period.updatedAt);
    expect(calculated.status).toBe('CALCULATED');
    expect(calculated.totalGross.toString()).toBe('275');
    expect(calculated.totalDeductions.toString()).toBe('0');
    expect(calculated.totalNet.toString()).toBe('275');
    expect(calculated.lineItems).toHaveLength(2);
    expect(calculated.lineItems.every((item) => item.timeEntryId === approved.id)).toBe(true);
    expect(calculated.lineItems.some((item) => item.timeEntryId === draft.id)).toBe(false);
    expect(calculated.lineItems[0]?.calculationInputs).toMatchObject({
      version: 'approved-time-v1',
    });

    calculated = await transitionPayroll(
      auth,
      organisation.id,
      period.id,
      'PENDING_APPROVAL',
      calculated.updatedAt,
      'Ready for approval.',
    );
    calculated = await transitionPayroll(
      auth,
      organisation.id,
      period.id,
      'APPROVED',
      calculated.updatedAt,
      'Approved totals.',
    );
    calculated = await transitionPayroll(
      auth,
      organisation.id,
      period.id,
      'LOCKED',
      calculated.updatedAt,
      'Locked for external payment.',
    );
    expect(calculated.status).toBe('LOCKED');
    await expect(
      calculatePayroll(auth, organisation.id, period.id, calculated.updatedAt),
    ).rejects.toMatchObject({ code: 'PAYROLL_PERIOD_LOCKED', status: 422 });
  });
});
