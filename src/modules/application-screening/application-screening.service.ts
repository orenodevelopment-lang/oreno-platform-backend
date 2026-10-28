import type { ApplicationScreeningStatus, Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getContext } from '../../common/logging/context.js';
import { getPrisma } from '../../database/prisma.js';
import { recordAdministrativeAction, recordAudit } from '../../platform/audit/audit.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import type {
  AssignScreeningInput, CvReviewInput, FinalScreeningDecisionInput, ReleaseScreeningInput,
  ScheduleScreeningInterviewInput, ScreeningInterviewOutcomeInput, ScreeningQueueQuery,
  UpdateScreeningInterviewInput,
} from './application-screening.schema.js';
import { assertScreeningTransition } from './screening.transitions.js';

const ACTIVE_REVIEW_STATUSES: ApplicationScreeningStatus[] = [
  'PENDING_CV_REVIEW', 'CV_REVIEW_IN_PROGRESS', 'ADDITIONAL_INFO_REQUIRED', 'CV_APPROVED',
  'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'FINAL_REVIEW_PENDING', 'APPROVED_FOR_SUBMISSION',
];

const ADMIN_INCLUDE = {
  application: {
    include: {
      job: { include: { requirements: { orderBy: { position: 'asc' as const } }, organisation: { select: { id: true, name: true, status: true, verificationStatus: true } } } },
      talentProfile: { include: { user: { select: { id: true, firstName: true, lastName: true, displayName: true, email: true, status: true } }, skills: { include: { skill: true } } } },
      answers: true,
      attachments: { orderBy: { createdAt: 'asc' as const } },
    },
  },
  assignedReviewer: { select: { id: true, firstName: true, lastName: true, displayName: true, status: true } },
  cvReviews: { orderBy: { createdAt: 'desc' as const }, include: { reviewer: { select: { id: true, displayName: true, firstName: true, lastName: true } }, file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, status: true, readyAt: true, scannedAt: true } } } },
  interviews: { orderBy: { scheduledStartAt: 'desc' as const }, include: { interviewer: { select: { id: true, displayName: true, firstName: true, lastName: true } } } },
  informationRequests: { orderBy: { createdAt: 'desc' as const } },
  history: { orderBy: { createdAt: 'asc' as const }, include: { actor: { select: { id: true, displayName: true, firstName: true, lastName: true } } } },
} satisfies Prisma.ApplicationScreeningInclude;

function requirePermission(auth: AuthContext, permission: string): void {
  if (!auth.platformPermissions.has(permission)) {
    throw new ForbiddenError(ErrorCode.PLATFORM_ROLE_REQUIRED, 'This action requires authorized Oreno staff access.');
  }
}

function requireAssigned(screening: { assignedReviewerId: string | null }, auth: AuthContext): void {
  if (screening.assignedReviewerId && screening.assignedReviewerId !== auth.userId && !auth.platformPermissions.has('screening:release')) {
    throw new ForbiddenError(ErrorCode.RESOURCE_ACCESS_DENIED, 'This screening is assigned to another reviewer.');
  }
}

function requestId(): string | null {
  return getContext()?.requestId ?? null;
}

async function history(
  tx: Prisma.TransactionClient,
  screeningId: string,
  actorId: string | null,
  fromStatus: ApplicationScreeningStatus | null,
  toStatus: ApplicationScreeningStatus,
  action: string,
  reason?: string | null,
) {
  assertScreeningTransition(fromStatus, toStatus);
  await tx.screeningStatusHistory.create({ data: { screeningId, actorId, fromStatus, toStatus, action, reason: reason ?? null, requestId: requestId() } });
}

async function screeningOrThrow(applicationId: string) {
  const item = await getPrisma().applicationScreening.findUnique({ where: { applicationId }, include: ADMIN_INCLUDE });
  if (!item) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
  return item;
}

export async function listScreenings(auth: AuthContext, query: ScreeningQueueQuery) {
  requirePermission(auth, 'screening:read');
  const submittedAt = query.submittedFrom || query.submittedTo ? { ...(query.submittedFrom ? { gte: query.submittedFrom } : {}), ...(query.submittedTo ? { lte: query.submittedTo } : {}) } : undefined;
  const where: Prisma.ApplicationScreeningWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.assignedReviewerId ? { assignedReviewerId: query.assignedReviewerId } : {}),
    application: {
      ...(query.organisationId ? { organisationId: query.organisationId } : {}),
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(submittedAt ? { submittedAt } : {}),
      ...(query.q ? { OR: [
        { job: { title: { contains: query.q, mode: 'insensitive' } } },
        { job: { organisation: { name: { contains: query.q, mode: 'insensitive' } } } },
        { talentProfile: { user: { firstName: { contains: query.q, mode: 'insensitive' } } } },
        { talentProfile: { user: { lastName: { contains: query.q, mode: 'insensitive' } } } },
        { talentProfile: { user: { email: { contains: query.q, mode: 'insensitive' } } } },
      ] } : {}),
    },
  };
  const prisma = getPrisma();
  const [items, total, counts] = await Promise.all([
    prisma.applicationScreening.findMany({ where, include: ADMIN_INCLUDE, orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.applicationScreening.count({ where }),
    prisma.applicationScreening.groupBy({ by: ['status'], where: query.organisationId ? { application: { organisationId: query.organisationId } } : {}, _count: { _all: true }, orderBy: { status: 'asc' } }),
  ]);
  return { items, total, counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) };
}

export async function getScreening(auth: AuthContext, applicationId: string) {
  requirePermission(auth, 'screening:read');
  return screeningOrThrow(applicationId);
}

export async function assignScreening(auth: AuthContext, applicationId: string, input: AssignScreeningInput) {
  requirePermission(auth, 'screening:assign');
  const reviewer = await getPrisma().user.count({ where: { id: input.reviewerId, status: 'ACTIVE', platformRoleAssignments: { some: { revokedAt: null, role: { permissions: { some: { permission: { key: 'screening:cv_review' } } } } } } } });
  if (!reviewer) throw new NotFoundError(ErrorCode.SCREENING_REVIEWER_REQUIRED, 'That active screening reviewer was not found.');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.applicationScreening.findUnique({ where: { applicationId } });
    if (!current) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
    if (!ACTIVE_REVIEW_STATUSES.includes(current.status)) throw new UnprocessableError(ErrorCode.SCREENING_INVALID_TRANSITION, 'That screening can no longer be assigned.');
    const next = current.status === 'PENDING_CV_REVIEW' ? 'CV_REVIEW_IN_PROGRESS' : current.status;
    const changed = await tx.applicationScreening.updateMany({ where: { id: current.id, updatedAt: input.expectedUpdatedAt }, data: { assignedReviewerId: input.reviewerId, dueAt: input.dueAt, status: next, version: { increment: 1 } } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The screening changed. Refresh and try again.');
    await history(tx, current.id, auth.userId, current.status, next, 'ASSIGNED', input.reason);
    await recordAdministrativeAction({ action: 'UPDATE', resourceType: 'ApplicationScreening', resourceId: current.id, summary: 'Assigned recruitment screening reviewer', reason: input.reason }, tx);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_ASSIGNED, aggregateType: 'ApplicationScreening', aggregateId: current.id, payload: { applicationId, screeningId: current.id, userId: input.reviewerId } });
    return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.id }, include: ADMIN_INCLUDE });
  });
}

export async function recordCvReview(auth: AuthContext, applicationId: string, input: CvReviewInput) {
  requirePermission(auth, 'screening:cv_review');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.applicationScreening.findUnique({ where: { applicationId }, include: { application: { select: { organisationId: true, talentProfileId: true } } } });
    if (!current) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
    requireAssigned(current, auth);
    if (!['CV_REVIEW_IN_PROGRESS', 'PENDING_CV_REVIEW', 'ADDITIONAL_INFO_REQUIRED'].includes(current.status)) throw new UnprocessableError(ErrorCode.SCREENING_INVALID_TRANSITION, 'A CV decision cannot be recorded in this state.');
    const file = await tx.fileObject.findFirst({ where: { id: current.currentCvFileId, status: 'READY', category: 'CV' } });
    if (!file) throw new UnprocessableError(ErrorCode.FILE_NOT_READY, 'The submitted CV is not ready for review.');
    const next: ApplicationScreeningStatus = input.decision === 'APPROVED' ? 'CV_APPROVED' : input.decision === 'NOT_SELECTED' ? 'NOT_SELECTED' : 'ADDITIONAL_INFO_REQUIRED';
    const changed = await tx.applicationScreening.updateMany({ where: { id: current.id, updatedAt: input.expectedUpdatedAt, currentCvFileId: file.id }, data: { status: next, version: { increment: 1 }, failureReason: input.decision === 'NOT_SELECTED' ? input.candidateVisibleFeedback ?? input.reason : null } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The screening or submitted CV changed. Refresh and try again.');
    await tx.screeningCvReview.create({ data: { screeningId: current.id, reviewerId: auth.userId, fileId: file.id, decision: input.decision, rubric: input.rubric, privateNotes: input.privateNotes, candidateVisibleFeedback: input.candidateVisibleFeedback, employerSafeSummary: input.employerSafeSummary } });
    await history(tx, current.id, auth.userId, current.status, next, 'CV_REVIEWED', input.reason);
    await recordAdministrativeAction({ action: 'STATUS_CHANGE', resourceType: 'ApplicationScreening', resourceId: current.id, organisationId: current.application.organisationId, summary: `Recorded CV decision ${input.decision}`, reason: input.reason }, tx);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_CV_REVIEWED, aggregateType: 'ApplicationScreening', aggregateId: current.id, organisationId: current.application.organisationId, payload: { applicationId, screeningId: current.id, talentProfileId: current.application.talentProfileId } });
    return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.id }, include: ADMIN_INCLUDE });
  });
}

export async function requestInformation(auth: AuthContext, applicationId: string, input: { expectedUpdatedAt: Date; reason: string; message: string }) {
  requirePermission(auth, 'screening:cv_review');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.applicationScreening.findUnique({ where: { applicationId }, include: { application: { select: { organisationId: true, talentProfileId: true } } } });
    if (!current) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
    requireAssigned(current, auth);
    if (!['PENDING_CV_REVIEW', 'CV_REVIEW_IN_PROGRESS', 'ADDITIONAL_INFO_REQUIRED'].includes(current.status)) throw new UnprocessableError(ErrorCode.SCREENING_INVALID_TRANSITION, 'Additional information cannot be requested in this state.');
    const changed = await tx.applicationScreening.updateMany({ where: { id: current.id, updatedAt: input.expectedUpdatedAt }, data: { status: 'ADDITIONAL_INFO_REQUIRED', version: { increment: 1 } } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The screening changed. Refresh and try again.');
    await tx.screeningInformationRequest.create({ data: { screeningId: current.id, requestedById: auth.userId, message: input.message } });
    await history(tx, current.id, auth.userId, current.status, 'ADDITIONAL_INFO_REQUIRED', 'INFORMATION_REQUESTED', input.reason);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_INFO_REQUESTED, aggregateType: 'ApplicationScreening', aggregateId: current.id, organisationId: current.application.organisationId, payload: { applicationId, screeningId: current.id, talentProfileId: current.application.talentProfileId } });
    return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.id }, include: ADMIN_INCLUDE });
  });
}

async function activePlatformInterviewer(userId: string): Promise<boolean> {
  return (await getPrisma().user.count({ where: { id: userId, status: 'ACTIVE', platformRoleAssignments: { some: { revokedAt: null, role: { permissions: { some: { permission: { key: 'screening:interview_decide' } } } } } } } })) > 0;
}

export async function scheduleInterview(auth: AuthContext, applicationId: string, input: ScheduleScreeningInterviewInput) {
  requirePermission(auth, 'screening:interview_manage');
  if (input.scheduledEndAt <= input.scheduledStartAt) throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The interview must end after it starts.');
  if (!(await activePlatformInterviewer(input.interviewerId))) throw new NotFoundError(ErrorCode.SCREENING_REVIEWER_REQUIRED, 'That active interviewer was not found.');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.applicationScreening.findUnique({ where: { applicationId }, include: { application: { select: { organisationId: true, talentProfileId: true } } } });
    if (!current) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
    if (!['CV_APPROVED', 'INTERVIEW_COMPLETED'].includes(current.status)) throw new UnprocessableError(ErrorCode.SCREENING_INVALID_TRANSITION, 'The submitted CV must be approved before scheduling an Oreno interview.');
    const changed = await tx.applicationScreening.updateMany({ where: { id: current.id, updatedAt: input.expectedUpdatedAt }, data: { status: 'INTERVIEW_SCHEDULED', version: { increment: 1 } } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The screening changed. Refresh and try again.');
    const attempt = await tx.screeningInterview.count({ where: { screeningId: current.id } });
    const interview = await tx.screeningInterview.create({ data: { screeningId: current.id, interviewerId: input.interviewerId, mode: input.mode, scheduledStartAt: input.scheduledStartAt, scheduledEndAt: input.scheduledEndAt, timeZone: input.timeZone, meetingUrl: input.meetingUrl, location: input.location, attempt: attempt + 1 } });
    await history(tx, current.id, auth.userId, current.status, 'INTERVIEW_SCHEDULED', 'INTERVIEW_SCHEDULED', input.reason);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_INTERVIEW_SCHEDULED, aggregateType: 'ScreeningInterview', aggregateId: interview.id, organisationId: current.application.organisationId, payload: { applicationId, screeningId: current.id, screeningInterviewId: interview.id, talentProfileId: current.application.talentProfileId } });
    return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.id }, include: ADMIN_INCLUDE });
  });
}

export async function updateInterview(auth: AuthContext, interviewId: string, input: UpdateScreeningInterviewInput) {
  requirePermission(auth, 'screening:interview_manage');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.screeningInterview.findUnique({ where: { id: interviewId }, include: { screening: { include: { application: { select: { organisationId: true, talentProfileId: true, id: true } } } } } });
    if (!current) throw new NotFoundError(ErrorCode.INTERVIEW_NOT_FOUND, 'That Oreno interview was not found.');
    if (!['SCHEDULED', 'RESCHEDULED'].includes(current.status)) throw new UnprocessableError(ErrorCode.INTERVIEW_INVALID_TRANSITION, 'That Oreno interview can no longer be changed.');
    const start = input.scheduledStartAt ?? current.scheduledStartAt; const end = input.scheduledEndAt ?? current.scheduledEndAt;
    if (end <= start) throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The interview must end after it starts.');
    const { expectedUpdatedAt, reason, ...data } = input;
    const changed = await tx.screeningInterview.updateMany({ where: { id: interviewId, updatedAt: expectedUpdatedAt }, data: { ...data, status: 'RESCHEDULED', rescheduleReason: reason } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The interview changed. Refresh and try again.');
    await history(tx, current.screeningId, auth.userId, current.screening.status, current.screening.status, 'INTERVIEW_RESCHEDULED', reason);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_INTERVIEW_UPDATED, aggregateType: 'ScreeningInterview', aggregateId: interviewId, organisationId: current.screening.application.organisationId, payload: { applicationId: current.screening.application.id, screeningId: current.screeningId, screeningInterviewId: interviewId, talentProfileId: current.screening.application.talentProfileId } });
    return tx.screeningInterview.findUniqueOrThrow({ where: { id: interviewId }, include: { interviewer: { select: { id: true, displayName: true, firstName: true, lastName: true } } } });
  });
}

export async function cancelInterview(auth: AuthContext, interviewId: string, input: { expectedUpdatedAt: Date; reason: string }) {
  requirePermission(auth, 'screening:interview_manage');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.screeningInterview.findUnique({ where: { id: interviewId }, include: { screening: { include: { application: { select: { id: true, organisationId: true, talentProfileId: true } } } } } });
    if (!current) throw new NotFoundError(ErrorCode.INTERVIEW_NOT_FOUND, 'That Oreno interview was not found.');
    const changed = await tx.screeningInterview.updateMany({ where: { id: interviewId, updatedAt: input.expectedUpdatedAt, status: { in: ['SCHEDULED', 'RESCHEDULED'] } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The interview changed or cannot be cancelled.');
    await tx.applicationScreening.update({ where: { id: current.screeningId }, data: { status: 'CV_APPROVED', version: { increment: 1 } } });
    await history(tx, current.screeningId, auth.userId, current.screening.status, 'CV_APPROVED', 'INTERVIEW_CANCELLED', input.reason);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_INTERVIEW_UPDATED, aggregateType: 'ScreeningInterview', aggregateId: interviewId, organisationId: current.screening.application.organisationId, payload: { applicationId: current.screening.application.id, screeningId: current.screeningId, screeningInterviewId: interviewId, talentProfileId: current.screening.application.talentProfileId } });
    return tx.screeningInterview.findUniqueOrThrow({ where: { id: interviewId } });
  });
}

export async function recordInterviewOutcome(auth: AuthContext, interviewId: string, input: ScreeningInterviewOutcomeInput) {
  requirePermission(auth, 'screening:interview_decide');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.screeningInterview.findUnique({ where: { id: interviewId }, include: { screening: { include: { application: { select: { id: true, organisationId: true, talentProfileId: true } } } } } });
    if (!current) throw new NotFoundError(ErrorCode.INTERVIEW_NOT_FOUND, 'That Oreno interview was not found.');
    if (current.interviewerId !== auth.userId && !auth.platformPermissions.has('screening:release')) throw new ForbiddenError(ErrorCode.RESOURCE_ACCESS_DENIED, 'This interview is assigned to another interviewer.');
    const changed = await tx.screeningInterview.updateMany({ where: { id: interviewId, updatedAt: input.expectedUpdatedAt, status: { in: ['SCHEDULED', 'RESCHEDULED'] } }, data: { status: input.outcome === 'FAILED' && input.reason.toLowerCase().includes('no-show') ? 'NO_SHOW' : 'COMPLETED', completedAt: new Date(), outcome: input.outcome, rubric: input.rubric, privateNotes: input.privateNotes, candidateVisibleFeedback: input.candidateVisibleFeedback, recordedById: auth.userId, recordedAt: new Date() } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The interview changed or cannot be completed.');
    const next: ApplicationScreeningStatus = input.outcome === 'PASSED' ? 'FINAL_REVIEW_PENDING' : input.outcome === 'FAILED' ? 'NOT_SELECTED' : 'INTERVIEW_COMPLETED';
    await tx.applicationScreening.update({ where: { id: current.screeningId }, data: { status: next, version: { increment: 1 }, failureReason: input.outcome === 'FAILED' ? input.candidateVisibleFeedback ?? input.reason : null } });
    await history(tx, current.screeningId, auth.userId, current.screening.status, next, 'INTERVIEW_DECIDED', input.reason);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_INTERVIEW_DECIDED, aggregateType: 'ScreeningInterview', aggregateId: interviewId, organisationId: current.screening.application.organisationId, payload: { applicationId: current.screening.application.id, screeningId: current.screeningId, screeningInterviewId: interviewId, talentProfileId: current.screening.application.talentProfileId } });
    return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.screeningId }, include: ADMIN_INCLUDE });
  });
}

export async function finalDecision(auth: AuthContext, applicationId: string, input: FinalScreeningDecisionInput) {
  requirePermission(auth, 'screening:final_decide');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.applicationScreening.findUnique({ where: { applicationId }, include: { application: { include: { job: true, talentProfile: { include: { user: true } } } }, cvReviews: { orderBy: { createdAt: 'desc' }, take: 1 }, interviews: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!current) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
    if (!['FINAL_REVIEW_PENDING', 'INTERVIEW_COMPLETED'].includes(current.status)) throw new UnprocessableError(ErrorCode.SCREENING_INVALID_TRANSITION, 'That screening is not ready for a final decision.');
    if (input.decision === 'APPROVED' && (current.cvReviews[0]?.decision !== 'APPROVED' || current.cvReviews[0]?.fileId !== current.currentCvFileId || current.interviews[0]?.outcome !== 'PASSED')) throw new UnprocessableError(ErrorCode.SCREENING_RELEASE_NOT_ELIGIBLE, 'Final approval requires the current CV and Oreno interview to have passed.');
    const next: ApplicationScreeningStatus = input.decision === 'APPROVED' ? 'APPROVED_FOR_SUBMISSION' : input.decision === 'NOT_SELECTED' ? 'NOT_SELECTED' : 'FINAL_REVIEW_PENDING';
    const changed = await tx.applicationScreening.updateMany({ where: { id: current.id, updatedAt: input.expectedUpdatedAt }, data: { status: next, version: { increment: 1 }, finalDecision: input.decision, finalDecidedById: auth.userId, finalDecidedAt: new Date(), candidateMessage: input.candidateMessage, employerSummary: input.decision === 'APPROVED' ? input.employerSummary : null, approvedAt: input.decision === 'APPROVED' ? new Date() : null, failureReason: input.decision === 'NOT_SELECTED' ? input.candidateMessage ?? input.reason : null } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The screening changed. Refresh and try again.');
    await history(tx, current.id, auth.userId, current.status, next, 'FINAL_DECIDED', input.reason);
    await recordAdministrativeAction({ action: 'STATUS_CHANGE', resourceType: 'ApplicationScreening', resourceId: current.id, organisationId: current.application.organisationId, summary: `Recorded final screening decision ${input.decision}`, reason: input.reason }, tx);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_FINAL_DECIDED, aggregateType: 'ApplicationScreening', aggregateId: current.id, organisationId: current.application.organisationId, payload: { applicationId, screeningId: current.id, talentProfileId: current.application.talentProfileId } });
    return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.id }, include: ADMIN_INCLUDE });
  });
}

export async function releaseToCompany(auth: AuthContext, applicationId: string, input: ReleaseScreeningInput) {
  requirePermission(auth, 'screening:release');
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.applicationScreening.findUnique({ where: { applicationId }, include: { application: { include: { job: true, organisation: true, talentProfile: { include: { user: true } } } } } });
    if (!current || current.application.organisationId !== input.organisationId) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
    if (current.status === 'RELEASED_TO_COMPANY') return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.id }, include: ADMIN_INCLUDE });
    if (current.status !== 'APPROVED_FOR_SUBMISSION' || current.finalDecision !== 'APPROVED' || !current.approvedAt) throw new UnprocessableError(ErrorCode.SCREENING_RELEASE_NOT_ELIGIBLE, 'This applicant has not completed final human approval.');
    if (current.application.status === 'WITHDRAWN' || current.application.job.status !== 'PUBLISHED' || current.application.job.moderationStatus === 'REMOVED' || current.application.organisation.status !== 'ACTIVE' || current.application.talentProfile.user.status !== 'ACTIVE') throw new UnprocessableError(ErrorCode.SCREENING_RELEASE_NOT_ELIGIBLE, 'The application, vacancy, organisation, or applicant is no longer eligible for release.');
    const changed = await tx.applicationScreening.updateMany({ where: { id: current.id, updatedAt: input.expectedUpdatedAt, status: 'APPROVED_FOR_SUBMISSION', releasedToCompanyAt: null }, data: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: new Date(), releasedById: auth.userId, version: { increment: 1 } } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The screening changed. Refresh and try again.');
    let shortlist = await tx.shortlist.findFirst({ where: { organisationId: input.organisationId, jobId: current.application.jobId, kind: 'ORENO_CURATED', archivedAt: null } });
    shortlist ??= await tx.shortlist.create({ data: { organisationId: input.organisationId, jobId: current.application.jobId, name: `Oreno screened — ${current.application.job.title}`, kind: 'ORENO_CURATED', description: 'Candidates explicitly released by Oreno after human screening.', createdById: auth.userId } });
    await tx.shortlistCandidate.upsert({ where: { shortlistId_talentProfileId: { shortlistId: shortlist.id, talentProfileId: current.application.talentProfileId } }, create: { shortlistId: shortlist.id, talentProfileId: current.application.talentProfileId, applicationId, addedById: auth.userId }, update: { applicationId, removedAt: null, addedById: auth.userId } });
    await history(tx, current.id, auth.userId, current.status, 'RELEASED_TO_COMPANY', 'RELEASED_TO_COMPANY', input.reason);
    await recordAdministrativeAction({ action: 'STATUS_CHANGE', resourceType: 'ApplicationScreening', resourceId: current.id, organisationId: input.organisationId, summary: `Released applicant to ${current.application.organisation.name}`, reason: input.reason }, tx);
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_RELEASED_TO_COMPANY, aggregateType: 'ApplicationScreening', aggregateId: current.id, organisationId: input.organisationId, payload: { applicationId, screeningId: current.id, talentProfileId: current.application.talentProfileId, organisationId: input.organisationId } });
    return tx.applicationScreening.findUniqueOrThrow({ where: { id: current.id }, include: ADMIN_INCLUDE });
  });
}

export async function getHistory(auth: AuthContext, applicationId: string) {
  requirePermission(auth, 'screening:audit_read');
  const screening = await getPrisma().applicationScreening.findUnique({ where: { applicationId }, select: { id: true } });
  if (!screening) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
  return getPrisma().screeningStatusHistory.findMany({ where: { screeningId: screening.id }, include: { actor: { select: { id: true, displayName: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } });
}

export async function getMyScreening(auth: AuthContext, applicationId: string) {
  const screening = await getPrisma().applicationScreening.findFirst({ where: { applicationId, application: { talentProfile: { userId: auth.userId } } }, select: { applicationId: true, status: true, candidateMessage: true, failureReason: true, approvedAt: true, releasedToCompanyAt: true, updatedAt: true, history: { select: { toStatus: true, action: true, reason: true, createdAt: true }, orderBy: { createdAt: 'asc' } }, informationRequests: { select: { id: true, message: true, respondedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } }, interviews: { select: { id: true, status: true, mode: true, scheduledStartAt: true, scheduledEndAt: true, timeZone: true, meetingUrl: true, location: true, candidateVisibleFeedback: true, outcome: true, updatedAt: true }, orderBy: { scheduledStartAt: 'desc' } }, application: { select: { job: { select: { id: true, title: true, organisation: { select: { id: true, name: true } } } } } } } });
  if (!screening) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'That screening application was not found.');
  return screening;
}

export async function listMyScreeningInterviews(auth: AuthContext, query: { page: number; pageSize: number }) {
  const where: Prisma.ScreeningInterviewWhereInput = { screening: { application: { talentProfile: { userId: auth.userId } } } };
  const prisma = getPrisma(); const [items, total] = await Promise.all([
    prisma.screeningInterview.findMany({ where, select: { id: true, status: true, mode: true, scheduledStartAt: true, scheduledEndAt: true, timeZone: true, meetingUrl: true, location: true, candidateVisibleFeedback: true, outcome: true, updatedAt: true, screening: { select: { applicationId: true, application: { select: { job: { select: { id: true, title: true, organisation: { select: { id: true, name: true } } } } } } } } }, orderBy: { scheduledStartAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.screeningInterview.count({ where }),
  ]); return { items, total };
}

export async function submitRequestedInformation(auth: AuthContext, applicationId: string, input: { expectedUpdatedAt: Date; responseText?: string | null; responseFileId?: string | null }) {
  if (!input.responseText && !input.responseFileId) throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'Provide a response or a replacement document.');
  await getPrisma().$transaction(async (tx) => {
    const current = await tx.applicationScreening.findFirst({ where: { applicationId, application: { talentProfile: { userId: auth.userId } } }, include: { informationRequests: { where: { respondedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 }, application: { select: { organisationId: true, talentProfileId: true } } } });
    if (!current || current.status !== 'ADDITIONAL_INFO_REQUIRED' || !current.informationRequests[0]) throw new NotFoundError(ErrorCode.SCREENING_NOT_FOUND, 'There is no open information request for that application.');
    let replacementCv = false;
    if (input.responseFileId) {
      const file = await tx.fileObject.findFirst({ where: { id: input.responseFileId, ownerId: auth.userId, status: 'READY' } });
      if (!file) throw new NotFoundError(ErrorCode.FILE_NOT_READY, 'That response file is not ready.');
      replacementCv = file.category === 'CV';
      if (replacementCv) await tx.applicationAttachment.upsert({ where: { applicationId_fileId: { applicationId, fileId: file.id } }, create: { applicationId, fileId: file.id, kind: 'CV', label: file.originalName }, update: {} });
    }
    const changed = await tx.applicationScreening.updateMany({ where: { id: current.id, updatedAt: input.expectedUpdatedAt }, data: { status: 'PENDING_CV_REVIEW', ...(replacementCv ? { currentCvFileId: input.responseFileId! } : {}), version: { increment: 1 }, assignedReviewerId: null } });
    if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The screening changed. Refresh and try again.');
    await tx.screeningInformationRequest.update({ where: { id: current.informationRequests[0].id }, data: { responseText: input.responseText, responseFileId: input.responseFileId, respondedAt: new Date() } });
    await history(tx, current.id, auth.userId, current.status, 'PENDING_CV_REVIEW', 'INFORMATION_SUBMITTED', replacementCv ? 'Applicant submitted a replacement CV.' : 'Applicant responded to the information request.');
    await emitEvent(tx, { eventKey: EVENT_KEYS.SCREENING_INFO_SUBMITTED, aggregateType: 'ApplicationScreening', aggregateId: current.id, organisationId: current.application.organisationId, payload: { applicationId, screeningId: current.id, talentProfileId: current.application.talentProfileId } });
  });
  return getMyScreening(auth, applicationId);
}

export async function recordSensitiveCvAccess(auth: AuthContext, applicationId: string): Promise<void> {
  requirePermission(auth, 'screening:read');
  const screening = await screeningOrThrow(applicationId);
  await recordAudit({ action: 'ACCESS', resourceType: 'ApplicationScreeningCv', resourceId: screening.currentCvFileId, organisationId: screening.application.organisationId, actorId: auth.userId, summary: 'Accessed a submitted CV for recruitment screening' });
}
