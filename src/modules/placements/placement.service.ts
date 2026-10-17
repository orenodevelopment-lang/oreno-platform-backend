import { randomUUID } from 'node:crypto';
import type { PlacementStatus, Prisma, ReplacementStatus } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import {
  assertOrganisationAccess,
  assertOrganisationMutation,
} from '../organisations/organisation.policy.js';

const PLACEMENT_INCLUDE = {
  job: { select: { id: true, title: true, reference: true } },
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
  offer: { select: { id: true, reference: true, terms: true } },
  staffAssignment: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  replacementRequests: {
    select: { id: true, reference: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.PlacementInclude;

const REPLACEMENT_INCLUDE = {
  placement: {
    include: {
      job: { select: { id: true, title: true, reference: true } },
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
      staffAssignment: { select: { id: true, employeeCode: true, status: true } },
    },
  },
  decisions: { orderBy: { createdAt: 'asc' as const } },
  candidates: {
    include: {
      talentProfile: {
        select: {
          id: true,
          headline: true,
          availabilityStatus: true,
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
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ReplacementRequestInclude;

function managerPlacementScope(auth: AuthContext): Prisma.PlacementWhereInput {
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

export async function listPlacements(
  auth: AuthContext,
  organisationId: string,
  query: { page: number; pageSize: number; status?: PlacementStatus },
) {
  assertOrganisationAccess(auth, organisationId, 'placement:read');
  const where: Prisma.PlacementWhereInput = {
    organisationId,
    ...managerPlacementScope(auth),
    ...(query.status ? { status: query.status } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.placement.findMany({
      where,
      include: PLACEMENT_INCLUDE,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.placement.count({ where }),
  ]);
  return { items, total };
}

export async function getPlacement(
  auth: AuthContext,
  organisationId: string,
  placementId: string,
) {
  assertOrganisationAccess(auth, organisationId, 'placement:read');
  const placement = await getPrisma().placement.findFirst({
    where: { id: placementId, organisationId, ...managerPlacementScope(auth) },
    include: PLACEMENT_INCLUDE,
  });
  if (!placement) {
    throw new NotFoundError(ErrorCode.PLACEMENT_NOT_FOUND, 'That placement was not found.');
  }
  return placement;
}

export async function updatePlacement(
  auth: AuthContext,
  organisationId: string,
  placementId: string,
  input: {
    expectedUpdatedAt: Date;
    title?: string;
    startDate?: Date;
    endDate?: Date | null;
  },
) {
  assertOrganisationMutation(auth, organisationId, 'placement:update');
  const current = await getPlacement(auth, organisationId, placementId);
  if (current.status === 'ENDED') {
    throw new UnprocessableError(
      ErrorCode.PLACEMENT_INVALID_TRANSITION,
      'An ended placement cannot be edited.',
    );
  }
  const start = input.startDate ?? current.startDate;
  const end = input.endDate === undefined ? current.endDate : input.endDate;
  if (end && end < start) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'The placement end date cannot precede its start date.',
    );
  }
  const { expectedUpdatedAt, ...data } = input;
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.placement.updateMany({
      where: { id: placementId, organisationId, updatedAt: expectedUpdatedAt },
      data,
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The placement changed. Refresh and try again.');
    }
    if (input.title && current.staffAssignment) {
      await tx.staffAssignment.update({
        where: { id: current.staffAssignment.id },
        data: { jobTitle: input.title },
      });
    }
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.PLACEMENT_UPDATED,
      aggregateType: 'Placement',
      aggregateId: placementId,
      organisationId,
      payload: { placementId, organisationId },
    });
    return tx.placement.findUniqueOrThrow({
      where: { id: placementId },
      include: PLACEMENT_INCLUDE,
    });
  });
}

const PLACEMENT_TRANSITIONS: Record<PlacementStatus, readonly PlacementStatus[]> = {
  PENDING: ['ACTIVE', 'ENDED'],
  ACTIVE: ['SUSPENDED', 'ENDED'],
  SUSPENDED: ['ACTIVE', 'ENDED'],
  ENDED: [],
  REPLACED: [],
  CANCELLED: [],
};

export async function transitionPlacement(
  auth: AuthContext,
  organisationId: string,
  placementId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'ENDED',
  expectedUpdatedAt: Date,
  reason?: string,
) {
  assertOrganisationMutation(
    auth,
    organisationId,
    status === 'ENDED' ? 'placement:end' : 'placement:update',
  );
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.placement.findFirst({
      where: { id: placementId, organisationId, ...managerPlacementScope(auth) },
      include: { staffAssignment: true },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.PLACEMENT_NOT_FOUND, 'That placement was not found.');
    }
    if (!PLACEMENT_TRANSITIONS[current.status].includes(status)) {
      throw new UnprocessableError(
        ErrorCode.PLACEMENT_INVALID_TRANSITION,
        `A ${current.status} placement cannot move to ${status}.`,
      );
    }
    if (status === 'ENDED' && !reason) {
      throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'An end reason is required.');
    }
    const now = new Date();
    const changed = await tx.placement.updateMany({
      where: { id: placementId, organisationId, updatedAt: expectedUpdatedAt },
      data: {
        status,
        ...(status === 'ENDED' ? { endedAt: now, endDate: now, endReason: reason } : {}),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The placement changed. Refresh and try again.');
    }
    await tx.placementStatusHistory.create({
      data: {
        placementId,
        fromStatus: current.status,
        toStatus: status,
        changedById: auth.userId,
        reason,
      },
    });
    if (current.staffAssignment) {
      await tx.staffAssignment.update({
        where: { id: current.staffAssignment.id },
        data: {
          status,
          ...(status === 'ENDED'
            ? { effectiveTo: now, endReason: 'OTHER', endNotes: reason }
            : {}),
        },
      });
    }
    await emitEvent(tx, {
      eventKey: status === 'ENDED' ? EVENT_KEYS.PLACEMENT_ENDED : EVENT_KEYS.PLACEMENT_UPDATED,
      aggregateType: 'Placement',
      aggregateId: placementId,
      organisationId,
      payload: {
        placementId,
        staffAssignmentId: current.staffAssignment?.id,
        organisationId,
      },
    });
    if (status === 'ENDED' && current.staffAssignment) {
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.STAFF_ASSIGNMENT_ENDED,
        aggregateType: 'StaffAssignment',
        aggregateId: current.staffAssignment.id,
        organisationId,
        payload: {
          staffAssignmentId: current.staffAssignment.id,
          placementId,
          organisationId,
        },
      });
    }
    return tx.placement.findUniqueOrThrow({
      where: { id: placementId },
      include: PLACEMENT_INCLUDE,
    });
  });
}

export async function listMyPlacements(
  auth: AuthContext,
  query: { page: number; pageSize: number; status?: PlacementStatus },
) {
  const where: Prisma.PlacementWhereInput = {
    talentProfile: { userId: auth.userId },
    ...(query.status ? { status: query.status } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.placement.findMany({
      where,
      include: PLACEMENT_INCLUDE,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.placement.count({ where }),
  ]);
  return { items, total };
}

export async function getMyPlacement(auth: AuthContext, placementId: string) {
  const placement = await getPrisma().placement.findFirst({
    where: { id: placementId, talentProfile: { userId: auth.userId } },
    include: PLACEMENT_INCLUDE,
  });
  if (!placement) {
    throw new NotFoundError(ErrorCode.PLACEMENT_NOT_FOUND, 'That placement was not found.');
  }
  return placement;
}

function replacementReference(): string {
  return `ORR-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

export async function getReplacementEligibility(
  auth: AuthContext,
  organisationId: string,
  placementId: string,
) {
  assertOrganisationAccess(auth, organisationId, 'placement:read');
  const placement = await getPlacement(auth, organisationId, placementId);
  const now = new Date();
  const activeRequest = await getPrisma().replacementRequest.findFirst({
    where: {
      placementId,
      status: { notIn: ['REJECTED', 'RESOLVED', 'CANCELLED'] },
    },
    select: { id: true, status: true, reference: true },
  });
  const withinWindow = Boolean(
    placement.replacementEligibleUntil && placement.replacementEligibleUntil >= now,
  );
  const eligible =
    ['ACTIVE', 'SUSPENDED'].includes(placement.status) && withinWindow && !activeRequest;
  return {
    eligible,
    eligibleUntil: placement.replacementEligibleUntil,
    activeRequest,
    reason: !['ACTIVE', 'SUSPENDED'].includes(placement.status)
      ? 'PLACEMENT_INACTIVE'
      : !withinWindow
        ? 'WINDOW_EXPIRED'
        : activeRequest
          ? 'REQUEST_ALREADY_OPEN'
          : null,
  };
}

export async function requestReplacement(
  auth: AuthContext,
  organisationId: string,
  input: { placementId: string; reason: string; reasonCategory: string },
) {
  assertOrganisationMutation(auth, organisationId, 'placement:request_replacement');
  const eligibility = await getReplacementEligibility(auth, organisationId, input.placementId);
  if (!eligibility.eligible) {
    const code =
      eligibility.reason === 'WINDOW_EXPIRED'
        ? ErrorCode.REPLACEMENT_WINDOW_EXPIRED
        : ErrorCode.REPLACEMENT_NOT_ELIGIBLE;
    throw new UnprocessableError(code, 'This placement is not eligible for replacement.');
  }
  return getPrisma().$transaction(async (tx) => {
    const request = await tx.replacementRequest.create({
      data: {
        organisationId,
        placementId: input.placementId,
        reference: replacementReference(),
        reason: input.reason,
        reasonCategory: input.reasonCategory,
        requestedById: auth.userId,
        eligibleAtRequest: true,
        eligibilityWindowEndsAt: eligibility.eligibleUntil,
      },
      include: REPLACEMENT_INCLUDE,
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.REPLACEMENT_REQUESTED,
      aggregateType: 'ReplacementRequest',
      aggregateId: request.id,
      organisationId,
      payload: { replacementRequestId: request.id, placementId: input.placementId, organisationId },
    });
    return request;
  });
}

export async function listReplacements(
  auth: AuthContext,
  organisationId: string,
  query: { page: number; pageSize: number; status?: ReplacementStatus },
) {
  assertOrganisationAccess(auth, organisationId, 'placement:read');
  const where: Prisma.ReplacementRequestWhereInput = {
    organisationId,
    placement: managerPlacementScope(auth),
    ...(query.status ? { status: query.status } : {}),
  };
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.replacementRequest.findMany({
      where,
      include: REPLACEMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.replacementRequest.count({ where }),
  ]);
  return { items, total };
}

export async function getReplacement(
  auth: AuthContext,
  organisationId: string,
  replacementId: string,
) {
  assertOrganisationAccess(auth, organisationId, 'placement:read');
  const request = await getPrisma().replacementRequest.findFirst({
    where: { id: replacementId, organisationId, placement: managerPlacementScope(auth) },
    include: REPLACEMENT_INCLUDE,
  });
  if (!request) {
    throw new NotFoundError(ErrorCode.REPLACEMENT_NOT_FOUND, 'That replacement was not found.');
  }
  return request;
}

export async function cancelReplacement(
  auth: AuthContext,
  organisationId: string,
  replacementId: string,
  expectedUpdatedAt: Date,
  reason: string,
) {
  assertOrganisationMutation(auth, organisationId, 'placement:request_replacement');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.replacementRequest.findFirst({
      where: { id: replacementId, organisationId },
    });
    if (!current) {
      throw new NotFoundError(ErrorCode.REPLACEMENT_NOT_FOUND, 'That replacement was not found.');
    }
    if (!['REQUESTED', 'UNDER_REVIEW'].includes(current.status)) {
      throw new UnprocessableError(
        ErrorCode.REPLACEMENT_ALREADY_DECIDED,
        'That replacement request can no longer be cancelled.',
      );
    }
    const changed = await tx.replacementRequest.updateMany({
      where: { id: replacementId, updatedAt: expectedUpdatedAt },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The request changed. Refresh and try again.');
    }
    await tx.replacementDecision.create({
      data: {
        replacementRequestId: replacementId,
        decision: 'REJECT',
        reason: `Cancelled by requester: ${reason}`,
        decidedById: auth.userId,
      },
    });
    return tx.replacementRequest.findUniqueOrThrow({
      where: { id: replacementId },
      include: REPLACEMENT_INCLUDE,
    });
  });
}

function assertReplacementAdmin(auth: AuthContext): void {
  if (!auth.platformPermissions.has('placement:decide_replacement') && !auth.isPlatformAdmin) {
    throw new ForbiddenError(ErrorCode.RESOURCE_ACCESS_DENIED, 'You cannot decide replacements.');
  }
}

export async function listAdminReplacements(
  auth: AuthContext,
  query: { page: number; pageSize: number; status?: ReplacementStatus },
) {
  assertReplacementAdmin(auth);
  const where: Prisma.ReplacementRequestWhereInput = query.status
    ? { status: query.status }
    : {};
  const prisma = getPrisma();
  const [items, total] = await Promise.all([
    prisma.replacementRequest.findMany({
      where,
      include: REPLACEMENT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.replacementRequest.count({ where }),
  ]);
  return { items, total };
}

export async function decideReplacement(
  auth: AuthContext,
  replacementId: string,
  input: {
    expectedUpdatedAt: Date;
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO';
    reason: string;
  },
) {
  assertReplacementAdmin(auth);
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.replacementRequest.findUnique({ where: { id: replacementId } });
    if (!current) {
      throw new NotFoundError(ErrorCode.REPLACEMENT_NOT_FOUND, 'That replacement was not found.');
    }
    if (!['REQUESTED', 'UNDER_REVIEW'].includes(current.status)) {
      throw new UnprocessableError(
        ErrorCode.REPLACEMENT_ALREADY_DECIDED,
        'That replacement request has already been decided.',
      );
    }
    const status: ReplacementStatus =
      input.decision === 'APPROVE'
        ? 'APPROVED'
        : input.decision === 'REJECT'
          ? 'REJECTED'
          : 'UNDER_REVIEW';
    const changed = await tx.replacementRequest.updateMany({
      where: { id: replacementId, updatedAt: input.expectedUpdatedAt },
      data: {
        status,
        assignedToId: auth.userId,
        assignedAt: current.assignedAt ?? new Date(),
        ...(['APPROVED', 'REJECTED'].includes(status) ? { decidedAt: new Date() } : {}),
      },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The request changed. Refresh and try again.');
    }
    await tx.replacementDecision.create({
      data: {
        replacementRequestId: replacementId,
        decision: input.decision,
        reason: input.reason,
        decidedById: auth.userId,
      },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.REPLACEMENT_DECIDED,
      aggregateType: 'ReplacementRequest',
      aggregateId: replacementId,
      organisationId: current.organisationId,
      payload: {
        replacementRequestId: replacementId,
        placementId: current.placementId,
        organisationId: current.organisationId,
      },
    });
    return tx.replacementRequest.findUniqueOrThrow({
      where: { id: replacementId },
      include: REPLACEMENT_INCLUDE,
    });
  });
}

export async function proposeCandidates(
  auth: AuthContext,
  replacementId: string,
  input: {
    expectedUpdatedAt: Date;
    candidates: { talentProfileId: string; notes?: string | null }[];
  },
) {
  assertReplacementAdmin(auth);
  const current = await getPrisma().replacementRequest.findUnique({
    where: { id: replacementId },
  });
  if (!current) {
    throw new NotFoundError(ErrorCode.REPLACEMENT_NOT_FOUND, 'That replacement was not found.');
  }
  if (!['APPROVED', 'CANDIDATES_PROPOSED'].includes(current.status)) {
    throw new UnprocessableError(
      ErrorCode.REPLACEMENT_ALREADY_DECIDED,
      'Candidates can only be proposed for an approved request.',
    );
  }
  const ids = [...new Set(input.candidates.map((candidate) => candidate.talentProfileId))];
  const profiles = await getPrisma().talentProfile.count({
    where: {
      id: { in: ids },
      status: 'ACTIVE',
      OR: [
        { visibility: { in: ['PUBLIC', 'ORENO_COMPANIES_ONLY'] } },
        { applications: { some: { organisationId: current.organisationId } } },
      ],
    },
  });
  if (profiles !== ids.length) {
    throw new NotFoundError(
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
      'One or more eligible candidates were not found.',
    );
  }
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.replacementRequest.updateMany({
      where: { id: replacementId, updatedAt: input.expectedUpdatedAt },
      data: { status: 'CANDIDATES_PROPOSED' },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The request changed. Refresh and try again.');
    }
    for (const candidate of input.candidates) {
      await tx.replacementCandidate.upsert({
        where: {
          replacementRequestId_talentProfileId: {
            replacementRequestId: replacementId,
            talentProfileId: candidate.talentProfileId,
          },
        },
        create: {
          replacementRequestId: replacementId,
          talentProfileId: candidate.talentProfileId,
          proposedById: auth.userId,
          notes: candidate.notes,
        },
        update: { proposedById: auth.userId, notes: candidate.notes },
      });
    }
    await tx.replacementDecision.create({
      data: {
        replacementRequestId: replacementId,
        decision: 'PROPOSE_CANDIDATE',
        reason: `${ids.length} candidate(s) proposed`,
        decidedById: auth.userId,
      },
    });
    return tx.replacementRequest.findUniqueOrThrow({
      where: { id: replacementId },
      include: REPLACEMENT_INCLUDE,
    });
  });
}

export async function respondToCandidate(
  auth: AuthContext,
  organisationId: string,
  replacementId: string,
  candidateId: string,
  input: { expectedUpdatedAt: Date; accepted: boolean; notes?: string | null },
) {
  assertOrganisationMutation(auth, organisationId, 'placement:request_replacement');
  return getPrisma().$transaction(async (tx) => {
    const request = await tx.replacementRequest.findFirst({
      where: { id: replacementId, organisationId, status: 'CANDIDATES_PROPOSED' },
    });
    if (!request) {
      throw new NotFoundError(ErrorCode.REPLACEMENT_NOT_FOUND, 'That replacement was not found.');
    }
    const candidate = await tx.replacementCandidate.findFirst({
      where: { id: candidateId, replacementRequestId: replacementId },
    });
    if (!candidate) {
      throw new NotFoundError(ErrorCode.REPLACEMENT_NOT_FOUND, 'That candidate was not found.');
    }
    const changed = await tx.replacementCandidate.updateMany({
      where: { id: candidateId, updatedAt: input.expectedUpdatedAt },
      data: { acceptedByCompany: input.accepted, notes: input.notes ?? candidate.notes },
    });
    if (changed.count === 0) {
      throw new ConflictError(ErrorCode.STALE_WRITE, 'The candidate changed. Refresh and try again.');
    }
    if (input.accepted) {
      await tx.replacementRequest.update({
        where: { id: replacementId },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      await tx.replacementDecision.create({
        data: {
          replacementRequestId: replacementId,
          decision: 'RESOLVE',
          reason: `Company accepted candidate ${candidate.talentProfileId}`,
          decidedById: auth.userId,
        },
      });
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.REPLACEMENT_DECIDED,
        aggregateType: 'ReplacementRequest',
        aggregateId: replacementId,
        organisationId,
        payload: {
          replacementRequestId: replacementId,
          placementId: request.placementId,
          candidateId,
          organisationId,
        },
      });
    }
    return tx.replacementRequest.findUniqueOrThrow({
      where: { id: replacementId },
      include: REPLACEMENT_INCLUDE,
    });
  });
}
