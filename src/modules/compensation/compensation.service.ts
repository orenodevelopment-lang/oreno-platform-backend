import { Prisma, type PayAgreementStatus, type PaymentRecordStatus, type PayrollPeriodStatus } from '@prisma/client';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import {
  assertOrganisationAccess,
  assertOrganisationMutation,
} from '../organisations/organisation.policy.js';

const AGREEMENT_INCLUDE = {
  staffAssignment: {
    select: {
      id: true,
      employeeCode: true,
      jobTitle: true,
      talentProfile: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true, displayName: true } },
        },
      },
    },
  },
  adjustments: { orderBy: { effectiveDate: 'asc' as const } },
} satisfies Prisma.PayAgreementInclude;

const PAYROLL_INCLUDE = {
  lineItems: {
    include: {
      staffAssignment: {
        select: {
          id: true,
          employeeCode: true,
          jobTitle: true,
          talentProfile: {
            select: {
              id: true,
              user: { select: { firstName: true, lastName: true, displayName: true } },
            },
          },
        },
      },
    },
    orderBy: [{ staffAssignmentId: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  approvals: { orderBy: { createdAt: 'asc' as const } },
  paymentRecords: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.PayrollPeriodInclude;

const PAYMENT_INCLUDE = {
  staffAssignment: {
    select: {
      id: true,
      employeeCode: true,
      jobTitle: true,
      talentProfile: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true, displayName: true } },
        },
      },
    },
  },
  payrollPeriod: {
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.PaymentRecordInclude;

function assertDates(start: Date, end?: Date | null): void {
  if (end && end < start) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'The effective end date cannot precede the start date.',
    );
  }
}

async function staffForOrganisation(organisationId: string, staffAssignmentId: string) {
  const staff = await getPrisma().staffAssignment.findFirst({
    where: { id: staffAssignmentId, organisationId },
    select: { id: true, talentProfileId: true, status: true },
  });
  if (!staff) {
    throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That assignment was not found.');
  }
  return staff;
}

async function assertNoAgreementOverlap(
  organisationId: string,
  staffAssignmentId: string,
  start: Date,
  end: Date | null | undefined,
  excludedId?: string,
) {
  const overlap = await getPrisma().payAgreement.count({
    where: {
      organisationId,
      staffAssignmentId,
      status: { not: 'ENDED' },
      ...(excludedId ? { id: { not: excludedId } } : {}),
      effectiveFrom: { lte: end ?? new Date('9999-12-31T00:00:00.000Z') },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
  });
  if (overlap > 0) {
    throw new ConflictError(
      ErrorCode.PAY_AGREEMENT_ALREADY_ACTIVE,
      'This assignment already has an overlapping pay agreement.',
    );
  }
}

export async function listAgreements(
  auth: AuthContext,
  organisationId: string,
  query: {
    page: number;
    pageSize: number;
    staffAssignmentId?: string;
    status?: PayAgreementStatus;
  },
) {
  assertOrganisationAccess(auth, organisationId, 'compensation:read');
  const where: Prisma.PayAgreementWhereInput = {
    organisationId,
    ...(query.staffAssignmentId ? { staffAssignmentId: query.staffAssignmentId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.payAgreement.findMany({
      where,
      include: AGREEMENT_INCLUDE,
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.payAgreement.count({ where }),
  ]);
  return { items, total };
}

export async function createAgreement(
  auth: AuthContext,
  organisationId: string,
  input: {
    staffAssignmentId: string;
    basis: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL';
    rateAmount: string;
    currency: string;
    overtimeMultiplier: string;
    ordinaryHoursPerPeriod?: string | null;
    payDayOfMonth?: number | null;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    notes?: string | null;
  },
) {
  assertOrganisationMutation(auth, organisationId, 'compensation:manage_agreement');
  assertDates(input.effectiveFrom, input.effectiveTo);
  const staff = await staffForOrganisation(organisationId, input.staffAssignmentId);
  await assertNoAgreementOverlap(
    organisationId,
    input.staffAssignmentId,
    input.effectiveFrom,
    input.effectiveTo,
  );
  if (input.basis !== 'HOURLY' && !input.ordinaryHoursPerPeriod) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'Non-hourly payroll needs ordinaryHoursPerPeriod for traceable proration.',
    );
  }
  return getPrisma().$transaction(async (tx) => {
    const agreement = await tx.payAgreement.create({
      data: {
        ...input,
        organisationId,
        talentProfileId: staff.talentProfileId,
        createdById: auth.userId,
      },
      include: AGREEMENT_INCLUDE,
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.PAY_AGREEMENT_CREATED,
      aggregateType: 'PayAgreement',
      aggregateId: agreement.id,
      organisationId,
      payload: { payAgreementId: agreement.id, staffAssignmentId: staff.id, organisationId },
    });
    return agreement;
  });
}

export async function updateAgreement(
  auth: AuthContext,
  organisationId: string,
  agreementId: string,
  input: {
    expectedUpdatedAt: Date;
    rateAmount?: string;
    overtimeMultiplier?: string;
    ordinaryHoursPerPeriod?: string | null;
    payDayOfMonth?: number | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    notes?: string | null;
  },
) {
  assertOrganisationMutation(auth, organisationId, 'compensation:manage_agreement');
  const current = await getPrisma().payAgreement.findFirst({
    where: { id: agreementId, organisationId },
  });
  if (!current) {
    throw new NotFoundError(ErrorCode.PAY_AGREEMENT_NOT_FOUND, 'That agreement was not found.');
  }
  if (current.status !== 'DRAFT') {
    throw new UnprocessableError(
      ErrorCode.PAY_AGREEMENT_ALREADY_ACTIVE,
      'Only a draft agreement can be edited.',
    );
  }
  const start = input.effectiveFrom ?? current.effectiveFrom;
  const end = input.effectiveTo === undefined ? current.effectiveTo : input.effectiveTo;
  assertDates(start, end);
  await assertNoAgreementOverlap(
    organisationId,
    current.staffAssignmentId,
    start,
    end,
    current.id,
  );
  const { expectedUpdatedAt, ...data } = input;
  const changed = await getPrisma().payAgreement.updateMany({
    where: { id: agreementId, organisationId, status: 'DRAFT', updatedAt: expectedUpdatedAt },
    data,
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The agreement changed. Refresh and try again.');
  }
  return getPrisma().payAgreement.findUniqueOrThrow({
    where: { id: agreementId },
    include: AGREEMENT_INCLUDE,
  });
}

const AGREEMENT_TRANSITIONS: Record<PayAgreementStatus, readonly PayAgreementStatus[]> = {
  DRAFT: ['ACTIVE', 'ENDED'],
  ACTIVE: ['SUSPENDED', 'ENDED'],
  SUSPENDED: ['ACTIVE', 'ENDED'],
  ENDED: [],
};

export async function transitionAgreement(
  auth: AuthContext,
  organisationId: string,
  agreementId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'ENDED',
  expectedUpdatedAt: Date,
  reason?: string,
) {
  assertOrganisationMutation(auth, organisationId, 'compensation:manage_agreement');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.payAgreement.findFirst({
      where: { id: agreementId, organisationId },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.PAY_AGREEMENT_NOT_FOUND, 'That agreement was not found.');
    }
    if (!AGREEMENT_TRANSITIONS[current.status].includes(status)) {
      throw new UnprocessableError(
        ErrorCode.PAY_AGREEMENT_ALREADY_ACTIVE,
        `A ${current.status} agreement cannot move to ${status}.`,
      );
    }
    if (status === 'ACTIVE') {
      await assertNoAgreementOverlap(
        organisationId,
        current.staffAssignmentId,
        current.effectiveFrom,
        current.effectiveTo,
        current.id,
      );
    }
    const changed = await tx.payAgreement.updateMany({
      where: { id: agreementId, updatedAt: expectedUpdatedAt },
      data: {
        status,
        ...(status === 'ENDED' && !current.effectiveTo ? { effectiveTo: new Date() } : {}),
        ...(reason ? { notes: [current.notes, reason].filter(Boolean).join('\n') } : {}),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The agreement changed. Refresh and try again.');
    }
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.PAY_AGREEMENT_UPDATED,
      aggregateType: 'PayAgreement',
      aggregateId: agreementId,
      organisationId,
      payload: { payAgreementId: agreementId, staffAssignmentId: current.staffAssignmentId, organisationId },
    });
    return tx.payAgreement.findUniqueOrThrow({
      where: { id: agreementId },
      include: AGREEMENT_INCLUDE,
    });
  });
}

export async function createAdjustment(
  auth: AuthContext,
  organisationId: string,
  input: {
    payAgreementId?: string | null;
    staffAssignmentId: string;
    kind: 'BONUS' | 'INCENTIVE' | 'DEDUCTION' | 'REIMBURSEMENT' | 'CORRECTION';
    amount: string;
    currency: string;
    description: string;
    effectiveDate: Date;
  },
) {
  assertOrganisationMutation(auth, organisationId, 'compensation:manage_adjustment');
  await staffForOrganisation(organisationId, input.staffAssignmentId);
  if (input.payAgreementId) {
    const agreement = await getPrisma().payAgreement.count({
      where: {
        id: input.payAgreementId,
        organisationId,
        staffAssignmentId: input.staffAssignmentId,
      },
    });
    if (agreement === 0) {
      throw new NotFoundError(ErrorCode.PAY_AGREEMENT_NOT_FOUND, 'That agreement was not found.');
    }
  }
  return getPrisma().$transaction(async (tx) => {
    const adjustment = await tx.compensationAdjustment.create({
      data: { ...input, organisationId, createdById: auth.userId },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.COMPENSATION_ADJUSTMENT_CREATED,
      aggregateType: 'CompensationAdjustment',
      aggregateId: adjustment.id,
      organisationId,
      payload: { adjustmentId: adjustment.id, staffAssignmentId: input.staffAssignmentId, organisationId },
    });
    return adjustment;
  });
}

export async function listPayroll(
  auth: AuthContext,
  organisationId: string,
  query: { page: number; pageSize: number; status?: PayrollPeriodStatus },
) {
  assertOrganisationAccess(auth, organisationId, 'payroll:read');
  const where: Prisma.PayrollPeriodWhereInput = {
    organisationId,
    ...(query.status ? { status: query.status } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.payrollPeriod.findMany({
      where,
      include: PAYROLL_INCLUDE,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.payrollPeriod.count({ where }),
  ]);
  return { items, total };
}

export async function createPayroll(
  auth: AuthContext,
  organisationId: string,
  input: { name: string; startDate: Date; endDate: Date; currency: string },
) {
  assertOrganisationMutation(auth, organisationId, 'payroll:manage_period');
  assertDates(input.startDate, input.endDate);
  const overlap = await getPrisma().payrollPeriod.count({
    where: {
      organisationId,
      status: { not: 'VOID' },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
  });
  if (overlap > 0) {
    throw new ConflictError(
      ErrorCode.CONFLICT,
      'A non-void payroll period already overlaps this date range.',
    );
  }
  return getPrisma().payrollPeriod.create({
    data: { ...input, organisationId, calculationVersion: 'approved-time-v1' },
  });
}

function hourlyRate(agreement: {
  basis: string;
  rateAmount: Prisma.Decimal;
  ordinaryHoursPerPeriod: Prisma.Decimal | null;
}): Prisma.Decimal {
  if (agreement.basis === 'HOURLY') return agreement.rateAmount;
  if (!agreement.ordinaryHoursPerPeriod || agreement.ordinaryHoursPerPeriod.lte(0)) {
    throw new UnprocessableError(
      ErrorCode.POLICY_NOT_CONFIGURED,
      'This non-hourly agreement has no ordinary-hours denominator.',
    );
  }
  return agreement.rateAmount.div(agreement.ordinaryHoursPerPeriod);
}

export async function calculatePayroll(
  auth: AuthContext,
  organisationId: string,
  payrollPeriodId: string,
  expectedUpdatedAt: Date,
) {
  assertOrganisationMutation(auth, organisationId, 'payroll:calculate');
  const prisma = getPrisma();
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: payrollPeriodId, organisationId },
  });
  if (!period) {
    throw new NotFoundError(ErrorCode.PAYROLL_PERIOD_NOT_FOUND, 'That payroll period was not found.');
  }
  if (!['DRAFT', 'CALCULATED'].includes(period.status)) {
    throw new UnprocessableError(
      ErrorCode.PAYROLL_PERIOD_LOCKED,
      'This payroll period can no longer be calculated.',
    );
  }
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      organisationId,
      status: 'APPROVED',
      workDate: { gte: period.startDate, lte: period.endDate },
    },
    include: {
      staffAssignment: {
        include: {
          payAgreements: {
            where: {
              status: 'ACTIVE',
              effectiveFrom: { lte: period.endDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.startDate } }],
            },
            orderBy: { effectiveFrom: 'desc' },
          },
        },
      },
    },
    orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
  });
  if (timeEntries.length === 0) {
    throw new UnprocessableError(
      ErrorCode.PAYROLL_NO_APPROVED_TIME,
      'No approved time exists in this payroll period.',
    );
  }
  const lineItems: Prisma.PayrollLineItemCreateManyInput[] = [];
  let gross = new Prisma.Decimal(0);
  let deductions = new Prisma.Decimal(0);
  for (const entry of timeEntries) {
    const agreement = entry.staffAssignment.payAgreements.find(
      (item) =>
        item.effectiveFrom <= entry.workDate &&
        (!item.effectiveTo || item.effectiveTo >= entry.workDate),
    );
    if (!agreement) {
      throw new UnprocessableError(
        ErrorCode.PAY_AGREEMENT_NOT_FOUND,
        `No active pay agreement covers approved time entry ${entry.id}.`,
      );
    }
    if (agreement.currency !== period.currency) {
      throw new UnprocessableError(
        ErrorCode.PAYROLL_CURRENCY_MISMATCH,
        'All pay agreements in a payroll period must use its currency.',
      );
    }
    const rate = hourlyRate(agreement);
    if (entry.ordinaryMinutes > 0) {
      const amount = rate.mul(entry.ordinaryMinutes).div(60).toDecimalPlaces(4);
      gross = gross.add(amount);
      lineItems.push({
        payrollPeriodId,
        staffAssignmentId: entry.staffAssignmentId,
        timeEntryId: entry.id,
        kind: 'ORDINARY_PAY',
        description: `Approved ordinary time for ${entry.workDate.toISOString().slice(0, 10)}`,
        quantityMinutes: entry.ordinaryMinutes,
        quantityHours: new Prisma.Decimal(entry.ordinaryMinutes).div(60).toDecimalPlaces(2),
        rateAmount: rate,
        multiplier: new Prisma.Decimal(1),
        amount,
        currency: period.currency,
        calculationInputs: {
          version: period.calculationVersion,
          payAgreementId: agreement.id,
          basis: agreement.basis,
          sourceRate: agreement.rateAmount.toString(),
          ordinaryHoursPerPeriod: agreement.ordinaryHoursPerPeriod?.toString() ?? null,
          minutes: entry.ordinaryMinutes,
        },
      });
    }
    if (entry.overtimeMinutes > 0) {
      const amount = rate
        .mul(agreement.overtimeMultiplier)
        .mul(entry.overtimeMinutes)
        .div(60)
        .toDecimalPlaces(4);
      gross = gross.add(amount);
      lineItems.push({
        payrollPeriodId,
        staffAssignmentId: entry.staffAssignmentId,
        timeEntryId: entry.id,
        kind: 'OVERTIME_PAY',
        description: `Approved overtime for ${entry.workDate.toISOString().slice(0, 10)}`,
        quantityMinutes: entry.overtimeMinutes,
        quantityHours: new Prisma.Decimal(entry.overtimeMinutes).div(60).toDecimalPlaces(2),
        rateAmount: rate,
        multiplier: agreement.overtimeMultiplier,
        amount,
        currency: period.currency,
        calculationInputs: {
          version: period.calculationVersion,
          payAgreementId: agreement.id,
          sourceRate: agreement.rateAmount.toString(),
          overtimeMultiplier: agreement.overtimeMultiplier.toString(),
          minutes: entry.overtimeMinutes,
        },
      });
    }
  }
  const adjustments = await prisma.compensationAdjustment.findMany({
    where: {
      organisationId,
      OR: [{ appliedInPeriodId: null }, { appliedInPeriodId: payrollPeriodId }],
      effectiveDate: { gte: period.startDate, lte: period.endDate },
    },
  });
  for (const adjustment of adjustments) {
    if (adjustment.currency !== period.currency) {
      throw new UnprocessableError(
        ErrorCode.PAYROLL_CURRENCY_MISMATCH,
        'All adjustments in a payroll period must use its currency.',
      );
    }
    const isDeduction = adjustment.kind === 'DEDUCTION';
    const amount = isDeduction ? adjustment.amount.negated() : adjustment.amount;
    if (isDeduction) deductions = deductions.add(adjustment.amount);
    else gross = gross.add(adjustment.amount);
    lineItems.push({
      payrollPeriodId,
      staffAssignmentId: adjustment.staffAssignmentId,
      kind: isDeduction
        ? 'DEDUCTION'
        : adjustment.kind === 'BONUS' || adjustment.kind === 'INCENTIVE'
          ? adjustment.kind
          : 'ADJUSTMENT',
      description: adjustment.description,
      amount,
      currency: adjustment.currency,
      calculationInputs: {
        version: period.calculationVersion,
        adjustmentId: adjustment.id,
        adjustmentKind: adjustment.kind,
      },
    });
  }
  const net = gross.sub(deductions);
  return prisma.$transaction(async (tx) => {
    const touched = await tx.payrollPeriod.updateMany({
      where: {
        id: payrollPeriodId,
        organisationId,
        status: { in: ['DRAFT', 'CALCULATED'] },
        updatedAt: expectedUpdatedAt,
      },
      data: {
        status: 'CALCULATED',
        totalGross: gross,
        totalDeductions: deductions,
        totalNet: net,
        calculatedAt: new Date(),
      },
    });
    if (touched.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The payroll period changed. Refresh and try again.');
    }
    await tx.payrollLineItem.deleteMany({ where: { payrollPeriodId } });
    if (lineItems.length > 0) await tx.payrollLineItem.createMany({ data: lineItems });
    await tx.compensationAdjustment.updateMany({
      where: { id: { in: adjustments.map((item) => item.id) } },
      data: { appliedInPeriodId: payrollPeriodId },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.PAYROLL_PERIOD_CALCULATED,
      aggregateType: 'PayrollPeriod',
      aggregateId: payrollPeriodId,
      organisationId,
      payload: { payrollPeriodId, organisationId },
    });
    return tx.payrollPeriod.findUniqueOrThrow({
      where: { id: payrollPeriodId },
      include: PAYROLL_INCLUDE,
    });
  });
}

const PAYROLL_TRANSITIONS: Record<PayrollPeriodStatus, readonly PayrollPeriodStatus[]> = {
  DRAFT: ['VOID'],
  CALCULATED: ['PENDING_APPROVAL', 'VOID'],
  PENDING_APPROVAL: ['APPROVED', 'CALCULATED', 'VOID'],
  APPROVED: ['LOCKED'],
  LOCKED: ['PAID'],
  PAID: [],
  VOID: [],
};

export async function transitionPayroll(
  auth: AuthContext,
  organisationId: string,
  payrollPeriodId: string,
  status: PayrollPeriodStatus,
  expectedUpdatedAt: Date,
  reason?: string,
) {
  const permission =
    status === 'APPROVED'
      ? 'payroll:approve'
      : status === 'LOCKED'
        ? 'payroll:lock'
        : status === 'CALCULATED'
          ? 'payroll:reopen'
          : 'payroll:manage_period';
  assertOrganisationMutation(auth, organisationId, permission);
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.payrollPeriod.findFirst({
      where: { id: payrollPeriodId, organisationId },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.PAYROLL_PERIOD_NOT_FOUND, 'That payroll period was not found.');
    }
    if (!PAYROLL_TRANSITIONS[current.status].includes(status)) {
      throw new UnprocessableError(
        ErrorCode.PAYROLL_PERIOD_INVALID_TRANSITION,
        `A ${current.status} payroll period cannot move to ${status}.`,
      );
    }
    if (status === 'APPROVED' && !reason) {
      throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'An approval reason is required.');
    }
    const changed = await tx.payrollPeriod.updateMany({
      where: { id: payrollPeriodId, updatedAt: expectedUpdatedAt },
      data: {
        status,
        ...(status === 'LOCKED' ? { lockedAt: new Date(), lockedById: auth.userId } : {}),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The payroll period changed. Refresh and try again.');
    }
    await tx.payrollApproval.create({
      data: {
        payrollPeriodId,
        fromStatus: current.status,
        toStatus: status,
        approvedById: auth.userId,
        reason,
      },
    });
    if (status === 'APPROVED' || status === 'LOCKED') {
      await emitEvent(tx, {
        eventKey:
          status === 'APPROVED'
            ? EVENT_KEYS.PAYROLL_PERIOD_APPROVED
            : EVENT_KEYS.PAYROLL_PERIOD_LOCKED,
        aggregateType: 'PayrollPeriod',
        aggregateId: payrollPeriodId,
        organisationId,
        payload: { payrollPeriodId, organisationId },
      });
    }
    return tx.payrollPeriod.findUniqueOrThrow({
      where: { id: payrollPeriodId },
      include: PAYROLL_INCLUDE,
    });
  });
}

export async function listPayments(
  auth: AuthContext,
  organisationId: string,
  query: {
    page: number;
    pageSize: number;
    status?: PaymentRecordStatus;
    staffAssignmentId?: string;
    payrollPeriodId?: string;
  },
) {
  assertOrganisationAccess(auth, organisationId, 'payment:read');
  const where: Prisma.PaymentRecordWhereInput = {
    organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.staffAssignmentId ? { staffAssignmentId: query.staffAssignmentId } : {}),
    ...(query.payrollPeriodId ? { payrollPeriodId: query.payrollPeriodId } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.paymentRecord.findMany({
      where,
      include: PAYMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.paymentRecord.count({ where }),
  ]);
  return { items, total };
}

export async function createPayment(
  auth: AuthContext,
  organisationId: string,
  input: {
    payrollPeriodId?: string | null;
    staffAssignmentId?: string | null;
    methodDescription: string;
    externalReference?: string | null;
    amount: string;
    currency: string;
    paidAt?: Date | null;
    notes?: string | null;
  },
) {
  assertOrganisationMutation(auth, organisationId, 'payment:record');
  let talentProfileId: string | undefined;
  if (input.staffAssignmentId) {
    const staff = await staffForOrganisation(organisationId, input.staffAssignmentId);
    talentProfileId = staff.talentProfileId;
  }
  if (input.payrollPeriodId) {
    const payroll = await getPrisma().payrollPeriod.findFirst({
      where: {
        id: input.payrollPeriodId,
        organisationId,
        status: { in: ['LOCKED', 'PAID'] },
      },
    });
    if (!payroll) {
      throw new UnprocessableError(
        ErrorCode.PAYROLL_PERIOD_NOT_APPROVED,
        'Payments can only reference a locked payroll period.',
      );
    }
    if (payroll.currency !== input.currency) {
      throw new UnprocessableError(
        ErrorCode.PAYROLL_CURRENCY_MISMATCH,
        'The payment currency must match the payroll period.',
      );
    }
    if (input.staffAssignmentId) {
      const line = await getPrisma().payrollLineItem.count({
        where: {
          payrollPeriodId: input.payrollPeriodId,
          staffAssignmentId: input.staffAssignmentId,
        },
      });
      if (line === 0) {
        throw new NotFoundError(
          ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND,
          'That assignment has no line items in this payroll period.',
        );
      }
    }
  }
  return getPrisma().$transaction(async (tx) => {
    const status = input.paidAt ? 'PAID' : 'PENDING';
    const payment = await tx.paymentRecord.create({
      data: {
        ...input,
        organisationId,
        talentProfileId,
        status,
        recordedById: auth.userId,
        statusHistory: { create: { toStatus: status, changedById: auth.userId } },
      },
      include: PAYMENT_INCLUDE,
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.PAYMENT_RECORDED,
      aggregateType: 'PaymentRecord',
      aggregateId: payment.id,
      organisationId,
      payload: { paymentId: payment.id, payrollPeriodId: input.payrollPeriodId, organisationId },
    });
    return payment;
  });
}

const PAYMENT_TRANSITIONS: Record<PaymentRecordStatus, readonly PaymentRecordStatus[]> = {
  PENDING: ['AUTHORISED', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'CANCELLED'],
  AUTHORISED: ['PAID', 'PARTIALLY_PAID', 'FAILED', 'CANCELLED'],
  PAID: ['RECONCILED'],
  PARTIALLY_PAID: ['PAID', 'FAILED', 'CANCELLED', 'RECONCILED'],
  FAILED: ['PENDING', 'CANCELLED'],
  CANCELLED: [],
  RECONCILED: [],
};

async function markPayrollPaidIfCovered(tx: Prisma.TransactionClient, payrollPeriodId?: string | null) {
  if (!payrollPeriodId) return;
  const period = await tx.payrollPeriod.findUnique({ where: { id: payrollPeriodId } });
  if (!period || period.status !== 'LOCKED') return;
  const paid = await tx.paymentRecord.aggregate({
    where: { payrollPeriodId, status: { in: ['PAID', 'RECONCILED'] } },
    _sum: { amount: true },
  });
  if ((paid._sum.amount ?? new Prisma.Decimal(0)).gte(period.totalNet)) {
    await tx.payrollPeriod.update({
      where: { id: payrollPeriodId },
      data: { status: 'PAID' },
    });
  }
}

export async function transitionPayment(
  auth: AuthContext,
  organisationId: string,
  paymentId: string,
  input: {
    expectedUpdatedAt: Date;
    status: Exclude<PaymentRecordStatus, 'PENDING'>;
    reason?: string;
    paidAt?: Date | null;
  },
) {
  assertOrganisationMutation(
    auth,
    organisationId,
    input.status === 'RECONCILED' ? 'payment:reconcile' : 'payment:update_status',
  );
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.paymentRecord.findFirst({
      where: { id: paymentId, organisationId },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.PAYMENT_RECORD_NOT_FOUND, 'That payment was not found.');
    }
    if (!PAYMENT_TRANSITIONS[current.status].includes(input.status)) {
      throw new UnprocessableError(
        ErrorCode.PAYMENT_RECORD_INVALID_TRANSITION,
        `A ${current.status} payment cannot move to ${input.status}.`,
      );
    }
    if (['FAILED', 'CANCELLED'].includes(input.status) && !input.reason) {
      throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'A reason is required.');
    }
    const now = new Date();
    const changed = await tx.paymentRecord.updateMany({
      where: { id: paymentId, updatedAt: input.expectedUpdatedAt },
      data: {
        status: input.status,
        ...(input.status === 'PAID' || input.status === 'PARTIALLY_PAID'
          ? { paidAt: input.paidAt ?? now }
          : {}),
        ...(input.status === 'RECONCILED'
          ? { reconciledAt: now, reconciledById: auth.userId }
          : {}),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The payment changed. Refresh and try again.');
    }
    await tx.paymentStatusHistory.create({
      data: {
        paymentRecordId: paymentId,
        fromStatus: current.status,
        toStatus: input.status,
        changedById: auth.userId,
        reason: input.reason,
      },
    });
    await markPayrollPaidIfCovered(tx, current.payrollPeriodId);
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.PAYMENT_STATUS_CHANGED,
      aggregateType: 'PaymentRecord',
      aggregateId: paymentId,
      organisationId,
      payload: { paymentId, payrollPeriodId: current.payrollPeriodId, organisationId },
    });
    return tx.paymentRecord.findUniqueOrThrow({
      where: { id: paymentId },
      include: PAYMENT_INCLUDE,
    });
  });
}

export async function listMyCompensation(auth: AuthContext) {
  const [agreements, payments] = await Promise.all([
    getPrisma().payAgreement.findMany({
      where: { talentProfile: { userId: auth.userId } },
      include: {
        organisation: { select: { id: true, name: true, slug: true } },
        staffAssignment: { select: { id: true, employeeCode: true, jobTitle: true } },
      },
      orderBy: { effectiveFrom: 'desc' },
    }),
    getPrisma().paymentRecord.findMany({
      where: { talentProfile: { userId: auth.userId } },
      select: {
        id: true,
        organisationId: true,
        payrollPeriodId: true,
        staffAssignmentId: true,
        status: true,
        methodDescription: true,
        externalReference: true,
        amount: true,
        currency: true,
        paidAt: true,
        reconciledAt: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return { agreements, payments };
}
