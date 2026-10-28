import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { loadConfig } from '../../config/index.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { recordAudit } from '../../platform/audit/audit.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import { invalidateUser } from '../../platform/rbac/rbac.service.js';
import type { AuthContext } from '../auth/index.js';
import { assertOrganisationAccess, assertOrganisationMutation } from '../organisations/organisation.policy.js';
import type { CreateInterviewInput, CreateOfferInput, UpdateInterviewInput, UpdateOfferInput } from './pipeline.schema.js';
import { releasedToOrganisationWhere } from '../application-screening/screening.policy.js';

const INTERVIEW_INCLUDE = {
  job: { select: { id: true, title: true, reference: true } },
  application: { select: { id: true, status: true, talentProfileId: true } },
  participants: true,
  outcome: true,
  notes: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.InterviewInclude;

const OFFER_INCLUDE = {
  organisation: { select: { id: true, name: true, slug: true, logoFileId: true } },
  job: { select: { id: true, title: true, reference: true } },
  application: { select: { id: true, status: true } },
  talentProfile: { select: { id: true, userId: true, headline: true, user: { select: { firstName: true, lastName: true, displayName: true, avatarFileId: true } } } },
  terms: { orderBy: { position: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  placement: { include: { staffAssignment: true } },
} satisfies Prisma.OfferInclude;

function reference(prefix: string): string {
  return `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

async function validateParticipants(organisationId: string, participantIds: string[]): Promise<void> {
  const unique = [...new Set(participantIds)];
  if (!unique.length) return;
  const count = await getPrisma().organisationMembership.count({ where: { organisationId, userId: { in: unique }, status: 'ACTIVE' } });
  if (count !== unique.length) throw new NotFoundError(ErrorCode.MEMBERSHIP_NOT_FOUND, 'One or more interview participants were not found.');
}

export async function createInterview(auth: AuthContext, organisationId: string, input: CreateInterviewInput) {
  assertOrganisationMutation(auth, organisationId, 'interview:schedule');
  if (input.scheduledEndAt <= input.scheduledStartAt) throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The interview must end after it starts.');
  await validateParticipants(organisationId, input.participants.flatMap((item) => item.userId ? [item.userId] : []));
  const application = await getPrisma().application.findFirst({ where: { id: input.applicationId, ...releasedToOrganisationWhere(organisationId) }, select: { id: true, jobId: true, talentProfileId: true, status: true } });
  if (!application) throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
  const { participants, ...data } = input;
  return getPrisma().$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        ...data,
        organisationId,
        jobId: application.jobId,
        createdById: auth.userId,
        participants: { create: [{ talentProfileId: application.talentProfileId, role: 'CANDIDATE', isRequired: true }, ...participants.map((item) => ({ userId: item.userId ?? null, role: item.role, isRequired: item.isRequired }))] },
      },
      include: INTERVIEW_INCLUDE,
    });
    if (!['INTERVIEWING', 'OFFER_PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'].includes(application.status)) {
      await tx.application.update({ where: { id: application.id }, data: { status: 'INTERVIEWING' } });
      await tx.applicationStatusHistory.create({ data: { applicationId: application.id, fromStatus: application.status, toStatus: 'INTERVIEWING', changedById: auth.userId, reason: 'Interview scheduled' } });
    }
    await emitEvent(tx, { eventKey: EVENT_KEYS.INTERVIEW_SCHEDULED, aggregateType: 'Interview', aggregateId: interview.id, organisationId, payload: { interviewId: interview.id, applicationId: application.id, organisationId } });
    return interview;
  });
}

export async function listInterviews(auth: AuthContext, organisationId: string, query: { page: number; pageSize: number; status?: Prisma.EnumInterviewStatusFilter<'Interview'> | string; applicationId?: string }) {
  assertOrganisationAccess(auth, organisationId, 'interview:read');
  const where: Prisma.InterviewWhereInput = { organisationId, application: releasedToOrganisationWhere(organisationId), ...(typeof query.status === 'string' ? { status: query.status as never } : {}), ...(query.applicationId ? { applicationId: query.applicationId } : {}) };
  const prisma = getPrisma(); const [items, total] = await Promise.all([
    prisma.interview.findMany({ where, include: INTERVIEW_INCLUDE, orderBy: { scheduledStartAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.interview.count({ where }),
  ]); return { items, total };
}

export async function updateInterview(auth: AuthContext, organisationId: string, interviewId: string, input: UpdateInterviewInput) {
  assertOrganisationMutation(auth, organisationId, 'interview:update'); const { expectedUpdatedAt, ...data } = input;
  const current = await getPrisma().interview.findFirst({ where: { id: interviewId, organisationId, application: releasedToOrganisationWhere(organisationId) } }); if (!current) throw new NotFoundError(ErrorCode.INTERVIEW_NOT_FOUND, 'That interview was not found.');
  if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(current.status)) throw new UnprocessableError(ErrorCode.INTERVIEW_INVALID_TRANSITION, 'That interview can no longer be changed.');
  const start = input.scheduledStartAt ?? current.scheduledStartAt; const end = input.scheduledEndAt ?? current.scheduledEndAt; if (end <= start) throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The interview must end after it starts.');
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.interview.updateMany({ where: { id: interviewId, organisationId, updatedAt: expectedUpdatedAt, application: releasedToOrganisationWhere(organisationId) }, data: { ...data, ...(input.scheduledStartAt || input.scheduledEndAt ? { status: 'RESCHEDULED' } : {}) } }); if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The interview changed. Refresh and try again.');
    await emitEvent(tx, { eventKey: EVENT_KEYS.INTERVIEW_UPDATED, aggregateType: 'Interview', aggregateId: interviewId, organisationId, payload: { interviewId, organisationId } });
    return tx.interview.findUniqueOrThrow({ where: { id: interviewId }, include: INTERVIEW_INCLUDE });
  });
}

export async function cancelInterview(auth: AuthContext, organisationId: string, interviewId: string, expectedUpdatedAt: Date, reason: string) {
  assertOrganisationMutation(auth, organisationId, 'interview:cancel');
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.interview.updateMany({ where: { id: interviewId, organisationId, updatedAt: expectedUpdatedAt, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] }, application: releasedToOrganisationWhere(organisationId) }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } }); if (!changed.count) throw new UnprocessableError(ErrorCode.INTERVIEW_INVALID_TRANSITION, 'The interview changed or cannot be cancelled.');
    await emitEvent(tx, { eventKey: EVENT_KEYS.INTERVIEW_CANCELLED, aggregateType: 'Interview', aggregateId: interviewId, organisationId, payload: { interviewId, organisationId } });
    return tx.interview.findUniqueOrThrow({ where: { id: interviewId }, include: INTERVIEW_INCLUDE });
  });
}

export async function recordOutcome(auth: AuthContext, organisationId: string, interviewId: string, input: { expectedUpdatedAt: Date; result: 'PASSED' | 'FAILED' | 'ON_HOLD' | 'WITHDRAWN'; summary?: string | null }) {
  assertOrganisationMutation(auth, organisationId, 'interview:record_outcome');
  return getPrisma().$transaction(async (tx) => {
    const changed = await tx.interview.updateMany({ where: { id: interviewId, organisationId, updatedAt: input.expectedUpdatedAt, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] }, application: releasedToOrganisationWhere(organisationId) }, data: { status: 'COMPLETED', completedAt: new Date() } }); if (!changed.count) throw new UnprocessableError(ErrorCode.INTERVIEW_INVALID_TRANSITION, 'The interview changed or cannot be completed.');
    await tx.interviewOutcome.upsert({ where: { interviewId }, create: { interviewId, result: input.result, summary: input.summary ?? null, recordedById: auth.userId }, update: { result: input.result, summary: input.summary ?? null, recordedById: auth.userId, recordedAt: new Date() } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.INTERVIEW_OUTCOME_RECORDED, aggregateType: 'Interview', aggregateId: interviewId, organisationId, payload: { interviewId, organisationId } });
    return tx.interview.findUniqueOrThrow({ where: { id: interviewId }, include: INTERVIEW_INCLUDE });
  });
}

export async function listMyInterviews(auth: AuthContext, query: { page: number; pageSize: number }) {
  const profile = await getPrisma().talentProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } }); if (!profile) throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent profile was not found.');
  const where: Prisma.InterviewWhereInput = { participants: { some: { talentProfileId: profile.id } } }; const prisma = getPrisma(); const [items, total] = await Promise.all([prisma.interview.findMany({ where, select: { id: true, stage: true, status: true, mode: true, scheduledStartAt: true, scheduledEndAt: true, timeZone: true, meetingUrl: true, location: true, job: { select: { id: true, title: true, organisation: { select: { id: true, name: true } } } }, outcome: { select: { result: true, summary: true, recordedAt: true } } }, orderBy: { scheduledStartAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.interview.count({ where })]); return { items, total };
}

export async function createOffer(auth: AuthContext, organisationId: string, input: CreateOfferInput) {
  assertOrganisationMutation(auth, organisationId, 'offer:create'); const application = await getPrisma().application.findFirst({ where: { id: input.applicationId, ...releasedToOrganisationWhere(organisationId), status: { notIn: ['REJECTED', 'WITHDRAWN', 'ACCEPTED'] } }, select: { id: true, jobId: true, talentProfileId: true, status: true } }); if (!application) throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
  const { terms, ...data } = input;
  return getPrisma().$transaction(async (tx) => {
    const offer = await tx.offer.create({ data: { ...data, organisationId, jobId: application.jobId, talentProfileId: application.talentProfileId, createdById: auth.userId, reference: reference('ORO'), terms: { create: terms }, statusHistory: { create: { toStatus: 'DRAFT', changedById: auth.userId, reason: 'Offer drafted' } } }, include: OFFER_INCLUDE });
    await tx.application.update({ where: { id: application.id }, data: { status: 'OFFER_PENDING' } }); await tx.applicationStatusHistory.create({ data: { applicationId: application.id, fromStatus: application.status, toStatus: 'OFFER_PENDING', changedById: auth.userId, reason: 'Offer drafted' } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.OFFER_CREATED, aggregateType: 'Offer', aggregateId: offer.id, organisationId, payload: { offerId: offer.id, applicationId: application.id, organisationId } }); return offer;
  });
}

export async function updateOffer(auth: AuthContext, organisationId: string, offerId: string, input: UpdateOfferInput) {
  assertOrganisationMutation(auth, organisationId, 'offer:update'); const { expectedUpdatedAt, terms, ...data } = input;
  return getPrisma().$transaction(async (tx) => { const changed = await tx.offer.updateMany({ where: { id: offerId, organisationId, status: 'DRAFT', updatedAt: expectedUpdatedAt, application: releasedToOrganisationWhere(organisationId) }, data }); if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The offer changed or is no longer a draft.'); if (terms) { await tx.offerTerm.deleteMany({ where: { offerId } }); await tx.offerTerm.createMany({ data: terms.map((term) => ({ ...term, offerId })) }); } return tx.offer.findUniqueOrThrow({ where: { id: offerId }, include: OFFER_INCLUDE }); });
}

export async function listOffers(auth: AuthContext, organisationId: string, query: { page: number; pageSize: number; status?: string }) {
  assertOrganisationAccess(auth, organisationId, 'offer:read'); const where: Prisma.OfferWhereInput = { organisationId, application: releasedToOrganisationWhere(organisationId), ...(query.status ? { status: query.status as never } : {}) }; const prisma = getPrisma(); const [items, total] = await Promise.all([prisma.offer.findMany({ where, include: OFFER_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.offer.count({ where })]); return { items, total };
}

export async function sendOffer(auth: AuthContext, organisationId: string, offerId: string, expectedUpdatedAt: Date) {
  assertOrganisationMutation(auth, organisationId, 'offer:send');
  return getPrisma().$transaction(async (tx) => { const current = await tx.offer.findFirst({ where: { id: offerId, organisationId, application: releasedToOrganisationWhere(organisationId) }, include: { terms: true } }); if (!current) throw new NotFoundError(ErrorCode.OFFER_NOT_FOUND, 'That offer was not found.'); const compensation = current.terms.find((term) => term.key === 'base_compensation'); const ordinaryHours = current.terms.find((term) => term.key === 'ordinary_hours_per_period'); const needsHours = compensation?.rateUnit && compensation.rateUnit !== 'HOURLY'; if (current.status !== 'DRAFT' || !current.startDate || !current.expiresAt || current.expiresAt <= new Date() || !compensation?.valueAmount || !compensation.currency || !compensation.rateUnit || (needsHours && !ordinaryHours?.valueAmount)) throw new UnprocessableError(ErrorCode.OFFER_INVALID_TRANSITION, 'The offer needs a valid base_compensation, any required ordinary_hours_per_period, a start date, and a future expiry before sending.'); const changed = await tx.offer.updateMany({ where: { id: offerId, organisationId, status: 'DRAFT', updatedAt: expectedUpdatedAt, application: releasedToOrganisationWhere(organisationId) }, data: { status: 'SENT', sentAt: new Date() } }); if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The offer changed. Refresh and try again.'); await tx.offerStatusHistory.create({ data: { offerId, fromStatus: current.status, toStatus: 'SENT', changedById: auth.userId, reason: 'Offer sent' } }); await emitEvent(tx, { eventKey: EVENT_KEYS.OFFER_SENT, aggregateType: 'Offer', aggregateId: offerId, organisationId, payload: { offerId, applicationId: current.applicationId, talentProfileId: current.talentProfileId, organisationId } }); return tx.offer.findUniqueOrThrow({ where: { id: offerId }, include: OFFER_INCLUDE }); });
}

export async function withdrawOffer(auth: AuthContext, organisationId: string, offerId: string, expectedUpdatedAt: Date, reason?: string) {
  assertOrganisationMutation(auth, organisationId, 'offer:withdraw'); return getPrisma().$transaction(async (tx) => { const current = await tx.offer.findFirst({ where: { id: offerId, organisationId, application: releasedToOrganisationWhere(organisationId) } }); if (!current || !['DRAFT','SENT','VIEWED'].includes(current.status)) throw new UnprocessableError(ErrorCode.OFFER_INVALID_TRANSITION, 'The offer changed or cannot be withdrawn.'); const changed = await tx.offer.updateMany({ where: { id: offerId, organisationId, updatedAt: expectedUpdatedAt, status: current.status, application: releasedToOrganisationWhere(organisationId) }, data: { status: 'WITHDRAWN', declineReason: reason ?? null } }); if (!changed.count) throw new ConflictError(ErrorCode.STALE_WRITE, 'The offer changed. Refresh and try again.'); await tx.offerStatusHistory.create({ data: { offerId, fromStatus: current.status, toStatus: 'WITHDRAWN', changedById: auth.userId, reason } }); return tx.offer.findUniqueOrThrow({ where: { id: offerId }, include: OFFER_INCLUDE }); });
}

export async function listMyOffers(auth: AuthContext, query: { page: number; pageSize: number; status?: string }) {
  const profile = await getPrisma().talentProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } }); if (!profile) throw new NotFoundError(ErrorCode.TALENT_PROFILE_NOT_FOUND, 'Your talent profile was not found.'); const where: Prisma.OfferWhereInput = { talentProfileId: profile.id, status: query.status ? query.status as never : { not: 'DRAFT' } }; const prisma = getPrisma(); const [items, total] = await Promise.all([prisma.offer.findMany({ where, include: OFFER_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.offer.count({ where })]); return { items, total };
}

export async function respondToOffer(auth: AuthContext, offerId: string, response: 'ACCEPT' | 'DECLINE', declineReason?: string) {
  const prisma = getPrisma(); const profile = await prisma.talentProfile.findUnique({ where: { userId: auth.userId }, select: { id: true, userId: true } }); if (!profile) throw new NotFoundError(ErrorCode.OFFER_NOT_FOUND, 'That offer was not found.');
  const expiring = await prisma.offer.findFirst({ where: { id: offerId, talentProfileId: profile.id, status: { in: ['SENT', 'VIEWED'] }, expiresAt: { lte: new Date() } }, select: { id: true, status: true, organisationId: true } });
  if (expiring) { await prisma.$transaction(async (tx) => { await tx.offer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } }); await tx.offerStatusHistory.create({ data: { offerId, fromStatus: expiring.status, toStatus: 'EXPIRED', changedById: auth.userId, reason: 'Offer expired before response' } }); await emitEvent(tx, { eventKey: EVENT_KEYS.OFFER_EXPIRED, aggregateType: 'Offer', aggregateId: offerId, organisationId: expiring.organisationId, payload: { offerId, talentProfileId: profile.id, organisationId: expiring.organisationId } }); }); throw new UnprocessableError(ErrorCode.OFFER_EXPIRED, 'That offer has expired.'); }
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findFirst({ where: { id: offerId, talentProfileId: profile.id }, include: { terms: true, placement: { include: { staffAssignment: { include: { payAgreements: true } } } } } }); if (!offer) throw new NotFoundError(ErrorCode.OFFER_NOT_FOUND, 'That offer was not found.');
    if (offer.status === 'ACCEPTED' && offer.placement?.staffAssignment) return { offer, placement: offer.placement, staffAssignment: offer.placement.staffAssignment };
    if (!['SENT', 'VIEWED'].includes(offer.status)) throw new UnprocessableError(ErrorCode.OFFER_ALREADY_RESPONDED, 'That offer can no longer be answered.');
    if (response === 'DECLINE') { if (!declineReason) throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'A decline reason is required.'); const updated = await tx.offer.update({ where: { id: offerId }, data: { status: 'DECLINED', respondedAt: new Date(), declineReason } }); await tx.offerStatusHistory.create({ data: { offerId, fromStatus: offer.status, toStatus: 'DECLINED', changedById: auth.userId, reason: declineReason } }); await emitEvent(tx, { eventKey: EVENT_KEYS.OFFER_RESPONDED, aggregateType: 'Offer', aggregateId: offerId, organisationId: offer.organisationId, payload: { offerId, applicationId: offer.applicationId, talentProfileId: profile.id, organisationId: offer.organisationId } }); return { offer: updated, placement: null, staffAssignment: null }; }
    if (!offer.startDate) throw new UnprocessableError(ErrorCode.OFFER_INVALID_TRANSITION, 'The accepted offer needs a start date.');
    const now = new Date(); const start = offer.startDate; const active = start <= now;
    const updated = await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: now } });
    await tx.offerStatusHistory.create({ data: { offerId, fromStatus: offer.status, toStatus: 'ACCEPTED', changedById: auth.userId, reason: 'Talent accepted offer' } });
    await tx.application.update({ where: { id: offer.applicationId }, data: { status: 'ACCEPTED', decidedAt: now } });
    const compensation = offer.terms.find((term) => term.key === 'base_compensation'); const ordinaryHours = offer.terms.find((term) => term.key === 'ordinary_hours_per_period'); if (!compensation?.valueAmount || !compensation.currency || !compensation.rateUnit) throw new UnprocessableError(ErrorCode.OFFER_INVALID_TRANSITION, 'The offer has no valid base compensation snapshot.');
    const replacementWindowDays = loadConfig().policy.replacementWindowDays;
    const placement = await tx.placement.create({ data: { organisationId: offer.organisationId, offerId, jobId: offer.jobId, talentProfileId: profile.id, status: active ? 'ACTIVE' : 'PENDING', reference: reference('ORP'), title: offer.title, startDate: start, replacementEligibleUntil: new Date(start.getTime() + replacementWindowDays * 24 * 60 * 60 * 1000), statusHistory: { create: { toStatus: active ? 'ACTIVE' : 'PENDING', changedById: auth.userId, reason: 'Offer accepted' } } } });
    const staffAssignment = await tx.staffAssignment.create({ data: { organisationId: offer.organisationId, placementId: placement.id, talentProfileId: profile.id, employeeCode: `OR-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`, status: active ? 'ACTIVE' : 'PENDING', jobTitle: offer.title, employmentType: offer.employmentType, workArrangement: offer.workArrangement, effectiveFrom: start } });
    const payAgreement = await tx.payAgreement.create({ data: { organisationId: offer.organisationId, staffAssignmentId: staffAssignment.id, talentProfileId: profile.id, status: active ? 'ACTIVE' : 'DRAFT', basis: compensation.rateUnit === 'YEARLY' ? 'ANNUAL' : compensation.rateUnit, rateAmount: compensation.valueAmount, currency: compensation.currency, ordinaryHoursPerPeriod: ordinaryHours?.valueAmount ?? null, effectiveFrom: start, createdById: offer.createdById, notes: `Created from accepted offer ${offer.reference}` } });
    const talentRole = await tx.role.findUnique({ where: { key: 'TALENT' }, select: { id: true } }); if (talentRole) { const existing = await tx.organisationMembership.findUnique({ where: { organisationId_userId: { organisationId: offer.organisationId, userId: profile.userId } } }); if (!existing) await tx.organisationMembership.create({ data: { organisationId: offer.organisationId, userId: profile.userId, roleId: talentRole.id, status: 'ACTIVE', joinedAt: now } }); }
    await emitEvent(tx, { eventKey: EVENT_KEYS.OFFER_RESPONDED, aggregateType: 'Offer', aggregateId: offerId, organisationId: offer.organisationId, payload: { offerId, applicationId: offer.applicationId, talentProfileId: profile.id, organisationId: offer.organisationId } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.PLACEMENT_CREATED, aggregateType: 'Placement', aggregateId: placement.id, organisationId: offer.organisationId, payload: { placementId: placement.id, staffAssignmentId: staffAssignment.id, talentProfileId: profile.id, organisationId: offer.organisationId } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.STAFF_ASSIGNMENT_STARTED, aggregateType: 'StaffAssignment', aggregateId: staffAssignment.id, organisationId: offer.organisationId, payload: { staffAssignmentId: staffAssignment.id, placementId: placement.id, organisationId: offer.organisationId } });
    await emitEvent(tx, { eventKey: EVENT_KEYS.PAY_AGREEMENT_CREATED, aggregateType: 'PayAgreement', aggregateId: payAgreement.id, organisationId: offer.organisationId, payload: { payAgreementId: payAgreement.id, staffAssignmentId: staffAssignment.id, organisationId: offer.organisationId } });
    await recordAudit({ action: 'STATUS_CHANGE', resourceType: 'Offer', resourceId: offerId, organisationId: offer.organisationId, actorId: auth.userId, summary: 'Offer accepted and placement created' }, tx);
    return { offer: updated, placement, staffAssignment, payAgreement };
  });
  if (result.placement) invalidateUser(profile.userId); return result;
}
