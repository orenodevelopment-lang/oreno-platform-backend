import type {
  PerformancePeriodStatus,
  PerformanceReviewStatus,
  Prisma,
} from '@prisma/client';
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

const PERIOD_INCLUDE = {
  metrics: { orderBy: [{ position: 'asc' as const }, { key: 'asc' as const }] },
  _count: { select: { reviews: true } },
} satisfies Prisma.PerformancePeriodInclude;

const REVIEW_INCLUDE = {
  performancePeriod: { include: { metrics: { orderBy: { position: 'asc' as const } } } },
  staffAssignment: {
    select: {
      id: true,
      employeeCode: true,
      jobTitle: true,
      departmentId: true,
      talentProfile: {
        select: {
          id: true,
          headline: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              avatarFileId: true,
            },
          },
        },
      },
    },
  },
  results: { include: { metricDefinition: true } },
  feedback: { orderBy: { createdAt: 'asc' as const } },
  corrections: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.PerformanceReviewInclude;

interface PageQuery {
  page: number;
  pageSize: number;
}

interface ReviewQuery extends PageQuery {
  status?: PerformanceReviewStatus;
  performancePeriodId?: string;
  staffAssignmentId?: string;
}

function assertDateRange(startDate: Date, endDate: Date): void {
  if (endDate < startDate) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'The period end date must be on or after its start date.',
    );
  }
}

function managerReviewScope(auth: AuthContext): Prisma.PerformanceReviewWhereInput {
  if (auth.organisationRole !== 'MANAGER' || auth.scopedDepartmentIds.length === 0) return {};
  return {
    staffAssignment: {
      OR: [
        { departmentId: { in: [...auth.scopedDepartmentIds] } },
        {
          managerAssignments: {
            some: {
              effectiveTo: null,
              OR: [
                ...(auth.membershipId ? [{ managerMembershipId: auth.membershipId }] : []),
                { managerStaffAssignment: { talentProfile: { userId: auth.userId } } },
              ],
            },
          },
        },
      ],
    },
  };
}

export async function listPeriods(
  auth: AuthContext,
  organisationId: string,
  query: PageQuery & { status?: PerformancePeriodStatus },
) {
  assertOrganisationAccess(auth, organisationId, 'performance:read');
  const where: Prisma.PerformancePeriodWhereInput = {
    organisationId,
    ...(query.status ? { status: query.status } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.performancePeriod.findMany({
      where,
      include: PERIOD_INCLUDE,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.performancePeriod.count({ where }),
  ]);
  return { items, total };
}

export async function getPeriod(auth: AuthContext, organisationId: string, periodId: string) {
  assertOrganisationAccess(auth, organisationId, 'performance:read');
  const period = await getPrisma().performancePeriod.findFirst({
    where: { id: periodId, organisationId },
    include: PERIOD_INCLUDE,
  });
  if (!period) {
    throw new NotFoundError(ErrorCode.PERFORMANCE_PERIOD_NOT_FOUND, 'That period was not found.');
  }
  return period;
}

export async function createPeriod(
  auth: AuthContext,
  organisationId: string,
  input: { name: string; startDate: Date; endDate: Date },
) {
  assertOrganisationMutation(auth, organisationId, 'performance:manage_period');
  assertDateRange(input.startDate, input.endDate);
  return getPrisma().performancePeriod.create({ data: { ...input, organisationId } });
}

export async function updatePeriod(
  auth: AuthContext,
  organisationId: string,
  periodId: string,
  input: { expectedUpdatedAt: Date; name?: string; startDate?: Date; endDate?: Date },
) {
  assertOrganisationMutation(auth, organisationId, 'performance:manage_period');
  const current = await getPrisma().performancePeriod.findFirst({
    where: { id: periodId, organisationId },
  });
  if (!current) {
    throw new NotFoundError(ErrorCode.PERFORMANCE_PERIOD_NOT_FOUND, 'That period was not found.');
  }
  if (current.status !== 'DRAFT') {
    throw new UnprocessableError(
      ErrorCode.PERFORMANCE_INVALID_TRANSITION,
      'Only a draft period can be edited.',
    );
  }
  assertDateRange(input.startDate ?? current.startDate, input.endDate ?? current.endDate);
  const { expectedUpdatedAt, ...data } = input;
  const changed = await getPrisma().performancePeriod.updateMany({
    where: { id: periodId, organisationId, status: 'DRAFT', updatedAt: expectedUpdatedAt },
    data,
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The period changed. Refresh and try again.');
  }
  return getPrisma().performancePeriod.findUniqueOrThrow({
    where: { id: periodId },
    include: PERIOD_INCLUDE,
  });
}

const PERIOD_TRANSITIONS: Record<PerformancePeriodStatus, readonly PerformancePeriodStatus[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['IN_REVIEW'],
  IN_REVIEW: ['CLOSED'],
  CLOSED: ['ARCHIVED'],
  ARCHIVED: [],
};

export async function transitionPeriod(
  auth: AuthContext,
  organisationId: string,
  periodId: string,
  status: Exclude<PerformancePeriodStatus, 'DRAFT'>,
  expectedUpdatedAt: Date,
) {
  assertOrganisationMutation(auth, organisationId, 'performance:manage_period');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.performancePeriod.findFirst({
      where: { id: periodId, organisationId },
      include: { _count: { select: { metrics: true } } },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.PERFORMANCE_PERIOD_NOT_FOUND, 'That period was not found.');
    }
    if (!PERIOD_TRANSITIONS[current.status].includes(status)) {
      throw new UnprocessableError(
        ErrorCode.PERFORMANCE_INVALID_TRANSITION,
        `A ${current.status} period cannot move to ${status}.`,
      );
    }
    if (status === 'OPEN' && current._count.metrics === 0) {
      throw new UnprocessableError(
        ErrorCode.PERFORMANCE_METRIC_UNDEFINED,
        'Define at least one metric before opening the period.',
      );
    }
    if (status === 'CLOSED') {
      const unfinished = await tx.performanceReview.count({
        where: {
          performancePeriodId: periodId,
          status: { notIn: ['FINALISED', 'ACKNOWLEDGED', 'DISPUTED', 'CORRECTED'] },
        },
      });
      if (unfinished > 0) {
        throw new UnprocessableError(
          ErrorCode.PERFORMANCE_INVALID_TRANSITION,
          'Every review must be finalised before closing the period.',
        );
      }
    }
    const changed = await tx.performancePeriod.updateMany({
      where: { id: periodId, updatedAt: expectedUpdatedAt },
      data: { status, ...(status === 'CLOSED' ? { closedAt: new Date() } : {}) },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The period changed. Refresh and try again.');
    }
    return tx.performancePeriod.findUniqueOrThrow({
      where: { id: periodId },
      include: PERIOD_INCLUDE,
    });
  });
}

interface MetricInput {
  key: string;
  name: string;
  description?: string | null;
  kind: 'NUMERIC' | 'PERCENTAGE' | 'RATING' | 'BOOLEAN';
  formula: Record<string, unknown>;
  minValue?: string | null;
  maxValue?: string | null;
  weight: string;
  position: number;
}

export async function createMetric(
  auth: AuthContext,
  organisationId: string,
  periodId: string,
  input: MetricInput,
) {
  assertOrganisationMutation(auth, organisationId, 'performance:manage_metrics');
  const period = await getPrisma().performancePeriod.findFirst({
    where: { id: periodId, organisationId, status: 'DRAFT' },
  });
  if (!period) {
    throw new NotFoundError(
      ErrorCode.PERFORMANCE_PERIOD_NOT_FOUND,
      'That editable period was not found.',
    );
  }
  return getPrisma().metricDefinition.create({
    data: { ...input, formula: input.formula as Prisma.InputJsonValue, performancePeriodId: periodId },
  });
}

export async function updateMetric(
  auth: AuthContext,
  organisationId: string,
  periodId: string,
  metricId: string,
  input: Partial<MetricInput> & { expectedUpdatedAt: Date },
) {
  assertOrganisationMutation(auth, organisationId, 'performance:manage_metrics');
  const { expectedUpdatedAt, formula, ...data } = input;
  const changed = await getPrisma().metricDefinition.updateMany({
    where: {
      id: metricId,
      performancePeriodId: periodId,
      performancePeriod: { organisationId, status: 'DRAFT' },
      updatedAt: expectedUpdatedAt,
    },
    data: {
      ...data,
      ...(formula ? { formula: formula as Prisma.InputJsonValue } : {}),
    },
  });
  if (changed.count === 0) {
    throw new ConflictError(
      ErrorCode.STALE_WRITE,
      'The metric changed or its period is no longer editable.',
    );
  }
  return getPrisma().metricDefinition.findUniqueOrThrow({ where: { id: metricId } });
}

export async function createReview(
  auth: AuthContext,
  organisationId: string,
  input: { performancePeriodId: string; staffAssignmentId: string },
) {
  assertOrganisationMutation(auth, organisationId, 'performance:write_review');
  const [period, staff, reviewer] = await Promise.all([
    getPrisma().performancePeriod.findFirst({
      where: { id: input.performancePeriodId, organisationId, status: 'OPEN' },
    }),
    getPrisma().staffAssignment.findFirst({
      where: {
        id: input.staffAssignmentId,
        organisationId,
        status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] },
      },
      select: { id: true, talentProfileId: true },
    }),
    getPrisma().talentProfile.findUnique({
      where: { userId: auth.userId },
      select: { id: true },
    }),
  ]);
  if (!period) {
    throw new NotFoundError(
      ErrorCode.PERFORMANCE_PERIOD_NOT_FOUND,
      'That open period was not found.',
    );
  }
  if (!staff) {
    throw new NotFoundError(ErrorCode.STAFF_ASSIGNMENT_NOT_FOUND, 'That assignment was not found.');
  }
  return getPrisma().performanceReview.create({
    data: {
      organisationId,
      performancePeriodId: input.performancePeriodId,
      staffAssignmentId: staff.id,
      talentProfileId: staff.talentProfileId,
      reviewerProfileId: reviewer?.id,
    },
    include: REVIEW_INCLUDE,
  });
}

export async function listReviews(
  auth: AuthContext,
  organisationId: string,
  query: ReviewQuery,
) {
  assertOrganisationAccess(auth, organisationId, 'performance:read');
  const where: Prisma.PerformanceReviewWhereInput = {
    organisationId,
    ...managerReviewScope(auth),
    ...(query.status ? { status: query.status } : {}),
    ...(query.performancePeriodId
      ? { performancePeriodId: query.performancePeriodId }
      : {}),
    ...(query.staffAssignmentId ? { staffAssignmentId: query.staffAssignmentId } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.performanceReview.findMany({
      where,
      include: REVIEW_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.performanceReview.count({ where }),
  ]);
  return { items, total };
}

export async function getReview(auth: AuthContext, organisationId: string, reviewId: string) {
  assertOrganisationAccess(auth, organisationId, 'performance:read');
  const review = await getPrisma().performanceReview.findFirst({
    where: { id: reviewId, organisationId, ...managerReviewScope(auth) },
    include: REVIEW_INCLUDE,
  });
  if (!review) {
    throw new NotFoundError(ErrorCode.PERFORMANCE_REVIEW_NOT_FOUND, 'That review was not found.');
  }
  return review;
}

export async function updateReview(
  auth: AuthContext,
  organisationId: string,
  reviewId: string,
  input: { expectedUpdatedAt: Date; summary?: string | null },
) {
  assertOrganisationMutation(auth, organisationId, 'performance:write_review');
  await getReview(auth, organisationId, reviewId);
  const { expectedUpdatedAt, ...data } = input;
  const changed = await getPrisma().performanceReview.updateMany({
    where: {
      id: reviewId,
      organisationId,
      updatedAt: expectedUpdatedAt,
      status: { in: ['DRAFT', 'SELF_ASSESSMENT', 'MANAGER_REVIEW', 'CALIBRATION'] },
    },
    data,
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The review changed or is no longer editable.');
  }
  return getPrisma().performanceReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: REVIEW_INCLUDE,
  });
}

export async function addFeedback(
  auth: AuthContext,
  organisationId: string,
  reviewId: string,
  input: { body: string; kind: string; isVisibleToTalent: boolean },
) {
  assertOrganisationMutation(auth, organisationId, 'performance:write_review');
  await getReview(auth, organisationId, reviewId);
  return getPrisma().performanceFeedback.create({
    data: { ...input, performanceReviewId: reviewId, authorId: auth.userId },
  });
}

export async function recordMetricResult(
  auth: AuthContext,
  organisationId: string,
  reviewId: string,
  input: {
    expectedUpdatedAt: Date;
    metricDefinitionId: string;
    value: string;
    evidence: Record<string, unknown>;
  },
) {
  assertOrganisationMutation(auth, organisationId, 'performance:write_review');
  const review = await getReview(auth, organisationId, reviewId);
  if (!['MANAGER_REVIEW', 'CALIBRATION'].includes(review.status)) {
    throw new UnprocessableError(
      ErrorCode.PERFORMANCE_INVALID_TRANSITION,
      'Metric results can only be recorded during manager review or calibration.',
    );
  }
  const metric = await getPrisma().metricDefinition.findFirst({
    where: {
      id: input.metricDefinitionId,
      performancePeriodId: review.performancePeriodId,
    },
  });
  if (!metric) {
    throw new NotFoundError(
      ErrorCode.PERFORMANCE_METRIC_UNDEFINED,
      'That metric is not defined for this period.',
    );
  }
  const numeric = Number(input.value);
  if (
    (metric.minValue !== null && numeric < Number(metric.minValue)) ||
    (metric.maxValue !== null && numeric > Number(metric.maxValue))
  ) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'The metric result is outside its configured range.',
    );
  }
  return getPrisma().$transaction(async (tx) => {
    const touched = await tx.performanceReview.updateMany({
      where: { id: reviewId, organisationId, updatedAt: input.expectedUpdatedAt },
      data: { updatedAt: new Date() },
    });
    if (touched.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The review changed. Refresh and try again.');
    }
    return tx.metricResult.upsert({
      where: {
        performanceReviewId_metricDefinitionId: {
          performanceReviewId: reviewId,
          metricDefinitionId: metric.id,
        },
      },
      create: {
        performanceReviewId: reviewId,
        metricDefinitionId: metric.id,
        value: input.value,
        evidence: input.evidence as Prisma.InputJsonValue,
      },
      update: {
        value: input.value,
        evidence: input.evidence as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
      include: { metricDefinition: true },
    });
  });
}

const REVIEW_TRANSITIONS: Partial<
  Record<PerformanceReviewStatus, readonly PerformanceReviewStatus[]>
> = {
  DRAFT: ['MANAGER_REVIEW'],
  SELF_ASSESSMENT: ['MANAGER_REVIEW'],
  MANAGER_REVIEW: ['CALIBRATION', 'FINALISED'],
  CALIBRATION: ['FINALISED'],
};

export async function transitionReview(
  auth: AuthContext,
  organisationId: string,
  reviewId: string,
  status: 'MANAGER_REVIEW' | 'CALIBRATION' | 'FINALISED',
  expectedUpdatedAt: Date,
) {
  assertOrganisationMutation(auth, organisationId, 'performance:submit_review');
  const current = await getReview(auth, organisationId, reviewId);
  if (!REVIEW_TRANSITIONS[current.status]?.includes(status)) {
    throw new UnprocessableError(
      ErrorCode.PERFORMANCE_INVALID_TRANSITION,
      `A ${current.status} review cannot move to ${status}.`,
    );
  }
  if (status === 'FINALISED') {
    const [metrics, results] = await Promise.all([
      getPrisma().metricDefinition.count({
        where: { performancePeriodId: current.performancePeriodId },
      }),
      getPrisma().metricResult.count({ where: { performanceReviewId: reviewId } }),
    ]);
    if (metrics === 0 || results !== metrics) {
      throw new UnprocessableError(
        ErrorCode.PERFORMANCE_SCORE_NOT_AVAILABLE,
        'Every configured metric needs evidence before the review can be finalised.',
      );
    }
  }
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.performanceReview.updateMany({
      where: { id: reviewId, organisationId, updatedAt: expectedUpdatedAt },
      data: { status, ...(status === 'FINALISED' ? { finalisedAt: new Date() } : {}) },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The review changed. Refresh and try again.');
    }
    if (status === 'FINALISED') {
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.PERFORMANCE_REVIEW_SUBMITTED,
        aggregateType: 'PerformanceReview',
        aggregateId: reviewId,
        organisationId,
        payload: {
          reviewId,
          staffAssignmentId: current.staffAssignmentId,
          organisationId,
        },
      });
    }
    return tx.performanceReview.findUniqueOrThrow({
      where: { id: reviewId },
      include: REVIEW_INCLUDE,
    });
  });
}

export async function listMyReviews(auth: AuthContext, query: ReviewQuery) {
  const where: Prisma.PerformanceReviewWhereInput = {
    talentProfile: { userId: auth.userId },
    ...(query.status ? { status: query.status } : {}),
    ...(query.performancePeriodId
      ? { performancePeriodId: query.performancePeriodId }
      : {}),
  };
  const prisma = getPrisma();
  const [rows, total] = await Promise.all([
    prisma.performanceReview.findMany({
      where,
      include: REVIEW_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.performanceReview.count({ where }),
  ]);
  const items = rows.map((row) => ({
    ...row,
    feedback: row.feedback.filter((item) => item.isVisibleToTalent),
  }));
  return { items, total };
}

export async function getMyReview(auth: AuthContext, reviewId: string) {
  const review = await getPrisma().performanceReview.findFirst({
    where: { id: reviewId, talentProfile: { userId: auth.userId } },
    include: REVIEW_INCLUDE,
  });
  if (!review) {
    throw new NotFoundError(ErrorCode.PERFORMANCE_REVIEW_NOT_FOUND, 'That review was not found.');
  }
  return {
    ...review,
    feedback: review.feedback.filter((item) => item.isVisibleToTalent),
  };
}

export async function submitSelfAssessment(
  auth: AuthContext,
  reviewId: string,
  input: { expectedUpdatedAt: Date; body: string },
) {
  const current = await getMyReview(auth, reviewId);
  if (!['DRAFT', 'SELF_ASSESSMENT'].includes(current.status)) {
    throw new UnprocessableError(
      ErrorCode.PERFORMANCE_INVALID_TRANSITION,
      'This review no longer accepts a self-assessment.',
    );
  }
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.performanceReview.updateMany({
      where: { id: reviewId, updatedAt: input.expectedUpdatedAt },
      data: { status: 'MANAGER_REVIEW' },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The review changed. Refresh and try again.');
    }
    await tx.performanceFeedback.create({
      data: {
        performanceReviewId: reviewId,
        authorId: auth.userId,
        kind: 'SELF',
        body: input.body,
        isVisibleToTalent: true,
      },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.PERFORMANCE_REVIEW_SUBMITTED,
      aggregateType: 'PerformanceReview',
      aggregateId: reviewId,
      organisationId: current.organisationId,
      payload: {
        reviewId,
        staffAssignmentId: current.staffAssignmentId,
        organisationId: current.organisationId,
      },
    });
    return tx.performanceReview.findUniqueOrThrow({
      where: { id: reviewId },
      include: REVIEW_INCLUDE,
    });
  });
}

export async function acknowledgeReview(
  auth: AuthContext,
  reviewId: string,
  input: {
    expectedUpdatedAt: Date;
    action: 'ACKNOWLEDGE' | 'DISPUTE';
    reason?: string;
  },
) {
  const current = await getMyReview(auth, reviewId);
  if (current.status !== 'FINALISED') {
    throw new UnprocessableError(
      ErrorCode.PERFORMANCE_INVALID_TRANSITION,
      'Only a finalised review can be acknowledged or disputed.',
    );
  }
  if (input.action === 'DISPUTE' && !input.reason) {
    throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'A dispute reason is required.');
  }
  const status = input.action === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'DISPUTED';
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.performanceReview.updateMany({
      where: { id: reviewId, updatedAt: input.expectedUpdatedAt, status: 'FINALISED' },
      data: {
        status,
        ...(status === 'ACKNOWLEDGED'
          ? { acknowledgedAt: new Date() }
          : { disputedAt: new Date() }),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The review changed. Refresh and try again.');
    }
    if (input.reason) {
      await tx.performanceFeedback.create({
        data: {
          performanceReviewId: reviewId,
          authorId: auth.userId,
          kind: 'DISPUTE',
          body: input.reason,
          isVisibleToTalent: true,
        },
      });
    }
    return tx.performanceReview.findUniqueOrThrow({
      where: { id: reviewId },
      include: REVIEW_INCLUDE,
    });
  });
}
