import type { Prisma, VettingCaseStatus } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';

const ADMIN_CASE_INCLUDE = {
  talentProfile: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatarFileId: true,
        },
      },
    },
  },
  organisation: { select: { id: true, name: true, slug: true } },
  reviews: {
    include: {
      reviewer: { select: { id: true, firstName: true, lastName: true, displayName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  assessments: { orderBy: { createdAt: 'asc' as const } },
  history: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.VettingCaseInclude;

function assertPlatformPermission(auth: AuthContext, permission: string): void {
  if (!auth.platformPermissions.has(permission) && !auth.isPlatformAdmin) {
    throw new ForbiddenError(ErrorCode.RESOURCE_ACCESS_DENIED, 'You do not have permission to do that.');
  }
}

export async function submitOwnVetting(auth: AuthContext, organisationId?: string | null) {
  const profile = await getPrisma().talentProfile.findUnique({
    where: { userId: auth.userId },
  });
  if (!profile) {
    throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent profile was not found.');
  }
  if (profile.completionPercent < 60) {
    throw new UnprocessableError(
      ErrorCode.TALENT_PROFILE_INCOMPLETE,
      'Complete at least 60% of your profile before submitting for vetting.',
    );
  }
  if (organisationId) {
    const organisation = await getPrisma().organisation.count({
      where: { id: organisationId, status: 'ACTIVE' },
    });
    if (organisation === 0) {
      throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'That organisation was not found.');
    }
  }
  const active = await getPrisma().vettingCase.count({
    where: {
      talentProfileId: profile.id,
      status: { in: ['OPEN', 'ASSIGNED', 'IN_REVIEW', 'ADDITIONAL_INFO_REQUIRED'] },
    },
  });
  if (active > 0) {
    throw new ConflictError(ErrorCode.VETTING_CASE_ALREADY_OPEN, 'A vetting case is already open.');
  }
  return getPrisma().$transaction(async (tx) => {
    const vettingCase = await tx.vettingCase.create({
      data: {
        talentProfileId: profile.id,
        organisationId: organisationId ?? null,
        history: { create: { toStatus: 'OPEN', changedById: auth.userId } },
      },
      include: ADMIN_CASE_INCLUDE,
    });
    await tx.talentProfile.update({
      where: { id: profile.id },
      data: { vettingStatus: 'PENDING', vettingApprovedAt: null },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.VETTING_CASE_OPENED,
      aggregateType: 'VettingCase',
      aggregateId: vettingCase.id,
      payload: { vettingCaseId: vettingCase.id, talentProfileId: profile.id },
    });
    return vettingCase;
  });
}

export async function getOwnVettingSummary(auth: AuthContext) {
  const profile = await getPrisma().talentProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      vettingStatus: true,
      vettingApprovedAt: true,
      vettingCases: {
        select: {
          id: true,
          status: true,
          slaDueAt: true,
          decidedAt: true,
          createdAt: true,
          updatedAt: true,
          reviews: {
            select: { decision: true, candidateVisibleNotes: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
          assessments: {
            select: {
              assessmentKey: true,
              label: true,
              score: true,
              maxScore: true,
              passed: true,
              notes: true,
            },
          },
          history: {
            select: { fromStatus: true, toStatus: true, reason: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!profile) {
    throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent profile was not found.');
  }
  return profile;
}

export async function withdrawOwnVetting(
  auth: AuthContext,
  caseId: string,
  expectedUpdatedAt: Date,
  reason: string,
) {
  const profile = await getPrisma().talentProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!profile) {
    throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent profile was not found.');
  }
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.vettingCase.findFirst({
      where: { id: caseId, talentProfileId: profile.id },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.VETTING_CASE_NOT_FOUND, 'That vetting case was not found.');
    }
    if (!['OPEN', 'ADDITIONAL_INFO_REQUIRED'].includes(current.status)) {
      throw new UnprocessableError(
        ErrorCode.VETTING_INVALID_TRANSITION,
        'That vetting case can no longer be withdrawn.',
      );
    }
    const changed = await tx.vettingCase.updateMany({
      where: { id: caseId, updatedAt: expectedUpdatedAt },
      data: { status: 'WITHDRAWN' },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The vetting case changed. Refresh and try again.');
    }
    await tx.vettingStatusHistory.create({
      data: {
        vettingCaseId: caseId,
        fromStatus: current.status,
        toStatus: 'WITHDRAWN',
        changedById: auth.userId,
        reason,
      },
    });
    await tx.talentProfile.update({
      where: { id: profile.id },
      data: { vettingStatus: 'NOT_SUBMITTED' },
    });
    return tx.vettingCase.findUniqueOrThrow({
      where: { id: caseId },
      include: ADMIN_CASE_INCLUDE,
    });
  });
}

export async function listCases(
  auth: AuthContext,
  query: { page: number; pageSize: number; status?: VettingCaseStatus; assignedToId?: string },
) {
  assertPlatformPermission(auth, 'vetting:read');
  const where: Prisma.VettingCaseWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.vettingCase.findMany({
      where,
      include: ADMIN_CASE_INCLUDE,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.vettingCase.count({ where }),
  ]);
  return { items, total };
}

export async function getCase(auth: AuthContext, caseId: string) {
  assertPlatformPermission(auth, 'vetting:read');
  const vettingCase = await getPrisma().vettingCase.findUnique({
    where: { id: caseId },
    include: ADMIN_CASE_INCLUDE,
  });
  if (!vettingCase) {
    throw new NotFoundError(ErrorCode.VETTING_CASE_NOT_FOUND, 'That vetting case was not found.');
  }
  return vettingCase;
}

async function reviewerExists(reviewerId: string): Promise<boolean> {
  const count = await getPrisma().user.count({
    where: {
      id: reviewerId,
      status: 'ACTIVE',
      OR: [
        { isPlatformAdmin: true },
        {
          platformRoleAssignments: {
            some: {
              revokedAt: null,
              role: {
                permissions: { some: { permission: { key: 'vetting:review' } } },
              },
            },
          },
        },
      ],
    },
  });
  return count > 0;
}

export async function assignCase(
  auth: AuthContext,
  caseId: string,
  input: { expectedUpdatedAt: Date; reviewerId: string; slaDueAt?: Date | null },
) {
  assertPlatformPermission(auth, 'vetting:assign_reviewer');
  if (!(await reviewerExists(input.reviewerId))) {
    throw new NotFoundError(ErrorCode.VETTING_REVIEWER_REQUIRED, 'That reviewer was not found.');
  }
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.vettingCase.findUnique({ where: { id: caseId } });
    if (!current) {
      throw new NotFoundError(ErrorCode.VETTING_CASE_NOT_FOUND, 'That vetting case was not found.');
    }
    if (!['OPEN', 'ASSIGNED'].includes(current.status)) {
      throw new UnprocessableError(
        ErrorCode.VETTING_INVALID_TRANSITION,
        'That vetting case cannot be assigned.',
      );
    }
    const changed = await tx.vettingCase.updateMany({
      where: { id: caseId, updatedAt: input.expectedUpdatedAt },
      data: {
        status: 'ASSIGNED',
        assignedToId: input.reviewerId,
        assignedAt: new Date(),
        slaDueAt: input.slaDueAt,
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The vetting case changed. Refresh and try again.');
    }
    await tx.vettingStatusHistory.create({
      data: {
        vettingCaseId: caseId,
        fromStatus: current.status,
        toStatus: 'ASSIGNED',
        changedById: auth.userId,
      },
    });
    return tx.vettingCase.findUniqueOrThrow({
      where: { id: caseId },
      include: ADMIN_CASE_INCLUDE,
    });
  });
}

export async function recordAssessment(
  auth: AuthContext,
  caseId: string,
  input: {
    assessmentKey: string;
    label: string;
    score?: string | null;
    maxScore?: string | null;
    passed?: boolean | null;
    notes?: string | null;
    evidenceUrl?: string | null;
  },
) {
  assertPlatformPermission(auth, 'vetting:review');
  const vettingCase = await getCase(auth, caseId);
  if (vettingCase.assignedToId && vettingCase.assignedToId !== auth.userId && !auth.isPlatformAdmin) {
    throw new ForbiddenError(ErrorCode.RESOURCE_ACCESS_DENIED, 'This case is assigned to another reviewer.');
  }
  return getPrisma().assessmentResult.create({ data: { ...input, vettingCaseId: caseId } });
}

export async function reviewCase(
  auth: AuthContext,
  caseId: string,
  input: {
    expectedUpdatedAt: Date;
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'ESCALATE';
    internalNotes?: string | null;
    candidateVisibleNotes?: string | null;
  },
) {
  assertPlatformPermission(
    auth,
    ['APPROVE', 'REJECT'].includes(input.decision) ? 'vetting:decide' : 'vetting:review',
  );
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.vettingCase.findUnique({ where: { id: caseId } });
    if (!current) {
      throw new NotFoundError(ErrorCode.VETTING_CASE_NOT_FOUND, 'That vetting case was not found.');
    }
    if (current.assignedToId && current.assignedToId !== auth.userId && !auth.isPlatformAdmin) {
      throw new ForbiddenError(
        ErrorCode.RESOURCE_ACCESS_DENIED,
        'This case is assigned to another reviewer.',
      );
    }
    if (!['ASSIGNED', 'IN_REVIEW', 'ADDITIONAL_INFO_REQUIRED'].includes(current.status)) {
      throw new UnprocessableError(
        ErrorCode.VETTING_INVALID_TRANSITION,
        'That vetting case cannot be reviewed in its current state.',
      );
    }
    const nextStatus: VettingCaseStatus =
      input.decision === 'APPROVE'
        ? 'APPROVED'
        : input.decision === 'REJECT'
          ? 'REJECTED'
          : input.decision === 'REQUEST_INFO'
            ? 'ADDITIONAL_INFO_REQUIRED'
            : 'IN_REVIEW';
    const changed = await tx.vettingCase.updateMany({
      where: { id: caseId, updatedAt: input.expectedUpdatedAt },
      data: {
        status: nextStatus,
        ...(nextStatus === 'APPROVED' || nextStatus === 'REJECTED'
          ? {
              decidedAt: new Date(),
              decidedById: auth.userId,
              decisionReason: input.candidateVisibleNotes ?? input.internalNotes ?? null,
            }
          : {}),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The vetting case changed. Refresh and try again.');
    }
    await tx.vettingReview.create({
      data: {
        vettingCaseId: caseId,
        reviewerId: auth.userId,
        decision: input.decision,
        internalNotes: input.internalNotes,
        candidateVisibleNotes: input.candidateVisibleNotes,
      },
    });
    await tx.vettingStatusHistory.create({
      data: {
        vettingCaseId: caseId,
        fromStatus: current.status,
        toStatus: nextStatus,
        changedById: auth.userId,
        reason: input.candidateVisibleNotes,
      },
    });
    const profileStatus =
      nextStatus === 'APPROVED'
        ? 'APPROVED'
        : nextStatus === 'REJECTED'
          ? 'REJECTED'
          : nextStatus === 'ADDITIONAL_INFO_REQUIRED'
            ? 'ADDITIONAL_INFO_REQUIRED'
            : 'IN_REVIEW';
    await tx.talentProfile.update({
      where: { id: current.talentProfileId },
      data: {
        vettingStatus: profileStatus,
        vettingApprovedAt: nextStatus === 'APPROVED' ? new Date() : null,
      },
    });
    await emitEvent(tx, {
      eventKey:
        nextStatus === 'APPROVED' || nextStatus === 'REJECTED'
          ? EVENT_KEYS.VETTING_DECIDED
          : EVENT_KEYS.VETTING_REVIEW_RECORDED,
      aggregateType: 'VettingCase',
      aggregateId: caseId,
      payload: { vettingCaseId: caseId, talentProfileId: current.talentProfileId },
    });
    return tx.vettingCase.findUniqueOrThrow({
      where: { id: caseId },
      include: ADMIN_CASE_INCLUDE,
    });
  });
}
